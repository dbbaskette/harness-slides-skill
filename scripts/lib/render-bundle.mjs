// Immutable native renders shared by preview, critique and design-bound review.
// A bundle contains pixels and an editable artifact, never inspection/approval.
import {readFile,writeFile,mkdir,readdir,rm,rename,cp,open,lstat} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {hash,canonicalDigest,json,regularInside} from './common.mjs';
import {checkBrandSources} from './brand-contract.mjs';
import {verifyBuiltAssets} from './assets.mjs';
import {resolveFont} from './text-metrics.mjs';

async function files(dir){const found=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('Render bundles cannot contain symlinks');if(e.isDirectory())for(const f of await files(join(dir,e.name)))found.push(`${e.name}/${f}`);else if(e.isFile())found.push(e.name);}return found.sort();}
async function nativeIdentity(file){
  const dir=resolve(file),scene=await json(join(dir,'scene.json')),structure=await json(join(dir,'structure.json')),brand=await json(join(dir,'brand-contract.json')),report=await json(join(dir,'compose-report.json'));
  await checkBrandSources(brand);await verifyBuiltAssets(dir);
  const lib=fileURLToPath(new URL('./',import.meta.url)),runtime={};
  for(const name of (await readdir(lib)).filter(n=>/\.(mjs|py)$/.test(n)))runtime[name]=hash(await readFile(join(lib,name)));
  runtime.lock=hash(await readFile(new URL('../../package-lock.json',import.meta.url)));
  return {scene,structure,brand,report,runtime,sourceKey:canonicalDigest({scene,structure,brand,assets:report.inputs?.assets,runtime})};
}
async function identity(options,deps){
  const {scene,structure,brand,report,runtime,sourceKey}=await nativeIdentity(options.file);
  const spec=options.fonts?await json(options.fonts):report.fonts,fonts=[];
  for(const bold of [false,true]){const selected=spec?.[bold?'bold':'regular'];fonts.push((await resolveFont(scene.theme.font,{bold,file:selected?.path,expectedHash:selected?.sha256})).evidence);}
  const {renderSignature}=await import('./slide-review.mjs'),signature=await renderSignature({...options,renderer:options.renderer??'google',run:deps.run,popplerFirst:true});
  const shared=canonicalDigest({brand,fonts,signature,runtime,design:report.designRevision??null});
  const fingerprints=scene.slides.map((s,index)=>canonicalDigest({shared,index,count:scene.slides.length,slide:s,structure:Object.fromEntries(Object.entries(structure).map(([k,v])=>[k,Array.isArray(v)?v.filter(x=>x.slide===s.id):v])),assets:report.inputs?.assets?.filter(a=>a.slide===s.id||!a.slide)}));
  const base={shared,scene,structure,assets:report.inputs?.assets};
  return {key:canonicalDigest({...base,slide:options.slide??null}),wholeKey:canonicalDigest({...base,slide:null}),shared,fingerprints,sourceKey};
}
async function verify(dir){
  const record=await json(await regularInside(dir,'bundle.json'));
  for(const [file,sha] of Object.entries(record.files))if(hash(await readFile(await regularInside(dir,file)))!==sha)throw new Error('Cached native artifact changed');
  if(!record.files['deck.pptx']||!record.files['preview.json'])throw new Error('Incomplete render bundle');
  if(canonicalDigest(record.result)!==canonicalDigest(await json(join(dir,'preview.json')))||record.result.deckSha256!==record.files['deck.pptx'])throw new Error('Render metadata changed');
  for(const slide of record.result.slides){const image=relative(record.original,slide.image);if(!record.files[image])throw new Error('Unbound slide image');}
  return record;
}
function relocate(value,from,to){if(typeof value==='string'&&(value===from||value.startsWith(from+'/')))return resolve(to,relative(from,value));if(Array.isArray(value))return value.map(v=>relocate(v,from,to));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,relocate(v,from,to)]));return value;}
export async function cachedCompositionArtifact(file){
  const {sourceKey}=await nativeIdentity(file),cache=join(dirname(resolve(file)),'.harness-slides','render-bundles');
  for(const name of (await readdir(cache).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).filter(n=>/^[a-f0-9]{64}$/.test(n))){
    try{const dir=join(cache,name),record=await verify(dir);if(record.sourceKey===sourceKey)return {file:join(dir,'deck.pptx'),result:record.result};}catch{/* A corrupt bundle cannot supply the deliverable. */}
  }
  return null;
}
export async function compositionRenderBundle(options,deps,render){
  const input=resolve(options.file),cache=join(dirname(input),'.harness-slides','render-bundles');
  const id=await identity(options,deps);await mkdir(cache,{recursive:true,mode:0o700});
  if((await lstat(cache)).isSymbolicLink())throw new Error('Render cache must be a real directory');
  if(options.slide)try{const dir=join(cache,id.wholeKey),record=await verify(dir);return {dir,record,reused:true};}catch{/* A selected render cannot trust a corrupt or missing whole-deck bundle. */}
  const target=join(cache,id.key),lockPath=target+'.lock',lock=await open(lockPath,'wx',0o600).catch(e=>{if(e.code==='EEXIST')throw new Error('Native render is already in progress; retry after it finishes');throw e;});
  try{
    let record;try{record=await verify(target);}catch{await rm(target,{recursive:true,force:true});}
    let reused=Boolean(record);
    if(!record){
      const pixels=new Map();
      // Only equivalent slide/dependency fingerprints may reuse a previous page.
      for(const name of (await readdir(cache)).filter(n=>/^[a-f0-9]{64}$/.test(n))){try{const old=await verify(join(cache,name));if(old.shared!==id.shared)continue;for(const [i,fp] of old.fingerprints.entries()){const slide=old.result.slides.find(s=>s.number===i+1);if(slide)pixels.set(fp,join(cache,name,relative(old.original,slide.image)));}}catch{/* An unverified bundle contributes no evidence. */}}
      const stage=join(cache,'.stage-'+randomUUID());
      try{
        const result=await render({...options,output:stage},{...deps,reuseImages:new Map(id.fingerprints.map((fp,i)=>[i+1,pixels.get(fp)]).filter(([,path])=>path))});
        const hashes={};for(const file of await files(stage))hashes[file]=hash(await readFile(join(stage,file)));
        record={schema:1,...id,original:stage,result,files:hashes};await writeFile(join(stage,'bundle.json'),JSON.stringify(record),{flag:'wx',mode:0o600});await rename(stage,target);
      }catch(error){await rm(stage,{recursive:true,force:true});throw error;}
    }
    return {dir:target,record,reused};
  }finally{await lock.close();await rm(lockPath,{force:true});}
}
export async function materializeRenderBundle(bundle,output,{slide}={}){
  output=resolve(output);await mkdir(output,{mode:0o700});
  try{
    const result=relocate(bundle.record.result,bundle.record.original,output);result.reused=bundle.reused;
    const wanted=slide?result.slides.find(s=>s.id===slide):null;
    for(const file of Object.keys(bundle.record.files)){
      if(slide&&(file==='critic.json'||file==='contact-sheet.png'||/^slide-.*\.png$/.test(file)&&file!==relative(output,wanted.image)))continue;
      await mkdir(dirname(join(output,file)),{recursive:true});await cp(await regularInside(bundle.dir,file),join(output,file),{errorOnExist:true,force:false});
    }
    if(slide){result.slides=[wanted];delete result.critic;delete result.contactSheet;delete result.contactSheetError;}
    // No critique or user decision is ever part of a cached bundle.
    await writeFile(join(output,'preview.json'),JSON.stringify(result,null,2)+'\n');return result;
  }catch(error){await rm(output,{recursive:true,force:true});throw error;}
}
