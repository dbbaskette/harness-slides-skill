// File boundary for compositions: read inputs, enforce the design gate, write a new output folder.
import {readFile,mkdir,writeFile,rm,copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {compileComposition} from './compose.mjs';
import {checkBrandSources,neutralBrandContract} from './brand-contract.mjs';
import {requireSceneDesign} from './design-session.mjs';
import {digest,hash,recordedPath,regularInside} from './common.mjs';
import {splitPoints} from './compose-audit.mjs';
import {refuse,refuseAll,compositionProblems} from './refusals.mjs';
import {resolveCompositionAssets,iconAssetProblems,placeImages,verifyBuiltAssets} from './assets.mjs';

// What the composition asks of the brand's icon library and template, read straight from the file so it can be checked even when a slide does not compile.
function requested(comp) {
  const icons=[],layouts=[],walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='icon'&&typeof n.id==='string')icons.push({id:n.id,icon:n.icon});if(Array.isArray(n.children))n.children.forEach(walk);};
  for(const s of Array.isArray(comp?.slides)?comp.slides:[]){if(!s||typeof s!=='object')continue;if(s.layout!==undefined)layouts.push({slide:s.id,layout:s.layout,placeholders:['subtitle','detail'].filter(k=>s[k]!==undefined)});else walk(s.canvas);}
  return {icons,layouts};
}
const lines=error=>error.message.split('\n').filter(line=>!/^\d+ problems to fix:$/.test(line));

// Without --output this only checks: every structure, fit, icon and layout problem comes back from one run and nothing is written.
// With --design-project the approved design is checked too, written or not; --section accepts a contiguous run of approved slides.
// The approved outline: named with --outline, or the one an outline project's manifest records.
async function approvedOutline(outline,project) {
  if(outline){const bytes=await readFile(outline);return {path:resolve(outline),bytes,outline:JSON.parse(bytes)};}
  if(!project)return null;
  let manifest;try{manifest=JSON.parse(await readFile(join(resolve(project),'project.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(typeof manifest?.outline!=='string')return null;
  const path=await regularInside(resolve(project),manifest.outline),bytes=await readFile(path);return {path,bytes,outline:JSON.parse(bytes)};
}

export async function compileCompositionFile({file,brand,output,fonts,project,outline:outlineFile,'design-project':designProject,'asset-project':assetProject,section,register=true}) {
  if(!file)throw new Error('Provide --file composition.json, and a new --output directory to write the build');
  if(section&&!designProject)throw refuse('--section needs --design-project: a section is checked against the approved design',{code:'input-invalid'});
  const bytes=await readFile(file),brandBytes=brand?await readFile(brand):null;
  const contract=brandBytes?JSON.parse(brandBytes):await neutralBrandContract();
  await checkBrandSources(contract);
  // Images and icons named by asset ID resolve through the project's asset manifest, which is the design project's unless another is named.
  const {comp,uses,icons,unresolved,problems}=await resolveCompositionAssets(JSON.parse(bytes),assetProject??designProject);let compiled;
  try{compiled=await compileComposition(comp,contract,{fonts:fonts?JSON.parse(await readFile(fonts)):undefined});}catch(error){problems.push(...lines(error));}
  // Unknown or picture-only icons and unknown layouts are caught now, not when the deck is rendered, and alongside everything else.
  // An icon asset that did not resolve has already been reported, so its stand-in is not checked against the library.
  const native=await import('./pptx-native.mjs'),found=compiled?.structure??requested(comp),wanted={...found,icons:(found.icons??[]).filter(i=>!unresolved.has(i.id))};
  for(const check of [native.checkIcons,native.checkLayouts])try{await check(wanted,contract);}catch(error){problems.push(...lines(error));}
  problems.push(...await iconAssetProblems(icons,contract));
  // An approved sentence split across several nodes misleads a reader with no presenter, so a reading deck refuses it.
  const approvedSource=await approvedOutline(outlineFile,project),reading=(contract.medium.delivery??'reading')==='reading';
  const split=approvedSource?splitPoints(approvedSource.outline,comp):[];
  if(reading)problems.push(...split.map(f=>`${f.slide}: ${f.detail.replace(/^The approved point/,'the approved point')}`));
  if(problems.length)throw refuseAll(problems.length===1?problems[0]:`${problems.length} problems to fix:\n${problems.join('\n')}`,compositionProblems(problems,comp));
  const {scene,structure,report}=compiled;
  const summary={slides:scene.slides.length,brandRevision:contract.revision,measurement:report.measurement,groups:structure.groups.length,connectors:structure.connectors.length,icons:structure.icons.length,room:Object.fromEntries(report.room.map(r=>[r.slide,`${r.needs} of ${r.has}`])),...(structure.adjusted?.length?{weightOverridden:structure.adjusted}:{}),...(structure.reading?.length?{readingSizeInLiveDeck:structure.reading.map(r=>`${r.slide}: ${r.nodes.length} items at ${r.size}pt`)}:{}),...(split.length?{splitPoints:split.map(f=>`${f.slide}: ${f.detail}`)}:{}),...(structure.supporting?{supportingColors:structure.supporting}:{})};
  const approved=designProject||output?await requireSceneDesign(scene,designProject,undefined,{section}):null;
  if(approved)summary.design={revision:approved.revision,scope:approved.scope,slides:approved.slides};
  if(!output)return {status:'fits; nothing written. Add a new --output directory to write the build',...summary};
  if(approved){report.designRevision=approved.revision;report.designScope=approved.scope;}
  const {assets,write}=await placeImages(scene,{base:dirname(resolve(file)),uses});
  const source=structuredClone(comp),images=new Map(scene.slides.flatMap(s=>s.elements).filter(e=>e.type==='image').map(e=>[e.id,e.src]));
  const freeze=n=>{if(!n)return;if(n.type==='image'&&images.has(n.id)){delete n.asset;n.src=images.get(n.id);}for(const c of n.children??[])freeze(c);freeze(n.hub);};
  for(const s of source.slides){freeze(s.canvas);if(s.picture&&images.has(`${s.id}_picture`)){delete s.picture.asset;s.picture.src=images.get(`${s.id}_picture`);}}
  // An icon placed by asset ID is recorded with its library ID and the hash of its index entry; the build needs no copy of it.
  for(const i of structure.icons){const use=icons.get(i.id);if(use)assets.push({object:i.id,slide:i.slide,asset:use.assetId,kind:'icon',ref:use.ref,sha256:use.sha256});}
  // The composition and brand are named relative to the build when both lie in the project; one from elsewhere stays absolute.
  output=resolve(output);const inputProject=project??designProject??assetProject,input=path=>recordedPath(output,path,inputProject);
  report.inputs={composition:{path:input(file),sha256:hash(bytes)},brand:brand?{path:input(brand),sha256:hash(brandBytes)}:{kind:'neutral defaults',revision:contract.revision},assets,...(approvedSource?{outline:{path:input(approvedSource.path),sha256:hash(approvedSource.bytes)}}:{})};
  if(fonts)report.fonts=JSON.parse(await readFile(fonts,'utf8'));
  report.sceneDigest=digest(scene);report.structureDigest=digest(structure);report.project=recordedPath(output,project??output,project??output);
  await mkdir(output,{mode:0o700});
  try {
    for(const [name,value] of [['scene.json',scene],['structure.json',structure],['compose-report.json',report],['brand-contract.json',contract],['composition.json',source]])
      await writeFile(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
    await write(output);
    if(register)await (await import('./composition-project.mjs')).registerComposition({output,project:project??output,designProject});
  } catch(error){await rm(output,{recursive:true,force:true});throw error;}
  return {output,project:project??output,sceneDigest:report.sceneDigest,...summary};
}

// Join section files written by separate authors into one composition, in the order the manifest lists them.
// The manifest owns the title and the direction; a part that disagrees is refused rather than silently overridden.
export async function mergeCompositionFiles({file,output}) {
  if(!file||!output)throw new Error('Provide --file parts.json and a new --output composition.json');
  const manifest=JSON.parse(await readFile(file,'utf8')),base=dirname(resolve(file));
  if(!manifest||typeof manifest!=='object'||Object.keys(manifest).some(k=>!['title','direction','parts'].includes(k)))throw new Error('parts.json takes title, direction and parts');
  if(typeof manifest.title!=='string'||!manifest.title.trim())throw new Error('parts.json needs the deck title');
  if(!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.length>40||manifest.parts.some(p=>typeof p!=='string'||!p.trim()))throw new Error('parts.json lists 1–40 section files in deck order');
  const canonical=value=>JSON.stringify(value,(key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const slides=[],owner=new Map(),problems=[],counts=[];
  for(const name of manifest.parts) {
    let part;try{part=JSON.parse(await readFile(resolve(base,name),'utf8'));}catch(error){problems.push(`${name}: cannot be read as JSON (${error.code??error.message})`);continue;}
    if(part?.version!==1||!Array.isArray(part.slides)||!part.slides.length){problems.push(`${name}: is not a composition with slides`);continue;}
    if(canonical(part.direction)!==canonical(manifest.direction))problems.push(`${name}: its direction differs from the deck's; copy the deck direction unchanged`);
    const ids=[],walk=n=>{if(!n||typeof n!=='object')return;if(typeof n.id==='string')ids.push(n.id);if(Array.isArray(n.children))n.children.forEach(walk);};
    for(const s of part.slides){if(!s||typeof s!=='object')continue;if(typeof s.id==='string')ids.push(s.id);walk(s.canvas);for(const c of Array.isArray(s.connect)?s.connect:[])if(typeof c?.id==='string')ids.push(c.id);}
    for(const id of ids){const first=owner.get(id);if(first&&first!==name)problems.push(`${name}: ID ${id} is already used in ${first}; give each section its own ID prefix`);else owner.set(id,name);}
    slides.push(...part.slides);counts.push({part:name,slides:part.slides.length});
  }
  if(slides.length>100)problems.push(`the parts hold ${slides.length} slides; a deck has at most 100`);
  if(problems.length)throw new Error(problems.length===1?problems[0]:`${problems.length} problems to fix:\n${problems.join('\n')}`);
  const merged={version:1,title:manifest.title,...(manifest.direction!==undefined?{direction:manifest.direction}:{}),slides};
  output=resolve(output);await writeFile(output,JSON.stringify(merged,null,2)+'\n',{flag:'wx',mode:0o600});
  return {output,slides:slides.length,parts:counts,next:'compile and preview the whole deck; consistency across sections is judged there'};
}

// Render a folder written by compileCompositionFile. A brand with a native template gets the native emitter.
export async function renderCompositionDir({file,output}) {
  if(!file||!output)throw new Error('Provide --file COMPILED_DIR and a new --output deck.pptx');
  const dir=resolve(file),load=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
  const scene=await load('scene.json'),structure=await load('structure.json'),brand=await load('brand-contract.json');
  await verifyBuiltAssets(dir);
  if(structure.icons?.length&&!brand.design.nativeTemplate)throw new Error('This composition uses icons, which need a brand with a native template');
  const hasReport=await readFile(join(dir,'compose-report.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
  const cached=hasReport?await (await import('./render-bundle.mjs')).cachedCompositionArtifact(dir):null;
  if(cached){try{await copyFile(cached.file,resolve(output),constants.COPYFILE_EXCL);}catch(error){if(error.code!=='EEXIST')await rm(resolve(output),{force:true});throw error;}return {output:resolve(output),slides:scene.slides.length,sha256:cached.result.deckSha256,editable:true,status:'verified native artifact; inspection and acceptance remain separate',emitter:cached.result.emitter,native:cached.result.native,reused:true};}
  return (await import('./pptx-native.mjs')).emitNativePptx({scene,structure,brand,output,base:dir});
}
