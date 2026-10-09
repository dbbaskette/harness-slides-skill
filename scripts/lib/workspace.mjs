import { mkdir, readFile, writeFile, rename, lstat, open, rm, readdir, copyFile } from 'node:fs/promises';
import { join, resolve, basename, extname } from 'node:path';
import { constants } from 'node:fs';
import {randomUUID} from 'node:crypto';
import { hash, digest, json, saveJson, regularInside } from './common.mjs';
import { validateScene, renderSceneHtml, sceneFindings, coverage } from './scene.mjs';
import { compileGoogleScene, applyGoogleScene, snapshotDeck, googleSession } from './google-slides.mjs';
import {requireSceneDesign,designStatus} from './design-session.mjs';
import {auditSceneQuality,assessCritique,validateDesignReport} from './slide-quality.mjs';
import {verifyReview} from './slide-review.mjs';
import { renderPptxScene } from './pptx-render.mjs';

export async function loadWorkspace(root) {
  root=resolve(root); const s=await lstat(root);
  if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Workspace must be a real directory');
  const manifest=await json(await regularInside(root,'workspace.json'));
  if(manifest.version!==1||manifest.tool!=='harness-slides'||!['google-slides','pptx'].includes(manifest.format))throw new Error('Not a Harness Slides workspace');
  const versions=await history(root);
  if(!versions.length)throw new Error('Workspace has no scene versions');
  const current=versions.at(-1),scene=await json(await regularInside(root,`versions/${current.id}/scene.json`));
  validateScene(scene);if(digest(scene)!==current.sceneDigest)throw new Error('Scene version changed outside the workspace; preserve it and recover from an intact version');
  return {root,manifest,current,scene,versions};
}
export async function history(root) {
  const dir=join(root,'versions'),names=(await readdir(dir)).filter(s=>/^v\d{6}$/.test(s)).sort();
  const versions=[];
  for(const id of names) {
    const v=await json(await regularInside(root,`versions/${id}/version.json`));
    if(v.id!==id||v.number!==versions.length+1)throw new Error('Version sequence is invalid');
    versions.push(v);
  }
  return versions;
}
async function lock(root,action) {
  const file=join(root,'.workspace-lock');
  let handle;
  try{handle=await open(file,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error('Workspace is busy or interrupted; inspect its lock before retrying');throw e;}
  try{return await action();}finally{await handle.close();await rm(file);}
}
async function version(root,scene,number,note) {
  const id=`v${String(number).padStart(6,'0')}`,dir=join(root,'versions',id);
  validateScene(scene);await mkdir(dir);
  const record={id,number,sceneDigest:digest(scene),note,createdAt:new Date().toISOString()};
  try{await saveJson(join(dir,'scene.json'),scene);await writeFile(join(dir,'preview.html'),renderSceneHtml(scene),{flag:'wx',mode:0o600});await saveJson(join(dir,'version.json'),record);}
  catch(error){await rm(dir,{recursive:true,force:true});throw error;}
  return record;
}
export async function initWorkspace({root,scene,format='google-slides',template,source,requiredSources=[],brand,brandContract,designReport,fonts,designProject,base=process.cwd()}) {
  validateScene(scene);const approvedDesign=await requireSceneDesign(scene,designProject);if(designReport?.schema===2&&!approvedDesign)throw new Error('Creative design report needs an approved design project');if(designReport)validateDesignReport(designReport,scene,{initial:true});root=resolve(root);scene=structuredClone(scene);
  if(!['google-slides','pptx'].includes(format))throw new Error('Choose google-slides or pptx');
  if(format==='google-slides'&&!template)throw new Error('Google workspaces need a native working-copy snapshot via --template');
  if(!Array.isArray(requiredSources)||requiredSources.some(x=>typeof x!=='string'||!x.trim()))throw new Error('Required sources must be IDs');
  await mkdir(root); // Exclusive: never overlay a user directory.
  try {
    await mkdir(join(root,'inputs'));await mkdir(join(root,'versions'));
    const manifest={version:1,tool:'harness-slides',qualityPolicy:2,format,requiredSources,brand:brand??null};
    if(approvedDesign){manifest.designProject=resolve(designProject);manifest.designRevision=approvedDesign.revision;manifest.approvalPolicy=1;}
    manifest.assets={};
    for(const e of scene.slides.flatMap(s=>s.elements).filter(e=>e.type==='image'&&!/^https:\/\//.test(e.src))) {
      const path=resolve(base,e.src),s=await lstat(path),extension=extname(path).toLowerCase();
      if(!s.isFile()||s.isSymbolicLink()||s.size>20*1024*1024||!['.png','.jpg','.jpeg','.svg'].includes(extension))throw new Error('Use bounded PNG/JPEG/SVG image files');
      const bytes=await readFile(path),sha=hash(bytes),name=`inputs/images/${sha}${extension}`;
      await mkdir(join(root,'inputs','images'),{recursive:true});
      if(!manifest.assets[name])await writeFile(join(root,name),bytes,{flag:'wx',mode:0o600});
      manifest.assets[name]=sha;e.src=name;
    }
    if(brandContract){const {checkBrandSources}=await import('./brand-contract.mjs');await checkBrandSources(brandContract);if(brandContract.medium.kind!=='slides')throw new Error('Workspace needs a slide brand contract');manifest.brandContract='inputs/brand-contract.json';manifest.brandRevision=brandContract.revision;await saveJson(join(root,manifest.brandContract),brandContract);}
    if(designReport){manifest.designReport='inputs/design-report.json';manifest.designReportDigest=digest(designReport);await saveJson(join(root,manifest.designReport),designReport);}
    if(fonts){manifest.fonts='inputs/fonts.json';manifest.fontsDigest=digest(fonts);await saveJson(join(root,manifest.fonts),fonts);}
    if(template){manifest.template='inputs/template.json';const deck=await json(template);await saveJson(join(root,manifest.template),deck);manifest.templateDigest=digest(deck);}
    if(source){const name=basename(source);if(!/^[\w .-]+\.pptx$/i.test(name))throw new Error('Source must be PPTX');manifest.source=`inputs/${name}`;await copyFile(source,join(root,manifest.source),constants.COPYFILE_EXCL);manifest.sourceSha256=hash(await readFile(join(root,manifest.source)));}
    await saveJson(join(root,'workspace.json'),manifest);await version(root,scene,1,'Initial draft');
    return {root,format,version:'v000001',status:'draft',next:'workspace build'};
  }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}
export async function saveScene({root,scene,expectedDigest,note='Scene edit'}) {
  root=resolve(root);return lock(root,async()=>{
    const w=await loadWorkspace(root);
    if(w.current.sceneDigest!==expectedDigest)throw new Error('Scene changed since it was opened; reload before saving');
    validateScene(scene);
    if(digest(scene)===expectedDigest)return {unchanged:true,...w.current};
    if(w.scene.mode==='redesign') {
      if(scene.mode!==w.scene.mode||JSON.stringify(scene.slides.map(s=>s.id))!==JSON.stringify(w.scene.slides.map(s=>s.id)))throw new Error('Redesign must retain slide order/count; select full rework explicitly for structural changes');
      const contents=s=>s.slides.map(p=>({title:p.title,notes:p.notes,sources:p.sources,content:p.elements.filter(e=>e.type==='text'||e.text||e.rows||e.series||e.src).map(e=>e.type==='table'?e.rows:e.type==='chart'?{series:e.series,source:e.source}:e.type==='image'?{src:e.src,alt:e.alt}:e.text)}));
      if(JSON.stringify(contents(scene))!==JSON.stringify(contents(w.scene)))throw new Error('Redesign must retain content; use full rework for content edits');
    }
    const approved=w.manifest.designProject?await requireSceneDesign(scene,w.manifest.designProject):null;
    const saved=await version(root,scene,w.current.number+1,note);
    if(approved&&approved.revision!==w.manifest.designRevision){
      const temporary=join(root,`.workspace-design-update-${randomUUID()}.json`);
      try{await writeFile(temporary,JSON.stringify({...w.manifest,designRevision:approved.revision},null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,join(root,'workspace.json'));}
      catch(error){await rm(join(root,'versions',saved.id),{recursive:true,force:true});throw error;}
      finally{await rm(temporary,{force:true});}
    }
    return saved;
  });
}
export async function restoreVersion({root,id,expectedDigest}) {
  if(!/^v\d{6}$/.test(id??''))throw new Error('Choose a version ID');
  const scene=await json(await regularInside(resolve(root),`versions/${id}/scene.json`));
  return saveScene({root,scene,expectedDigest,note:`Restored ${id} as a new version`});
}
export async function buildWorkspace({root}) {
  root=resolve(root);return lock(root,async()=>{
    const w=await loadWorkspace(root),dir=join(root,'versions',w.current.id,'build');
    if(w.manifest.designProject)await requireSceneDesign(w.scene,w.manifest.designProject,w.manifest.designRevision);
    const sourceCoverage=coverage(w.scene,w.manifest.requiredSources);
    if(!sourceCoverage.complete)throw new Error(`Missing required evidence: ${sourceCoverage.missing.join(', ')}`);
    let template,brandContract;
    if(w.manifest.brandContract){brandContract=await json(await regularInside(root,w.manifest.brandContract));if(brandContract.revision!==w.manifest.brandRevision)throw new Error('Pinned brand contract changed; create an explicit new brand handoff');const {checkBrandSources}=await import('./brand-contract.mjs');await checkBrandSources(brandContract);}
    if(w.manifest.template){template=await json(await regularInside(root,w.manifest.template));if(digest(template)!==w.manifest.templateDigest)throw new Error('Template snapshot changed; use a new workspace');}
    if(w.manifest.source&&hash(await readFile(await regularInside(root,w.manifest.source)))!==w.manifest.sourceSha256)throw new Error('Original PPTX copy changed');
    for(const [file,sha] of Object.entries(w.manifest.assets??{}))if(hash(await readFile(await regularInside(root,file)))!==sha)throw new Error('Workspace asset changed; prepare a new immutable input');
    // Compile first, then reserve output. Failed builds delete only their own files.
    const plan=w.manifest.format==='google-slides'?compileGoogleScene(w.scene,template):null;
    await mkdir(dir);
    try {
      const artifacts={};
      if(plan){await saveJson(join(dir,'google-requests.json'),{requests:plan.requests,writeControl:plan.writeControl});artifacts['google-requests.json']=hash(await readFile(join(dir,'google-requests.json')));}
      else {await renderPptxScene(w.scene,join(dir,'deck.pptx'),{base:root,brand:brandContract});artifacts['deck.pptx']=hash(await readFile(join(dir,'deck.pptx')));}
      const quality=await auditSceneQuality(w.scene,{...await qualityInputs(w),artifactDigest:digest(artifacts)});
      await saveJson(join(dir,'quality-report.json'),quality);artifacts['quality-report.json']=hash(await readFile(join(dir,'quality-report.json')));
      const record={version:w.current.id,sceneDigest:w.current.sceneDigest,format:w.manifest.format,artifacts,sourceCoverage,findings:quality.findings,qualityRevision:quality.revision,limitations:plan?.limitations??[],status:'unreviewed draft'};
      await saveJson(join(dir,'build.json'),record);
      return {root,build:dir,...record};
    }catch(error){await rm(dir,{recursive:true,force:true});throw error;}
  });
}
export async function verifiedBuild(root) {
  const w=await loadWorkspace(root);if(w.manifest.designProject)await requireSceneDesign(w.scene,w.manifest.designProject,w.manifest.designRevision);const dir=join(w.root,'versions',w.current.id,'build'),record=await json(await regularInside(w.root,`versions/${w.current.id}/build/build.json`));
  if(w.manifest.brandContract){const contract=await json(await regularInside(w.root,w.manifest.brandContract));if(contract.revision!==w.manifest.brandRevision)throw new Error('Pinned brand contract changed');const {checkBrandSources}=await import('./brand-contract.mjs');await checkBrandSources(contract);}
  if(record.sceneDigest!==w.current.sceneDigest||record.version!==w.current.id)throw new Error('Build does not match current scene');
  for(const [name,sha] of Object.entries(record.artifacts))if(!/^[\w.-]+$/.test(name)||hash(await readFile(await regularInside(dir,name)))!==sha)throw new Error('Built artifact changed; build a new version and review it');
  await qualityInputs(w);
  if(record.artifacts['quality-report.json']){const quality=await json(await regularInside(dir,'quality-report.json'));for(const font of quality.fontEvidence??[])if(font.path&&hash(await readFile(font.path))!==font.sha256)throw new Error('Measured font changed; rebuild and review');}
  return {w,dir,record};
}
async function qualityInputs(w){const result={policy:w.manifest.qualityPolicy??1};for(const [key,name] of [['designReport','designReportDigest'],['fonts','fontsDigest']])if(w.manifest[key]){const value=await json(await regularInside(w.root,w.manifest[key]));if(digest(value)!==w.manifest[name])throw new Error('Pinned quality input changed');result[key]=value;}return result;}
export async function workspaceQuality(root,slideId){
  let report,path=null,unbuilt=false;const w=await loadWorkspace(root);
  try{await regularInside(w.root,`versions/${w.current.id}/build/build.json`);}catch(error){if(error.code!=='ENOENT')throw error;unbuilt=true;}
  if(unbuilt)report=await auditSceneQuality(w.scene,await qualityInputs(w));
  else {const {dir}=await verifiedBuild(root);path=join(dir,'quality-report.json');report=await json(await regularInside(dir,'quality-report.json'));}
  if(slideId&&!report.prompts.some(s=>s.slide===slideId))throw new Error('Unknown slide');
  return {report:path,sceneDigest:report.sceneDigest,qualityRevision:report.revision,...(report.artifactDigest?{artifactDigest:report.artifactDigest}:{}),findings:report.findings.filter(f=>!slideId||f.slide===slideId),...(slideId?{measurements:report.measurements.filter(m=>m.slide===slideId),critique:report.prompts.find(s=>s.slide===slideId)}:{slides:report.prompts.map(s=>({id:s.slide,criteria:s.criteria.map(c=>c.id)}))})};
}
export async function recordWorkspaceCritique({root,assessment}){root=resolve(root);return lock(root,async()=>{const {dir}=await verifiedBuild(root),quality=await json(await regularInside(dir,'quality-report.json')),receipt=assessCritique(quality,assessment),path=join(dir,'critique.json');try{await regularInside(dir,'critique.json');}catch(e){if(e.code!=='ENOENT')throw e;}await writeFile(path,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});return {path,...receipt};});}

export async function applyWorkspace({root,dryRun=false},deps={}) {
  const {w,dir,record}=await verifiedBuild(root);
  if(w.manifest.format!=='google-slides')throw new Error('Apply is only for native Google Slides');
  const deck=await json(await regularInside(w.root,w.manifest.template));
  if(digest(deck)!==w.manifest.templateDigest)throw new Error('Template snapshot changed');
  const plan=compileGoogleScene(w.scene,deck);
  if(JSON.stringify(await json(join(dir,'google-requests.json')))!==JSON.stringify({requests:plan.requests,writeControl:plan.writeControl}))throw new Error('Compiled plan changed');
  if(dryRun)return {presentationId:plan.presentationId,requests:plan.requests.length,limitations:plan.limitations,status:'dry run; no Google access'};
  return applyGoogleScene(w.scene,deck,await googleSession(deps));
}
export async function workspaceStatus(root) {
  const w=await loadWorkspace(root),result={root:w.root,format:w.manifest.format,version:w.current.id,sceneDigest:w.current.sceneDigest,versions:w.versions.length,coverage:coverage(w.scene,w.manifest.requiredSources),ready:false,status:'draft'};
  let checked;
  try{checked=await verifiedBuild(root);}catch(error){result.next=error.message;return result;}
  const reviewPath=`versions/${w.current.id}/build/review/review.json`;
  try {
    const review=w.manifest.designProject?await verifyReview(join(checked.dir,'review')):await json(await regularInside(w.root,reviewPath));
    if(review.source.type==='pptx'&&review.source.sha256!==checked.record.artifacts['deck.pptx'])throw new Error('Review covers a different deck');
    if(review.source.type==='google-slides'){
      result.status='native review recorded; live revision must be checked before delivery';
      result.nativeRevision=review.source.nativeRevision;
      // Offline status cannot assert that a live Google deck is still unchanged.
      result.nativeReviewRecorded=review.visualReviewComplete;
    } else result.ready=Boolean(review.visualReviewComplete)&&!review.pending.length;
    result.pending=review.pending;
    for(const slide of review.slides)if(hash(await readFile(await regularInside(join(checked.dir,'review'),slide.image)))!==slide.imageSha256)throw new Error('Review image changed');
    if(result.ready)result.status='local deck reviewed; verify target editor fidelity';
  }catch(error){result.ready=false;result.next=`Visual review required: ${error.message}`;}
  if(!w.manifest.designProject&&(w.manifest.designReport||checked.record.artifacts['quality-report.json']))try{
    const quality=await json(await regularInside(checked.dir,'quality-report.json')),saved=await json(await regularInside(checked.dir,'critique.json')),receipt=assessCritique(quality,saved.assessment);
    result.critiqueComplete=receipt.complete;result.critiqueUnresolved=receipt.unresolved;if(!receipt.complete){result.ready=false;result.status='content critique unresolved';}
  }catch(error){result.critiqueComplete=false;if(w.manifest.qualityPolicy===2||w.manifest.designReport||error.code!=='ENOENT'){result.ready=false;result.status='structured content critique required';result.critiqueNext=error.message;}}
  if(w.manifest.designProject)try{const acceptance=await designStatus(w.manifest.designProject);result.userReview=acceptance.status;result.userAccepted=acceptance.renderedAcceptance&&acceptance.renderedRevision===(await json(await regularInside(w.root,reviewPath))).revision&&acceptance.renderedReview===join(checked.dir,'review');const review=w.manifest.designProject?await verifyReview(join(checked.dir,'review')):await json(await regularInside(w.root,reviewPath));result.creativeReviewComplete=review.creativeReviewComplete;result.critiqueComplete=review.creativeReviewComplete;if(!result.userAccepted||!review.creativeReviewComplete){result.ready=false;result.status=!review.creativeReviewComplete?'creative review required':'awaiting rendered user review';}}catch(error){result.ready=false;result.userReviewNext=error.message;}
  return result;
}
