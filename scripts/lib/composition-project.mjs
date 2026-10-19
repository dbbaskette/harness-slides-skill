// A composition remains the editable source. Studio edits recompile it rather
// than flattening groups and attached edges into an unrelated scene workspace.
import {readFile,writeFile,mkdir,rename,open,rm} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {json,digest,hash,regularInside,inside,recordedPath,recordedLocation} from './common.mjs';

const manifestName='project.json';
export const compiledFiles=['scene.json','structure.json','compose-report.json','brand-contract.json','composition.json'];
async function atomic(path,value){const temporary=path+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,path);}finally{await rm(temporary,{force:true});}}
async function locked(root,action){const path=join(root,'.project-lock'),handle=await open(path,'wx',0o600).catch(e=>{if(e.code==='EEXIST')throw new Error('Composition project is busy; reload before retrying');throw e;});try{return await action();}finally{await handle.close();await rm(path,{force:true});}}
export async function compositionBinding(dir){const hashes={};for(const name of compiledFiles)hashes[name]=hash(await readFile(await regularInside(dir,name)));return digest(hashes);}
export async function isCompositionProject(root){try{return (await json(join(root,manifestName))).tool==='harness-slides-project';}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function registerComposition({output,project=output,designProject}){
  project=resolve(project);output=resolve(output);if(output!==project)inside(project,output);
  return locked(project,async()=>{
    let manifest;try{manifest=await json(await regularInside(project,manifestName));}catch(e){if(e.code!=='ENOENT')throw e;manifest={schema:1,tool:'harness-slides-project',versions:[]};}
    if(manifest.tool!=='harness-slides-project'||manifest.schema!==1)throw new Error('Not a composition project');
    const id=`v${String(manifest.versions.length+1).padStart(6,'0')}`,binding=await compositionBinding(output);
    manifest.versions.push({id,compiled:relative(project,output)||'.',binding,note:'Compiled composition',...(designProject?{designProject:recordedPath(project,designProject,project)}:{})});
    await atomic(join(project,manifestName),manifest);return {project,id,binding};
  });
}
export async function loadCompositionProject(root){
  root=resolve(root);const manifest=await json(await regularInside(root,manifestName));
  if(manifest.schema!==1||manifest.tool!=='harness-slides-project'||!Array.isArray(manifest.versions))throw new Error('Not a composition project');
  const current=manifest.versions.at(-1);if(!current)throw new Error('The outline is ready; compile the merged composition with --project before opening the studio');
  if(current.compiled!=='.')inside(root,current.compiled);
  const compiled=resolve(root,current.compiled),binding=await compositionBinding(compiled);
  if(binding!==current.binding)throw new Error('Compiled project changed outside its version; recover from an intact version');
  const {verifyBuiltAssets}=await import('./assets.mjs');await verifyBuiltAssets(compiled);
  return {root,compiled,manifest,current:{...current,sceneDigest:binding},versions:manifest.versions,scene:await json(join(compiled,'scene.json')),composition:await json(join(compiled,'composition.json'))};
}
export async function compositionStatus(root){
  const w=await loadCompositionProject(root),result={root:w.root,kind:'composition',version:w.current.id,sceneDigest:w.current.sceneDigest,versions:w.versions.length,ready:false,status:'draft',next:'Build, preview and inspect this version'};
  let critiqueComplete=false;
  if(w.current.build)try{const file=resolve(root,w.current.build.path);result.build=w.current.build.path;result.status=hash(await readFile(file))===w.current.build.sha256?'built; native review required':'built artifact changed';}catch(error){result.status='built artifact unavailable';result.next=error.message;}
  if(w.current.preview)try{
    const preview=resolve(root,w.current.preview.path),{verifyCriticPacket,assessCompositionCritique}=await import('./compose-preview.mjs');
    const packet=await verifyCriticPacket(preview,await json(join(preview,'critic.json')));
    if(packet.buildBinding!==w.current.binding)throw new Error('Preview belongs to another build');
    result.preview=w.current.preview.path;result.remote=w.current.preview.remote;result.status='rendered; critique required';
    const receipt=await json(join(preview,'critique.json'));
    if(receipt.packetDigest!==digest(packet))throw new Error('Critique is stale');
    const assessed=assessCompositionCritique(packet,{deckSha256:receipt.deckSha256,reviewer:receipt.reviewer,slides:receipt.slides,findings:receipt.findings,weakest:receipt.weakest});
    result.findings=assessed.findings;critiqueComplete=assessed.status==='clear'&&!assessed.major;result.ready=critiqueComplete;result.status=result.ready?'critiqued; show rendered output for user acceptance':'critique findings unresolved';
    result.next=result.ready?'Show the exact rendered deck and record the user decision':'Fix findings, then preview and critique the new version';
  }catch(error){result.next=error.message;}
  if(w.current.review)try{
    const {verifyReview}=await import('./slide-review.mjs'),review=await verifyReview(resolve(root,w.current.review.path));result.review=w.current.review.path;result.findings=[...(result.findings??[]),...(review.creativeQuality?.findings??[])];
    result.critiqueComplete=critiqueComplete;result.ready=review.readyForUserReview&&critiqueComplete;result.status=result.ready?'ready for user review':!critiqueComplete?'composition critique required':'native review incomplete';
    result.next=result.ready?'Show the exact rendered deck and record the user decision':!critiqueComplete?'Complete compose critique on the current full-deck preview':'Inspect and mark every slide, then complete the current design assessment';
    if(w.current.designProject){const acceptance=await (await import('./design-session.mjs')).designStatus(recordedLocation(root,w.current.designProject));result.userAccepted=Boolean(acceptance.renderedAcceptance&&acceptance.renderedRevision===review.revision&&acceptance.renderedReview===resolve(root,w.current.review.path));}
  }catch(error){result.ready=false;result.next=error.message;}
  // Readiness here is always for the user's checkpoint, never inferred acceptance.
  result.readyForUserReview=result.ready;result.ready=Boolean(result.ready&&result.userAccepted);
  if(result.ready)result.status='reviewed and accepted; deliver the reviewed artifact';
  return result;
}
export async function recordCompositionArtifact(root,compiled,kind,value){
  if(!root||!await isCompositionProject(root))return;
  return locked(root,async()=>{
    const w=await loadCompositionProject(root);if(resolve(compiled)!==w.compiled)throw new Error('Project version changed during the operation');
    const entry=w.manifest.versions.at(-1);entry[kind]={...value,path:recordedPath(root,value.path,root)};await atomic(join(root,manifestName),w.manifest);
  });
}
function sourceNode(comp,id){let found;const walk=n=>{if(!n)return;if(n.id===id)found=n;for(const c of n.children??[])walk(c);if(n.hub)walk(n.hub);};for(const slide of comp.slides){if(`${slide.id}_title`===id)return {node:slide,key:'title'};walk(slide.canvas);}return found?{node:found,key:'text'}:null;}
export function editableCompositionObjects(comp){const ids=[];const walk=n=>{if(!n)return;if(typeof n.text==='string')ids.push(n.id);for(const c of n.children??[])walk(c);walk(n.hub);};for(const s of comp.slides){ids.push(`${s.id}_title`);walk(s.canvas);}return ids;}
async function revise(w,composition,base,expectedDigest,note){
  if(w.current.sceneDigest!==expectedDigest)throw new Error('Composition changed since it was opened; reload before saving');
  const {compileCompositionFile}=await import('./compose-file.mjs');
  // Input images already live in the immutable compiled folder. Resolve only
  // these copied inputs; the original authoring source need not still exist.
  const walk=n=>{if(!n)return;if(n.type==='image'&&n.src&&!/^https:/.test(n.src))n.src=resolve(base,n.src);for(const c of n.children??[])walk(c);walk(n.hub);};
  for(const s of composition.slides){walk(s.canvas);if(s.picture?.src)s.picture.src=resolve(base,s.picture.src);}
  const sources=join(w.root,'.project-inputs');await mkdir(sources,{recursive:true,mode:0o700});const temporary=join(sources,randomUUID()+'.json');
  await writeFile(temporary,JSON.stringify(composition),{flag:'wx',mode:0o600});
  const output=join(w.root,'versions',`v${String(w.versions.length+1).padStart(6,'0')}`);await mkdir(join(w.root,'versions'),{recursive:true});
  let created=false;
  try{
    // Caller owns the project lock; register only after compilation succeeds.
    const report=await json(join(base,'compose-report.json'));let fonts;
    if(report.fonts){fonts=temporary+'.fonts.json';await writeFile(fonts,JSON.stringify(report.fonts),{flag:'wx',mode:0o600});}
    try{await compileCompositionFile({file:temporary,brand:join(base,'brand-contract.json'),fonts,project:w.root,output,'design-project':w.current.designProject?recordedLocation(w.root,w.current.designProject):undefined,register:false});created=true;}finally{if(fonts)await rm(fonts,{force:true});}
    w.manifest.versions.push({id:`v${String(w.versions.length+1).padStart(6,'0')}`,compiled:relative(w.root,output),binding:await compositionBinding(output),note,designProject:w.current.designProject});
    await atomic(join(w.root,manifestName),w.manifest);return w.manifest.versions.at(-1);
  }catch(error){if(created)await rm(output,{recursive:true,force:true});throw error;}finally{await rm(temporary,{force:true});}
}
export async function editCompositionProject({root,id,fields,expectedDigest}){
  return locked(root,async()=>{const w=await loadCompositionProject(root),source=sourceNode(w.composition,id);
    if(!source||typeof fields?.text!=='string'||Object.keys(fields).some(k=>k!=='text'))throw new Error('Composition studio edits text; use the composition source for layout changes');
    source.node[source.key]=fields.text;return revise(w,w.composition,w.compiled,expectedDigest,`Edited ${id}`);
  });
}
export async function restoreCompositionProject({root,id,expectedDigest}){
  return locked(root,async()=>{const w=await loadCompositionProject(root),version=w.versions.find(v=>v.id===id);if(!version)throw new Error('Unknown version');
    const base=resolve(root,version.compiled);if(await compositionBinding(base)!==version.binding)throw new Error('Saved version changed');
    return revise(w,await json(join(base,'composition.json')),base,expectedDigest,`Restored ${id}`);
  });
}
export async function buildCompositionProject(root){
  const w=await loadCompositionProject(root),build=join(w.compiled,'build');await mkdir(build,{recursive:true});const output=join(build,'deck.pptx');
  if(w.current.designProject){const report=await json(join(w.compiled,'compose-report.json'));await (await import('./design-session.mjs')).requireSceneDesign(w.scene,recordedLocation(root,w.current.designProject),report.designRevision);}
  let old;try{old=await readFile(output);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old){if(!w.current.build||hash(old)!==w.current.build.sha256)throw new Error('Existing build changed; save a new version');return {build:output,status:'unchanged build'};}
  const {renderCompositionDir}=await import('./compose-file.mjs'),result=await renderCompositionDir({file:w.compiled,output});
  await recordCompositionArtifact(root,w.compiled,'build',{path:output,sha256:result.sha256});return {build:output,...result};
}
