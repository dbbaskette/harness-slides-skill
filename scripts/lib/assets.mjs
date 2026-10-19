// The project asset manifest: every supplied image, brand icon and generated artwork a deck may use, under a stable ID,
// with its hash, alt text, source and any usage restrictions. Paths are kept relative to the project, so the record survives a move.
import {readFile,writeFile,mkdir,rename,rm,open,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,dirname,basename,extname,isAbsolute,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hash,regularInside} from './common.mjs';
import {refuse,refuseAll} from './refusals.mjs';

export const manifestPath='.harness-slides/assets.json';
export const assetKinds=['icon','supplied','generated','screenshot','chart'];
const fileKinds=['supplied','screenshot','chart'],formats={png:'.png',jpg:'.jpg',gif:'.gif'};
const idPattern=/^\w[\w.:-]{0,127}$/,text=v=>typeof v==='string'&&v.trim()!==''&&v.length<=2000;
const fileName=id=>id.replaceAll(':','_');
const posix=path=>path.split(sep).join('/'),outside=within=>isAbsolute(within)||within.split(sep)[0]==='..';
const now=()=>new Date().toISOString().slice(0,19)+'Z';

async function root(project){
  if(!project)throw new Error('Provide --project DIR, the project that holds the asset manifest');
  const path=await realpath(resolve(project)).catch(()=>{throw refuse(`No project directory at ${project}`,{code:'input-missing'});});
  if(!(await lstat(path)).isDirectory())throw refuse(`${project} is not a directory`,{code:'input-invalid'});
  return path;
}
// A recorded path is relative, normalized and inside the project. A manifest that says otherwise was edited by hand.
const relativeOk=p=>typeof p==='string'&&p!==''&&!isAbsolute(p)&&!p.includes('\\')&&p.split('/').every(part=>part&&part!=='.'&&part!=='..');
function validate(m){
  const bad=detail=>refuse(`The asset manifest ${manifestPath} is not valid: ${detail}. Restore it, or record the assets again`,{code:'input-invalid',next:'Restore .harness-slides/assets.json, or remove it and record the assets again'});
  if(!m||m.schema!==1||m.tool!=='harness-slides-assets'||!Array.isArray(m.assets))throw bad('it is not a Harness Slides asset manifest');
  const ids=new Set();
  for(const a of m.assets){
    if(!a||!idPattern.test(a.assetId??'')||ids.has(a.assetId)||!assetKinds.includes(a.kind))throw bad(`entry ${a?.assetId} needs a unique asset ID and a known kind`);
    ids.add(a.assetId);
    if(a.kind!=='icon'&&!relativeOk(a.path))throw bad(`${a.assetId} has a path outside the project (${a.path})`);
    if(a.kind==='generated'&&!relativeOk(a.provenance?.metadata))throw bad(`${a.assetId} has a metadata path outside the project`);
  }
  return m;
}
async function readManifest(base){
  let bytes;
  try{bytes=await readFile(await regularInside(base,manifestPath),'utf8');}
  catch(error){if(error.code==='ENOENT')return {schema:1,tool:'harness-slides-assets',assets:[]};throw refuse(`The asset manifest must be a regular file inside the project (${error.message})`,{code:'input-invalid'});}
  try{return validate(JSON.parse(bytes));}catch(error){if(error instanceof SyntaxError)throw refuse(`The asset manifest ${manifestPath} is not JSON`,{code:'input-invalid'});throw error;}
}
// One writer at a time; a second waits briefly, then is told what holds it.
async function update(base,change){
  const dir=join(base,'.harness-slides');await mkdir(dir,{recursive:true,mode:0o700});
  const st=await lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())throw refuse('.harness-slides must be a real directory',{code:'input-invalid'});
  const lock=join(dir,'assets.lock');let handle;
  for(let tries=0;!handle;tries++){
    try{handle=await open(lock,'wx',0o600);}
    catch(error){if(error.code!=='EEXIST')throw error;if(tries>=60)throw refuse('Another asset command holds .harness-slides/assets.lock',{code:'assets-busy'});await new Promise(done=>setTimeout(done,50));}
  }
  try{
    const m=await readManifest(base),result=await change(m);
    if(result.status!=='unchanged'){
      const temp=join(dir,`${randomUUID()}.tmp`);
      try{await writeFile(temp,JSON.stringify(m,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,join(base,manifestPath));}finally{await rm(temp,{force:true});}
    }
    return {...result,manifest:manifestPath};
  }finally{await handle.close();await rm(lock,{force:true});}
}
// Keeps the recorded time when nothing else changed, so a repeat reports itself as unchanged.
function put(m,entry){
  const i=m.assets.findIndex(a=>a.assetId===entry.assetId),before=m.assets[i];
  if(before&&JSON.stringify({...before,recorded:0})===JSON.stringify({...entry,recorded:0}))return 'unchanged';
  if(i<0)m.assets.push(entry);else m.assets[i]=entry;return i<0?'recorded':'updated';
}
const conflict=(id,detail)=>refuse(`Asset ${id} is already recorded ${detail}; choose a new --id`,{code:'asset-conflict',asset:id});
async function image(bytes){
  try{const {imageSize}=await import('image-size'),{type,width,height}=imageSize(bytes);if(formats[type]&&width&&height)return {format:type,width,height};}catch{}
  return null;
}

export async function addSupplied({project,file,alt,source,restrictions,id,kind='supplied'}){
  if(!file)throw new Error('Provide the image file: assets add-supplied FILE --project DIR --alt TEXT --source TEXT');
  if(!text(alt)||!text(source))throw new Error('Provide --alt with what the image shows and --source with where it came from');
  if(restrictions!==undefined&&!text(restrictions))throw new Error('--restrictions is a sentence, or omitted');
  if(!fileKinds.includes(kind))throw new Error(`--kind is one of ${fileKinds.join('|')}`);
  const base=await root(project),real=await realpath(resolve(file)),bytes=await readFile(real),info=await image(bytes);
  if(!info)throw refuse(`${file} is not a PNG, JPEG or GIF image`,{code:'input-invalid'});
  const assetId=id??basename(real,extname(real)).replace(/[^\w.-]+/g,'-').replace(/^[^\w]+/,'').slice(0,128);
  if(!idPattern.test(assetId))throw refuse(`Asset ID ${assetId} needs letters, digits, _ . : or -, starting with a letter, digit or _`,{code:'input-invalid'});
  const within=relative(base,real),inside=!outside(within)&&!posix(within).startsWith('.harness-slides/');
  const path=inside?posix(within):`assets/supplied/${fileName(assetId)}${formats[info.format]}`,sha256=hash(bytes);
  return update(base,async m=>{
    const before=m.assets.find(a=>a.assetId===assetId);
    // Recording the same file again accepts its current bytes; any other file under this ID is a different asset.
    if(before&&(before.kind!==kind||before.path!==path||!inside&&before.sha256!==sha256))throw conflict(assetId,before.path===path?'with different bytes':`for ${before.path??before.ref}`);
    if(!inside){
      const target=join(base,...path.split('/'));await mkdir(dirname(target),{recursive:true,mode:0o700});
      for(let p=dirname(target);p!==base;p=dirname(p))if((await lstat(p)).isSymbolicLink())throw refuse(`${posix(relative(base,p))} is a link; managed assets stay in real directories`,{code:'input-invalid'});
      try{await writeFile(target,bytes,{flag:'wx',mode:0o600});}
      catch(error){if(error.code!=='EEXIST')throw error;if(hash(await readFile(await regularInside(base,path)))!==sha256)throw conflict(assetId,`: ${path} already holds a different file`);}
    }
    const entry={assetId,kind,path,sha256,alt,source,restrictions:restrictions??before?.restrictions??null,...info,ref:null,provenance:null,recorded:now()};
    return {status:put(m,entry),assetId,kind,path,sha256};
  });
}

// A brand icon by its stable library ID. With a brand, the ID is checked against the hashed icon index and its entry hashed.
export async function recordIcon({project,icon,id,alt,brand}){
  if(!icon||icon.length>80||!/^[\w.-]+$/.test(icon))throw new Error('Provide the stable icon ID from the brand icon search: assets icon ICON_ID --project DIR');
  if(alt!==undefined&&!text(alt))throw new Error('--alt is a short description, or omitted');
  const assetId=id??icon;if(!idPattern.test(assetId))throw refuse(`Asset ID ${assetId} needs letters, digits, _ . : or -`,{code:'input-invalid'});
  const base=await root(project);let found=null,provenance=null,sha256=null;
  if(brand){
    const contract=JSON.parse(await readFile(brand,'utf8')),{checkBrandSources}=await import('./brand-contract.mjs');await checkBrandSources(contract);
    found=await libraryEntry(contract,icon,assetId);
    sha256=hash(JSON.stringify(found.entry));provenance={brandRevision:contract.revision,brand:contract.identity?.id??null,label:found.entry.label??null,indexSha256:found.indexSha256};
  }
  const label=alt??found?.entry.label??null;
  return update(base,async m=>{
    const before=m.assets.find(a=>a.assetId===assetId);
    if(before&&(before.kind!=='icon'||before.ref!==icon))throw conflict(assetId,`for ${before.ref??before.path}`);
    const entry={assetId,kind:'icon',path:null,sha256:sha256??before?.sha256??null,alt:label??before?.alt??null,source:provenance?`Brand icon library (${provenance.brand})`:before?.source??'Brand icon library; not checked against a brand',
      restrictions:before?.restrictions??null,ref:icon,provenance:provenance??before?.provenance??null,recorded:now()};
    return {status:put(m,entry),assetId,kind:'icon',ref:icon,alt:entry.alt,checked:!!provenance};
  });
}
async function libraryEntry(contract,icon,assetId){
  const {checkIcons}=await import('./pptx-native.mjs');
  try{await checkIcons({icons:[{id:assetId,icon}]},contract);}catch(error){throw refuse(error.message,{code:'icon-unavailable',asset:assetId});}
  const index=contract.design.slides.icon.library.index;
  return {entry:JSON.parse(await readFile(index,'utf8')).entries.find(e=>e.id===icon),indexSha256:contract.sources.find(s=>s.path===index).sha256};
}

// images generate and download call this once the artwork is in the project. The request ID is the asset ID.
export async function registerGenerated({project,result,alt,slide}){
  const base=await root(project),local=async path=>{const within=relative(base,await realpath(path));if(outside(within))throw refuse(`${path} is outside the project`,{code:'input-invalid'});return posix(within);};
  const path=await local(result.path),metadata=await local(result.metadata),bytes=await readFile(result.path),sidecar=await readFile(result.metadata),m=JSON.parse(sidecar);
  if(hash(bytes)!==result.sha256||m.sha256!==result.sha256)throw refuse(`${path} does not match its sidecar`,{code:'asset-hash-changed',asset:result.id});
  if(alt!==undefined&&!text(alt))throw new Error('--alt is a short description, or omitted');
  return update(base,async manifest=>{
    const before=manifest.assets.find(a=>a.assetId===result.id);
    if(before&&(before.kind!=='generated'||before.path!==path||before.sha256!==result.sha256))throw conflict(result.id,`for ${before.path??before.ref}`);
    const entry={assetId:result.id,kind:'generated',path,sha256:result.sha256,alt:alt??before?.alt??null,source:`Generated by ${m.provider}${m.model?` (${m.model})`:''}, request ${m.requestId}`,
      restrictions:before?.restrictions??null,format:m.format??extname(path).slice(1),width:result.width??m.width,height:result.height??m.height,ref:null,
      provenance:{provider:m.provider,model:m.model??null,requestId:m.requestId,created:m.created??null,promptSha256:m.promptSha256??null,metadata,metadataSha256:hash(sidecar),slide:slide??before?.provenance?.slide??null},recorded:now()};
    return {status:put(manifest,entry),assetId:result.id};
  });
}

// Before a paid request: the request ID must be free in the manifest, or already this artwork, so the result can be recorded.
export async function checkGeneratable({project,id,output}){
  const base=project&&id&&output?await realpath(resolve(project)).catch(()=>null):null;if(!base)return; // the provider reports its own missing input
  const entry=(await readManifest(base)).assets.find(a=>a.assetId===id),stem=p=>p.replace(/\.[^./]*$/,'');
  if(entry&&(entry.kind!=='generated'||stem(entry.path)!==stem(posix(String(output)))))throw conflict(id,`for ${entry.path??entry.ref}`);
}

// What is wrong with one recorded asset now, or null. Read-only.
async function problemOf(base,a){
  const fileProblem=async(path,what)=>{
    let bytes;
    try{bytes=await readFile(await regularInside(base,path));}
    catch(error){if(error.code==='ENOENT')return {code:'asset-file-missing',detail:`Asset ${a.assetId}: ${what} ${path} is missing from the project`};return {code:'input-invalid',detail:`Asset ${a.assetId}: ${path} must be a regular file inside the project`};}
    return {bytes};
  };
  if(a.kind==='icon')return null;
  const file=await fileProblem(a.path,'file');if(file.code)return {...file,asset:a.assetId};
  if(hash(file.bytes)!==a.sha256)return {code:'asset-hash-changed',asset:a.assetId,detail:`Asset ${a.assetId}: ${a.path} changed since it was recorded`};
  if(a.kind==='generated'){
    const sidecar=await fileProblem(a.provenance.metadata,'sidecar');if(sidecar.code)return {...sidecar,asset:a.assetId};
    if(hash(sidecar.bytes)!==a.provenance.metadataSha256)return {code:'asset-hash-changed',asset:a.assetId,detail:`Asset ${a.assetId}: its sidecar ${a.provenance.metadata} changed since it was recorded`};
  }
  return null;
}
const states={'asset-file-missing':'file-missing','asset-hash-changed':'hash-changed','input-invalid':'invalid'};

// An icon candidate named by library ID, checked against the brand's icon index. An ID the library lacks is unresolved;
// one it holds only as a picture, or without a drawing, is unavailable. Each problem names the slide and the candidate.
export async function candidateIconProblems(slides,contract){
  const {checkIcons}=await import('./pptx-native.mjs'),problems=[];
  for(const s of slides)for(const c of s.asset?.candidates??[]){
    if(c.kind!=='icon'||c.refType!=='library-id')continue;
    try{await checkIcons({icons:[{id:c.assetId,icon:c.ref}]},contract);}
    catch(error){
      if(/unknown icon/.test(error.message))problems.push({code:'asset-unresolved',slide:s.id,asset:c.assetId,detail:`${s.id}: candidate ${c.assetId} names icon ${c.ref}, which is not in the brand icon library`,next:'Search the brand icon library for a current icon ID and propose it, or propose the fallback for approval'});
      else problems.push({code:'icon-unavailable',slide:s.id,asset:c.assetId,detail:`${s.id}: candidate ${c.assetId}: ${/hashed icon library/.test(error.message)?`icon ${c.ref} cannot be checked, because the brand contract names no hashed icon library and index`:error.message.replace(new RegExp(`^${c.assetId}: `),'')}`});
    }
  }
  return problems;
}

// Design candidates are matched to manifest entries by assetId. Those missing are pending; generated art also needs a provider.
// They are read from the stored plan, so a design waiting for approval and an approved one are checked alike.
async function candidates(base,m,designProject,env,contract){
  const {designPlan}=await import('./design-session.mjs'),{apiKey}=await import('./gemini-api.mjs'),plan=await designPlan(designProject);
  const resolved=[],pending=[],problems=[],brandProblems=contract?await candidateIconProblems(plan.slides,contract):[];
  for(const s of plan.slides)for(const c of s.asset?.candidates??[]){
    const entry=m.assets.find(a=>a.assetId===c.assetId),exact=c.kind==='icon'&&c.refType==='library-id',item={slide:s.id,assetId:c.assetId,kind:c.kind,concept:c.concept,...(exact?{ref:c.ref}:{})};
    if(entry&&entry.kind!==c.kind){problems.push({code:'asset-conflict',slide:s.id,asset:c.assetId,detail:`${s.id}: candidate ${c.assetId} is a ${c.kind}, but the manifest records a ${entry.kind}`,next:'Record the candidate under its own asset ID, or correct the candidate\'s kind in the proposal'});pending.push(item);continue;}
    if(entry&&exact&&entry.ref!==c.ref){problems.push({code:'asset-conflict',slide:s.id,asset:c.assetId,detail:`${s.id}: candidate ${c.assetId} names icon ${c.ref}, but the manifest records icon ${entry.ref}`,next:`Record icon ${c.ref} under another asset ID and use that, or propose icon ${entry.ref} for approval`});pending.push(item);continue;}
    if(entry){resolved.push(item);continue;}
    pending.push(item);
    const brandProblem=brandProblems.find(p=>p.slide===s.id&&p.asset===c.assetId);
    if(brandProblem)problems.push(brandProblem);
    else if(c.kind==='generated'&&!apiKey(env))problems.push({code:'provider-missing',slide:s.id,asset:c.assetId,provider:'gemini-api',detail:`${s.id}: candidate ${c.assetId} is generated art, and no Gemini API key is set to generate it`});
    else problems.push({code:'asset-unresolved',slide:s.id,asset:c.assetId,detail:`${s.id}: candidate ${c.assetId} (${c.kind}, ${c.concept}) is not in the project's asset manifest`,
      next:exact?`Record it with assets icon ${c.ref} --id ${c.assetId} --brand brand-contract.json`:c.kind==='icon'?'Record it with assets icon ICON_ID --id '+c.assetId:c.kind==='generated'?'Generate it with images generate once its slide is approved':'Record it with assets add-supplied FILE --id '+c.assetId});
  }
  return {resolved,pending,problems};
}

export async function assetStatus({project,'design-project':designProject},env=process.env){
  const base=await root(project),m=await readManifest(base),assets=[];
  for(const a of m.assets){const p=await problemOf(base,a);assets.push({...a,state:p?states[p.code]:'ok'});}
  const result={manifest:manifestPath,assets};
  if(designProject){const {resolved,pending}=await candidates(base,m,designProject,env);result.candidates={resolved,pending};}
  return result;
}
export async function checkAssets({project,'design-project':designProject,brand},env=process.env){
  const base=await root(project),m=await readManifest(base),problems=[];
  for(const a of m.assets){const p=await problemOf(base,a);if(p)problems.push(p);}
  let contract=null;
  if(brand){
    contract=JSON.parse(await readFile(brand,'utf8'));const {checkBrandSources}=await import('./brand-contract.mjs');await checkBrandSources(contract);
    for(const a of m.assets.filter(a=>a.kind==='icon')){
      let found;try{found=await libraryEntry(contract,a.ref,a.assetId);}catch(error){problems.push({...error.problem,detail:error.message});continue;}
      if(a.sha256&&hash(JSON.stringify(found.entry))!==a.sha256)problems.push({code:'asset-hash-changed',asset:a.assetId,detail:`Asset ${a.assetId}: icon ${a.ref} changed in the brand library since it was recorded`,next:'Look at the icon again, then record it with assets icon --brand'});
    }
  }
  let design=null;
  if(designProject){design=await candidates(base,m,designProject,env,contract);problems.push(...design.problems);}
  if(problems.length)throw refuseAll(problems.length===1?problems[0].detail:`${problems.length} asset problems:\n${problems.map(p=>p.detail).join('\n')}`,problems.map(p=>({...p,detail:p.detail})));
  return {status:'ready',manifest:manifestPath,assets:m.assets.length,...(design?{candidates:{resolved:design.resolved,pending:design.pending}}:{})};
}

// Compositions name an asset by ID: {type:image,asset}, a layout's picture:{asset}, or {type:icon,asset}. Each image is resolved
// to the project's file, with its recorded alt text when the composition gives none; each icon to its recorded library ID.
// Problems come back as composition lines, so they join the others. An icon that does not resolve is listed in unresolved.
export async function resolveCompositionAssets(comp,project){
  const uses=new Map(),icons=new Map(),unresolved=new Set(),problems=[],out=structuredClone(comp),wanted=[];
  const walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='image'&&n.asset!==undefined&&n.src===undefined)wanted.push({node:n,id:n.id,where:n.id});if(n.type==='icon'&&n.asset!==undefined&&n.icon===undefined)wanted.push({node:n,id:n.id,where:n.id,icon:true});for(const k of [...(Array.isArray(n.children)?n.children:[]),n.hub])walk(k);};
  for(const s of Array.isArray(out?.slides)?out.slides:[]){
    if(!s||typeof s!=='object')continue;walk(s.canvas);
    if(s.picture&&typeof s.picture==='object'&&s.picture.asset!==undefined&&s.picture.src===undefined)wanted.push({node:s.picture,id:`${s.id}_picture`,where:s.id});
  }
  if(!wanted.length)return {comp:out,uses,icons,unresolved,problems};
  const base=project?await root(project):null,m=base?await readManifest(base):null;
  for(const {node,id,where,icon} of wanted){
    const asset=node.asset,entry=m?.assets.find(a=>a.assetId===asset);let line=null;
    if(icon){
      if(typeof asset!=='string'||!asset)line=`${where}: asset must be an asset ID from assets status`;
      else if(!base)line=`${where}: icon asset ${asset} needs the project that records it; pass --asset-project DIR`;
      else if(!entry)line=`${where}: asset ${asset} is not in the project's asset manifest; record it with assets icon ICON_ID --id ${asset} --brand brand-contract.json`;
      else if(entry.kind!=='icon')line=`${where}: asset ${asset} is a ${entry.kind} image, not an icon; place it as an image node with asset ${asset}`;
      delete node.asset;
      // A stand-in ID keeps the node compiling, so the rest of the slide is still checked; the icon check skips it.
      if(line){problems.push(line);node.icon='unresolved-asset';unresolved.add(id);continue;}
      node.icon=entry.ref;icons.set(id,{assetId:asset,ref:entry.ref,sha256:entry.sha256});continue;
    }
    if(typeof asset!=='string'||!asset)line=`${where}: asset must be an asset ID from assets status`;
    else if(!base)line=`${where}: image asset ${asset} needs the project that records it; pass --asset-project DIR`;
    else if(!entry)line=`${where}: asset ${asset} is not in the project's asset manifest; record it with assets add-supplied or images generate`;
    else if(entry.kind==='icon')line=`${where}: asset ${asset} is a brand icon; place it as an icon node with asset ${asset}, or icon ${entry.ref}`;
    else{const p=await problemOf(base,entry);if(p)line=`${where}: asset ${asset} ${p.code==='asset-file-missing'?`file ${entry.path} is missing from the project`:p.code==='asset-hash-changed'?`file ${entry.path} changed since it was recorded`:`file ${entry.path} must be a regular file inside the project`}`;}
    const alt=node.alt??entry?.alt;delete node.asset;
    if(line){problems.push(line);node.src=`asset:${asset}`;node.alt=alt??'unresolved asset';continue;}
    if(alt===undefined||alt===null)problems.push(`${where}: asset ${asset} has no recorded alt text; give the image alt`);
    node.src=join(base,...entry.path.split('/'));node.alt=alt??'missing alt';
    uses.set(id,{assetId:asset,kind:entry.kind,path:node.src,source:entry.path,sha256:entry.sha256});
  }
  return {comp:out,uses,icons,unresolved,problems};
}
// An icon placed by asset ID that was checked against the brand when recorded must still be that index entry.
// Unknown and picture-only icons are left to the brand's icon check, which reports them for every icon alike.
export async function iconAssetProblems(icons,contract){
  const index=contract.design?.slides?.icon?.library?.index;if(!icons.size||!index)return [];
  let entries;try{entries=JSON.parse(await readFile(index,'utf8')).entries??[];}catch{return [];}
  const lines=[];
  for(const [id,use] of icons){const entry=entries.find(e=>e.id===use.ref);if(entry&&use.sha256&&hash(JSON.stringify(entry))!==use.sha256)lines.push(`${id}: asset ${use.assetId} (icon ${use.ref}) changed since it was recorded from the brand icon library; look at it, then record it again with assets icon --brand`);}
  return lines;
}

// The images of a compiled scene. Every local source and manifest asset is copied into
// OUTPUT/assets and named relatively, so the build and its previews resolve it wherever the project goes.
export async function placeImages(scene,{base,uses=new Map()}){
  const assets=[],copies=new Map();
  for(const s of scene.slides)for(const e of s.elements)if(e.type==='image'&&!/^https:\/\//.test(e.src)){
    const use=uses.get(e.id);
    if(!use){
      const path=resolve(base,e.src),image=await readFile(path).catch(error=>{throw error.code==='ENOENT'?refuse(`${s.id}/${e.id}: image ${e.src} is missing (${path})`,{code:'asset-missing',slide:s.id,asset:e.id}):error;});
      const sha256=hash(image);e.src=`assets/${sha256}${extname(path).toLowerCase()}`;copies.set(e.src,image);
      assets.push({object:e.id,slide:s.id,path:e.src,sha256});continue;
    }
    const bytes=await readFile(use.path).catch(error=>{throw error.code==='ENOENT'?refuse(`${s.id}/${e.id}: asset ${use.assetId} file ${use.source} is missing from the project`,{code:'asset-file-missing',slide:s.id,asset:use.assetId}):error;});
    if(hash(bytes)!==use.sha256)throw refuse(`${s.id}/${e.id}: asset ${use.assetId} file ${use.source} changed since it was recorded`,{code:'asset-hash-changed',slide:s.id,asset:use.assetId});
    e.src=`assets/${fileName(use.assetId)}${extname(use.source).toLowerCase()}`;copies.set(e.src,bytes);
    assets.push({object:e.id,slide:s.id,asset:use.assetId,kind:use.kind,path:e.src,source:use.source,sha256:use.sha256});
  }
  return {assets,copies,write:async output=>{if(!copies.size)return;await mkdir(join(output,'assets'),{mode:0o700});for(const [path,bytes] of copies)await writeFile(join(output,path),bytes,{flag:'wx',mode:0o600});}};
}
// Before a compiled folder is rendered: each copied asset is still the file that was compiled.
export async function verifyBuiltAssets(dir){
  let report;try{report=JSON.parse(await readFile(join(dir,'compose-report.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const a of report.inputs?.assets??[]){
    // An icon is drawn from the brand library at render, so the build holds no copy of it.
    if(a.kind==='icon')continue;
    const slide=a.slide??null;let bytes;
    try{bytes=await readFile(await regularInside(dir,a.path));}catch(error){throw error.code==='ENOENT'?refuse(`${a.object}: asset ${a.asset} copy ${a.path} is missing from the build`,{code:'asset-file-missing',slide,asset:a.asset,next:'Compile the composition again'}):error;}
    if(hash(bytes)!==a.sha256)throw refuse(`${a.object}: asset ${a.asset} copy ${a.path} changed since it was compiled`,{code:'asset-hash-changed',slide,asset:a.asset,next:'Compile the composition again'});
  }
}
