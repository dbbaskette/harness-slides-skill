// A small, reusable set of Google Slides files that previews cycle through, so a
// preview replaces an old one instead of adding another file to Drive.
//
// Pool files live in one Drive folder made by Harness Slides for the signed-in
// account. Each preview takes the least recently used file and replaces its
// contents with one Drive media upload that converts the PPTX in place, after
// stamping the file with its new generation. If Drive refuses that, a new
// converted file takes the slot and the old one goes to the Drive trash (never
// permanent deletion). The upload is the preview's last write; after the render is
// read back, the file's modifiedTime must still be the upload's, so a preview from
// another computer cannot slip its pixels in. (Drive's version number is not used:
// it was seen to rise on its own, with no write and modifiedTime unchanged.)
//
// The machine-local state records the files, a generation per file and leases.
// Leases are per computer: they keep previews on this computer off each other's
// files; the modifiedTime check catches another computer.
import {readFile,writeFile,mkdir,rename,lstat,open,rm,link} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir,hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {request,checkDriveAccess,multipartPptx,gcloudToken} from '../google-drive-deck.mjs';
import {refuse} from './refusals.mjs';

export const poolFolderName='Harness Slides previews';
export const poolFileName=slot=>`Harness Slides preview ${slot}`;
export const defaultPoolSize=4;
export const replacedMessage='That preview has been replaced by a newer one; preview again.';
export const changedMessage='The preview deck changed while it was being read; preview again.';
const slidesType='application/vnd.google-apps.presentation',folderType='application/vnd.google-apps.folder';
const idPattern=/^[A-Za-z0-9_-]+$/;
const folderUrl=id=>`https://drive.google.com/drive/folders/${id}`,fileUrl=id=>`https://docs.google.com/presentation/d/${id}/edit`;
const replaced=()=>refuse(replacedMessage,{code:'preview-replaced',provider:'google'});

// --pool-size, else HARNESS_PREVIEW_POOL_SIZE, else 4.
export function poolSize(value){
  const raw=value??process.env.HARNESS_PREVIEW_POOL_SIZE??defaultPoolSize,size=Number(raw);
  if(!Number.isInteger(size)||size<1||size>20)throw refuse(`The preview pool size must be a whole number from 1 to 20 (got ${raw})`,{code:'input-invalid'});
  return size;
}
// A receipt is FILE_ID:GENERATION. A bare ID carries no generation and only names a file.
export function parseReceipt(value){
  if(value==null)return null;
  const [fileId,generation,...rest]=String(value).split(':');
  if(rest.length||!idPattern.test(fileId)||(generation!==undefined&&!/^\d+$/.test(generation)))throw refuse('--file-id takes a Google Drive ID, or a preview pool receipt FILE_ID:GENERATION',{code:'input-invalid'});
  return {fileId,...(generation!==undefined?{generation:Number(generation)}:{})};
}
export const receiptOf=(fileId,generation)=>`${fileId}:${generation}`;

function stateDir(deps){return resolve(deps.poolState??process.env.HARNESS_PREVIEW_POOL_STATE??join(homedir(),'.local','share','harness-slides','preview-pool'));}
const empty=()=>({schema:1,pools:{}});
async function readState(dir){
  try{const state=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));if(state?.schema!==1||typeof state.pools!=='object')throw new Error('Unrecognized preview pool state');return state;}
  catch(error){if(error.code==='ENOENT')return empty();throw new Error(`The preview pool state at ${join(dir,'state.json')} is unreadable (${error.message}). Move it aside to start a new pool; the Drive files are kept.`);}
}
async function privateDir(dir){
  await mkdir(dir,{recursive:true,mode:0o700});const stat=await lstat(dir);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error('The preview pool state directory must be a private directory');
}
const alive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}};
const host=hostname();
// A stale lock is moved aside under a unique name before it is removed, so a lock another
// process made in the meantime is put back instead of being broken.
async function breakStale(lockPath,seen){
  const aside=`${lockPath}.${randomUUID()}.stale`;
  try{await rename(lockPath,aside);}catch(error){if(error.code==='ENOENT')return;throw error;}
  const moved=await readFile(aside,'utf8').catch(()=>null);
  if(moved!==seen)await link(aside,lockPath).catch(()=>{/* Another live lock is already back in place. */});
  await rm(aside,{force:true});
}
// The lock only covers reading and writing the state, and recording the folder on first use.
async function withState(deps,change){
  const dir=stateDir(deps),lockPath=join(dir,'state.lock'),now=deps.now??Date.now,sleep=deps.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
  await privateDir(dir);
  const deadline=now()+(deps.lockWaitMs??30_000);let lock;
  while(!lock){
    lock=await open(lockPath,'wx',0o600).catch(error=>{if(error.code!=='EEXIST')throw error;return null;});
    if(lock)break;
    const seen=await readFile(lockPath,'utf8').catch(()=>null),age=await lstat(lockPath).then(x=>Date.now()-x.mtimeMs,()=>0);
    let holder=null;try{holder=JSON.parse(seen);}catch{/* Not written yet. */}
    // A lock left by a stopped process, or older than two minutes, is stale. One not yet written is given ten seconds.
    if(seen!==null&&(holder?((holder.host??host)===host&&!alive(holder.pid))||Date.now()-holder.at>120_000:age>10_000)){await breakStale(lockPath,seen);continue;}
    if(now()>deadline)throw refuse('Another preview is updating the preview pool state; retry when it finishes',{code:'provider-failed',provider:'google'});
    await sleep(100);
  }
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid,host,at:Date.now()}));
    const state=await readState(dir),result=await change(state);
    const temporary=join(dir,`state.${randomUUID()}.tmp`);await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,join(dir,'state.json'));
    return result;
  }finally{await lock.close();await rm(lockPath,{force:true});}
}
const poolFor=(state,account)=>{const pool=state.pools[account]??={folderId:null,slots:{},retired:{}};pool.slots??={};pool.retired??={};return pool;};
// A lease ends at its deadline, or as soon as the process on this computer that holds it has stopped.
const leased=(slot,now)=>Boolean(slot?.lease&&slot.lease.until>now&&(slot.lease.host!==host||alive(slot.lease.pid)));

// The state as it is now: which pool file shows which generation. Read-only and local.
export async function poolState(deps={}){return readState(stateDir(deps));}
// Whether a preview's Drive file still shows that preview, as far as this computer knows. A remote outside the pool always does.
export async function poolRemoteCurrent(remote,deps={}){
  if(!remote?.pool)return true;
  const state=await readState(stateDir(deps)).catch(()=>empty());
  return Object.values(state.pools).some(pool=>Object.values(pool.slots??{}).some(s=>s.fileId===remote.fileId&&s.generation===remote.pool.generation));
}
// Reads are repeated after a Drive server error; a write says for itself whether it may be.
async function json(url,options,deps){const read=async()=>(await request(url,options,deps)).json();return options?.method?read():patiently(read,deps);}
const fileFields='id,name,mimeType,trashed,parents,appProperties,modifiedTime';
async function metadata(fileId,deps){
  try{return await json(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=${fileFields}`,{},deps);}
  catch(error){if(/HTTP 404/.test(error.message))return null;throw error;}
}
// A receipt this computer has no record of is judged by Drive: a pool file's receipt has been replaced; anything else is not a receipt.
async function unknownReceipt(receipt,deps){
  const file=await metadata(receipt.fileId,deps);
  if(file?.appProperties?.harnessPreviewPoolSlot)throw replaced();
  throw refuse(`${receipt.fileId} is not a preview pool file; omit --file-id and the pool picks a file`,{code:'input-invalid'});
}
// Refuse a receipt whose pool file now shows a newer preview, before anything is rendered.
export async function assertReceiptCurrent(value,deps={}){
  const receipt=parseReceipt(value);if(receipt?.generation===undefined)return;
  const state=await readState(stateDir(deps)),slots=Object.values(state.pools).flatMap(p=>Object.values(p.slots??{}));
  const slot=slots.find(s=>s.fileId===receipt.fileId),retired=Object.values(state.pools).some(p=>p.retired?.[receipt.fileId]);
  if(!slot&&!retired)return unknownReceipt(receipt,deps);
  if(!slot||slot.generation!==receipt.generation)throw replaced();
}

export async function poolStatus(deps={}){
  const state=await poolState(deps);
  return {state:join(stateDir(deps),'state.json'),pools:Object.entries(state.pools).map(([account,pool])=>({account,folder:pool.folderId?{id:pool.folderId,url:folderUrl(pool.folderId),name:poolFolderName}:null,
    files:Object.entries(pool.slots).sort((a,b)=>a[0]-b[0]).filter(([,s])=>s.fileId).map(([slot,s])=>({slot:Number(slot),name:poolFileName(slot),fileId:s.fileId,url:fileUrl(s.fileId),generation:s.generation,receipt:receiptOf(s.fileId,s.generation),lastUsed:s.lastUsed?new Date(s.lastUsed).toISOString():null,route:s.route??null,inUse:leased(s,Date.now())}))}))};
}

async function search(q,deps){
  const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',q);url.searchParams.set('fields',`files(${fileFields})`);url.searchParams.set('spaces','drive');
  return (await json(url,{},deps)).files??[];
}
// The folder Harness Slides made, found by its marker, else made now. Never someone's folder of the same name.
// Drive is looked up outside the state lock; only recording the folder, and making it on first use, happen under it.
async function ensureFolder(account,deps){
  const known=(await poolState(deps)).pools[account]?.folderId;
  if(known){const folder=await metadata(known,deps);if(folder&&!folder.trashed&&folder.mimeType===folderType)return known;}
  const found=(await search(`mimeType='${folderType}' and trashed=false and 'me' in owners and appProperties has { key='harnessPreviewPool' and value='1' }`,deps))[0]?.id??null;
  return withState(deps,async state=>{
    const pool=poolFor(state,account);
    if(pool.folderId&&pool.folderId!==known)return pool.folderId;
    const folder=found??(await json('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:poolFolderName,mimeType:folderType,appProperties:{harnessPreviewPool:'1'}})},deps)).id;
    if(!folder||!idPattern.test(folder))throw new Error('Drive did not confirm the preview pool folder. Inspect Drive before retrying.');
    pool.folderId=folder;return folder;
  });
}
// A pool file is used only while it keeps its pool name, marker and folder. Renaming or moving it keeps it out of the pool.
const isPoolFile=(file,slot,folderId)=>Boolean(file&&!file.trashed&&file.mimeType===slidesType&&file.name===poolFileName(slot)&&file.appProperties?.harnessPreviewPoolSlot===String(slot)&&(!folderId||file.parents?.includes(folderId)));
const confirmed=(file,id)=>file?.id&&idPattern.test(file.id)&&(!id||file.id===id)&&file.mimeType===slidesType&&file.modifiedTime;
async function createFile(bytes,slot,folderId,properties,deps){
  const {body,contentType}=multipartPptx(bytes,{name:poolFileName(slot),mimeType:slidesType,parents:[folderId],appProperties:properties});
  let created;
  try{created=await json(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${fileFields}`,{method:'POST',headers:{'Content-Type':contentType},body},deps);}
  catch(error){throw new Error(`${error.message} Inspect the ${poolFolderName} folder in Drive before retrying.`,{cause:error});}
  if(!confirmed(created))throw new Error('Upload response did not confirm a native Google Slides file. Inspect Drive before retrying.');
  return created;
}
// Drive answers some requests with a server error that a moment later succeeds. Only idempotent writes are repeated.
async function patiently(write,deps){
  for(let attempt=1;;attempt++){
    try{return await write();}
    catch(error){if(attempt>=(deps.attempts??3)||!/HTTP 5\d\d/.test(error.message))throw error;await (deps.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))((deps.retryMs??1500)*attempt);}
  }
}
// The generation is stamped first and the contents uploaded last, so the upload's modifiedTime marks the last write.
// Drive converts the PPTX in place and the ID stays.
async function replaceInPlace(fileId,bytes,properties,deps){
  await patiently(()=>json(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:properties})},deps),deps);
  const updated=await patiently(()=>json(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true&fields=${fileFields}`,{method:'PATCH',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'},body:bytes},deps),deps);
  if(!confirmed(updated,fileId))throw new Error('Drive did not confirm the in-place conversion');
  return updated;
}
// The state must hear how a preview ended. Retry the release patiently; say so if it still fails.
async function release(deps,change){
  for(let attempt=1;;attempt++){
    try{return await withState({...deps,lockWaitMs:deps.releaseWaitMs??120_000},change);}
    catch(error){if(attempt>=3){process.emitWarning(`Harness Slides could not record the end of a preview in the preview pool state (${error.message}). Its generation was already raised, so older receipts stay refused.`);return;}}
  }
}

// Put FILE into a pool file and run render(remote, deps) while the file is leased to this preview.
export async function poolPreview({file,size,fileId,render},deps={}){
  if(!file?.toLowerCase().endsWith('.pptx'))throw new Error('Input must be a .pptx path.');
  const bytes=await readFile(file);
  if(!(bytes.length>=4&&bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))))throw new Error('Input is not a PPTX ZIP.');
  size=poolSize(size);const receipt=parseReceipt(fileId),now=deps.now??Date.now,sleep=deps.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
  // One token for the whole preview: a sign-in changed halfway cannot mix two accounts' pools.
  const accessToken=await (deps.tokenProvider??gcloudToken)();
  if(!accessToken)throw new Error('No gcloud access token is available. Run gcloud auth login --enable-gdrive-access --force.');
  const g={...deps,tokenProvider:async()=>accessToken};
  const {account}=await checkDriveAccess(g),token=randomUUID(),leaseMs=deps.leaseMs??15*60_000,deadline=now()+(deps.waitMs??10*60_000);
  if(receipt?.generation!==undefined){const pool=(await poolState(g)).pools[account];if(!Object.values(pool?.slots??{}).some(s=>s.fileId===receipt.fileId)&&!pool?.retired?.[receipt.fileId])await unknownReceipt(receipt,g);}
  let picked;
  while(!picked){
    picked=await withState(g,state=>{
      const pool=poolFor(state,account),t=now();let chosen;
      if(receipt?.generation!==undefined){
        // A receipt asks for its own file again, and only while that file still shows its preview.
        const entry=Object.entries(pool.slots).find(([,s])=>s.fileId===receipt.fileId);
        if(!entry||entry[1].generation!==receipt.generation)throw replaced();
        chosen=leased(entry[1],t)?null:entry;
      }else{
        for(let n=1;n<=size;n++)pool.slots[n]??={fileId:null,generation:0,lastUsed:0};
        chosen=Array.from({length:size},(_,i)=>[String(i+1),pool.slots[i+1]]).filter(([,s])=>!leased(s,t)).sort((a,b)=>(a[1].lastUsed??0)-(b[1].lastUsed??0)||a[0]-b[0])[0]??null;
      }
      if(!chosen)return null;
      // The generation goes up now, before Drive is touched: whatever happens next, older receipts no longer match.
      chosen[1].generation=(chosen[1].generation??0)+1;chosen[1].lease={token,until:t+leaseMs,pid:process.pid,host};
      return {slot:Number(chosen[0]),fileId:chosen[1].fileId,generation:chosen[1].generation,folderId:pool.folderId};
    });
    if(picked)break;
    if(now()>deadline)throw refuse(receipt?.generation!==undefined?'That preview pool file is in use by another preview; retry when it finishes':`All ${size} preview pool files are in use by other previews; retry when one finishes, raise --pool-size, or use --new-preview-file`,{code:'provider-failed',provider:'google'});
    await sleep(deps.pollMs??1000);
  }
  let id=null,route=null,retired=null,trash=null,generation=picked.generation,modified=null;
  try{
    let current=picked.fileId?await metadata(picked.fileId,g):null,folderId=picked.folderId;
    if(current&&!isPoolFile(current,picked.slot,folderId))current=null;
    // Another computer may have used this file since: its generation in Drive is checked against the receipt and continued.
    if(receipt?.generation!==undefined&&(!current||(current.appProperties?.harnessPreviewGeneration!==undefined&&Number(current.appProperties.harnessPreviewGeneration)!==receipt.generation)))throw replaced();
    if(!current){
      folderId=await ensureFolder(account,g);
      // A pool file this computer has no record of, for example after its state was moved aside, is adopted rather than duplicated.
      if(!picked.fileId){const found=(await search(`'${folderId}' in parents and trashed=false and mimeType='${slidesType}' and appProperties has { key='harnessPreviewPoolSlot' and value='${picked.slot}' }`,g)).find(f=>isPoolFile(f,picked.slot,folderId));if(found)current=found;}
    }
    generation=Math.max(generation,(Number(current?.appProperties?.harnessPreviewGeneration)||0)+1);
    const properties={harnessPreviewPoolSlot:String(picked.slot),harnessPreviewGeneration:String(generation)};
    let written;
    if(current){
      try{written=await replaceInPlace(current.id,bytes,properties,g);route='drive-update';}
      catch{
        // Drive would not convert in place: a new converted file takes the slot, and the old one goes to the trash.
        written=await createFile(bytes,picked.slot,folderId,properties,g);route='replace-and-trash';retired=current.id;
        try{await request(`https://www.googleapis.com/drive/v3/files/${current.id}?supportsAllDrives=true&fields=id,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})},g);trash='trashed';}
        catch{trash='kept: Drive refused to move it to the trash';}
      }
    }else{written=await createFile(bytes,picked.slot,folderId,properties,g);route='created';if(picked.fileId)retired=picked.fileId;}
    id=written.id;modified=written.modifiedTime;
    const remote={id,name:poolFileName(picked.slot),url:fileUrl(id),pool:{slot:picked.slot,size,generation,receipt:receiptOf(id,generation),route,modifiedTime:modified,folder:{id:folderId,url:folderUrl(folderId),name:poolFolderName},...(trash?{previousFile:{fileId:retired,status:trash}}:{})}};
    if(render){
      await render(remote,g);
      // What was read back must still be this preview's upload: nothing written to the file since.
      const after=await patiently(()=>metadata(id,g),g);
      if(after?.modifiedTime!==modified||after.trashed)throw refuse(changedMessage,{code:'provider-failed',provider:'google'});
    }
    return remote;
  }finally{
    await release(g,state=>{
      const pool=poolFor(state,account),slot=pool.slots[picked.slot];
      if(!slot)return;
      if(slot.lease?.token===token)slot.lease=null;
      slot.generation=Math.max(slot.generation??0,generation);
      if(id&&slot.fileId===picked.fileId){
        if(retired&&retired!==id)pool.retired[retired]={slot:picked.slot,generation:picked.generation-1};
        Object.assign(slot,{fileId:id,lastUsed:now(),route,modifiedTime:modified});
      }
    });
  }
}
