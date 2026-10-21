// A small, reusable set of Google Slides files that previews cycle through, so a
// preview replaces an old one instead of adding another file to Drive.
//
// Pool files live in one Drive folder made by Harness Slides for the signed-in
// account. Each preview takes the least recently used file and replaces its
// contents with a Drive media upload, which converts the PPTX in place. If Drive
// refuses that, a new converted file takes the slot and the old one goes to the
// Drive trash (never permanent deletion). The machine-local state records the
// files, a generation counter per file and short leases, so two previews never
// take the same file at once and a receipt for a replaced preview is refused.
import {readFile,writeFile,mkdir,rename,lstat,open,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {request,checkDriveAccess,multipartPptx} from '../google-drive-deck.mjs';
import {refuse} from './refusals.mjs';

export const poolFolderName='Harness Slides previews';
export const poolFileName=slot=>`Harness Slides preview ${slot}`;
export const defaultPoolSize=4;
export const replacedMessage='That preview has been replaced by a newer one; preview again.';
const slidesType='application/vnd.google-apps.presentation',folderType='application/vnd.google-apps.folder';
const idPattern=/^[A-Za-z0-9_-]+$/;
const folderUrl=id=>`https://drive.google.com/drive/folders/${id}`,fileUrl=id=>`https://docs.google.com/presentation/d/${id}/edit`;

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
// The lock only covers reading and writing the state, plus making the folder on first use.
async function withState(deps,change){
  const dir=stateDir(deps),lockPath=join(dir,'state.lock'),now=deps.now??Date.now,sleep=deps.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
  await privateDir(dir);
  const deadline=now()+(deps.lockWaitMs??30_000);let lock;
  while(!lock){
    lock=await open(lockPath,'wx',0o600).catch(error=>{if(error.code!=='EEXIST')throw error;return null;});
    if(lock)break;
    const holder=await readFile(lockPath,'utf8').then(JSON.parse,()=>null),age=await lstat(lockPath).then(x=>Date.now()-x.mtimeMs,()=>0);
    // A lock left by a stopped process, or older than two minutes, is stale. One not yet written is given ten seconds.
    if(holder?!alive(holder.pid)||now()-holder.at>120_000:age>10_000){await rm(lockPath,{force:true});continue;}
    if(now()>deadline)throw refuse('Another preview is updating the preview pool state; retry when it finishes',{code:'provider-failed',provider:'google'});
    await sleep(100);
  }
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid,at:now()}));
    const state=await readState(dir),result=await change(state);
    const temporary=join(dir,`state.${randomUUID()}.tmp`);await writeFile(temporary,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,join(dir,'state.json'));
    return result;
  }finally{await lock.close();await rm(lockPath,{force:true});}
}
const poolFor=(state,account)=>{const pool=state.pools[account]??={folderId:null,slots:{},retired:{}};pool.slots??={};pool.retired??={};return pool;};
const leased=(slot,now)=>slot?.lease&&slot.lease.until>now;

// The state as it is now: which pool file shows which generation. Read-only and local.
export async function poolState(deps={}){return readState(stateDir(deps));}
// Whether a preview's Drive file still shows that preview. A remote outside the pool always does.
export async function poolRemoteCurrent(remote,deps={}){
  if(!remote?.pool)return true;
  const state=await readState(stateDir(deps)).catch(()=>empty());
  return Object.values(state.pools).some(pool=>Object.values(pool.slots??{}).some(s=>s.fileId===remote.fileId&&s.generation===remote.pool.generation));
}
// Refuse a receipt whose pool file now shows a newer preview. Local state only.
export async function assertReceiptCurrent(value,deps={}){
  const receipt=parseReceipt(value);if(receipt?.generation===undefined)return;
  const state=await readState(stateDir(deps)),slots=Object.values(state.pools).flatMap(p=>Object.values(p.slots??{}));
  const slot=slots.find(s=>s.fileId===receipt.fileId),retired=Object.values(state.pools).some(p=>p.retired?.[receipt.fileId]);
  if(!slot&&!retired)throw refuse(`${receipt.fileId} is not a preview pool file on this computer; omit --file-id and the pool picks a file`,{code:'input-invalid'});
  if(!slot||slot.generation!==receipt.generation)throw refuse(replacedMessage,{code:'preview-replaced',provider:'google'});
}

export async function poolStatus(deps={}){
  const state=await poolState(deps);
  return {state:join(stateDir(deps),'state.json'),pools:Object.entries(state.pools).map(([account,pool])=>({account,folder:pool.folderId?{id:pool.folderId,url:folderUrl(pool.folderId),name:poolFolderName}:null,
    files:Object.entries(pool.slots).sort((a,b)=>a[0]-b[0]).filter(([,s])=>s.fileId).map(([slot,s])=>({slot:Number(slot),name:poolFileName(slot),fileId:s.fileId,url:fileUrl(s.fileId),generation:s.generation,receipt:receiptOf(s.fileId,s.generation),lastUsed:s.lastUsed?new Date(s.lastUsed).toISOString():null,route:s.route??null,inUse:Boolean(leased(s,Date.now()))}))}))};
}

async function json(url,options,deps){return (await request(url,options,deps)).json();}
async function metadata(fileId,deps){
  try{return await json(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,name,mimeType,trashed,parents,appProperties`,{},deps);}
  catch(error){if(/HTTP 404/.test(error.message))return null;throw error;}
}
async function search(q,deps){
  const url=new URL('https://www.googleapis.com/drive/v3/files');url.searchParams.set('q',q);url.searchParams.set('fields','files(id,name,mimeType,parents,appProperties)');url.searchParams.set('spaces','drive');
  return (await json(url,{},deps)).files??[];
}
// The folder Harness Slides made, found by its marker, else made now. Never someone's folder of the same name.
async function ensureFolder(account,deps){
  return withState(deps,async state=>{
    const pool=poolFor(state,account);
    if(pool.folderId){const folder=await metadata(pool.folderId,deps);if(folder&&!folder.trashed&&folder.mimeType===folderType)return pool.folderId;}
    const found=(await search(`mimeType='${folderType}' and trashed=false and 'me' in owners and appProperties has { key='harnessPreviewPool' and value='1' }`,deps))[0];
    const folder=found??await json('https://www.googleapis.com/drive/v3/files?fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:poolFolderName,mimeType:folderType,appProperties:{harnessPreviewPool:'1'}})},deps);
    if(!folder?.id||!idPattern.test(folder.id))throw new Error('Drive did not confirm the preview pool folder. Inspect Drive before retrying.');
    pool.folderId=folder.id;return folder.id;
  });
}
// A pool file is used only while it keeps its pool name, marker and folder. Renaming or moving it keeps it out of the pool.
const isPoolFile=(file,slot,folderId)=>file&&!file.trashed&&file.mimeType===slidesType&&file.name===poolFileName(slot)&&file.appProperties?.harnessPreviewPoolSlot===String(slot)&&(!folderId||file.parents?.includes(folderId));
async function createFile(bytes,slot,folderId,deps){
  const {body,contentType}=multipartPptx(bytes,{name:poolFileName(slot),mimeType:slidesType,parents:[folderId],appProperties:{harnessPreviewPoolSlot:String(slot)}});
  let created;
  try{created=await json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType',{method:'POST',headers:{'Content-Type':contentType},body},deps);}
  catch(error){throw new Error(`${error.message} Inspect the ${poolFolderName} folder in Drive before retrying.`,{cause:error});}
  if(!created?.id||!idPattern.test(created.id)||created.mimeType!==slidesType)throw new Error('Upload response did not confirm a native Google Slides file. Inspect Drive before retrying.');
  return created.id;
}
// One Drive media upload onto the existing Slides file: Drive converts the PPTX in place and the ID stays.
async function replaceInPlace(fileId,bytes,deps){
  const updated=await json(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true&fields=id,mimeType`,{method:'PATCH',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation'},body:bytes},deps);
  if(updated?.id!==fileId||updated.mimeType!==slidesType)throw new Error('Drive did not confirm the in-place conversion');
}

// Put FILE into a pool file and run render(remote) while the file is leased to this preview.
export async function poolPreview({file,size,fileId,render},deps={}){
  if(!file?.toLowerCase().endsWith('.pptx'))throw new Error('Input must be a .pptx path.');
  const bytes=await readFile(file);
  if(!(bytes.length>=4&&bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))))throw new Error('Input is not a PPTX ZIP.');
  size=poolSize(size);const receipt=parseReceipt(fileId),now=deps.now??Date.now,sleep=deps.sleep??(ms=>new Promise(r=>setTimeout(r,ms)));
  const {account}=await checkDriveAccess(deps),token=randomUUID(),leaseMs=deps.leaseMs??15*60_000,deadline=now()+(deps.waitMs??10*60_000);
  let picked;
  while(!picked){
    picked=await withState(deps,state=>{
      const pool=poolFor(state,account),t=now();let chosen;
      if(receipt?.generation!==undefined){
        // A receipt asks for its own file again, and only while that file still shows its preview.
        const entry=Object.entries(pool.slots).find(([,s])=>s.fileId===receipt.fileId);
        if(!entry)throw pool.retired[receipt.fileId]?refuse(replacedMessage,{code:'preview-replaced',provider:'google'}):refuse(`${receipt.fileId} is not a preview pool file for ${account}; omit --file-id and the pool picks a file`,{code:'input-invalid'});
        if(entry[1].generation!==receipt.generation)throw refuse(replacedMessage,{code:'preview-replaced',provider:'google'});
        chosen=leased(entry[1],t)?null:entry;
      }else{
        for(let n=1;n<=size;n++)pool.slots[n]??={fileId:null,generation:0,lastUsed:0};
        chosen=Array.from({length:size},(_,i)=>[String(i+1),pool.slots[i+1]]).filter(([,s])=>!leased(s,t)).sort((a,b)=>(a[1].lastUsed??0)-(b[1].lastUsed??0)||a[0]-b[0])[0]??null;
      }
      if(!chosen)return null;
      chosen[1].lease={token,until:t+leaseMs};
      return {slot:Number(chosen[0]),fileId:chosen[1].fileId,generation:chosen[1].generation??0,folderId:pool.folderId};
    });
    if(picked)break;
    if(now()>deadline)throw refuse(receipt?.generation!==undefined?'That preview pool file is in use by another preview; retry when it finishes':`All ${size} preview pool files are in use by other previews; retry when one finishes, raise --pool-size, or use --new-preview-file`,{code:'provider-failed',provider:'google'});
    await sleep(deps.pollMs??1000);
  }
  let id=null,route=null,replaced=false,retired=null,trash=null;
  try{
    let current=picked.fileId?await metadata(picked.fileId,deps):null;
    let folderId=picked.folderId;
    if(current&&!isPoolFile(current,picked.slot,folderId))current=null;
    if(!current){
      folderId=await ensureFolder(account,deps);
      // A pool file this computer has no record of, for example after its state was moved aside, is adopted rather than duplicated.
      if(!picked.fileId){const found=(await search(`'${folderId}' in parents and trashed=false and mimeType='${slidesType}' and appProperties has { key='harnessPreviewPoolSlot' and value='${picked.slot}' }`,deps)).find(f=>isPoolFile(f,picked.slot,folderId));if(found)current=found;}
    }
    if(current){
      try{await replaceInPlace(current.id,bytes,deps);id=current.id;route='drive-update';}
      catch{
        // Drive would not convert in place: a new converted file takes the slot, and the old one goes to the trash.
        id=await createFile(bytes,picked.slot,folderId,deps);route='replace-and-trash';retired=current.id;
        try{await request(`https://www.googleapis.com/drive/v3/files/${current.id}?supportsAllDrives=true&fields=id,trashed`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})},deps);trash='trashed';}
        catch{trash='kept: Drive refused to move it to the trash';}
      }
    }else{id=await createFile(bytes,picked.slot,folderId,deps);route='created';if(picked.fileId)retired=picked.fileId;}
    replaced=true;
    const generation=picked.generation+1;
    const remote={id,name:poolFileName(picked.slot),url:fileUrl(id),pool:{slot:picked.slot,size,generation,receipt:receiptOf(id,generation),route,folder:{id:folderId,url:folderUrl(folderId),name:poolFolderName},...(trash?{previousFile:{fileId:retired,status:trash}}:{})}};
    if(render)await render(remote);
    return remote;
  }finally{
    await withState(deps,state=>{
      const pool=poolFor(state,account),slot=pool.slots[picked.slot];
      if(!slot||slot.lease?.token!==token)return;
      slot.lease=null;
      // Once the contents changed, the old receipt no longer matches, even if the render then failed.
      if(replaced){
        if(retired&&retired!==id){pool.retired[retired]={slot:picked.slot,generation:slot.generation};const old=Object.keys(pool.retired);for(const key of old.slice(0,Math.max(0,old.length-50)))delete pool.retired[key];}
        Object.assign(slot,{fileId:id,generation:picked.generation+1,lastUsed:now(),route});
      }
    }).catch(()=>{/* The lease expires on its own; the preview's own error matters more. */});
  }
}
