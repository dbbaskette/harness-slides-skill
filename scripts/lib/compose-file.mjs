// File boundary for compositions: read inputs, enforce the design gate, write a new output folder.
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {compileComposition} from './compose.mjs';
import {checkBrandSources,neutralBrandContract} from './brand-contract.mjs';
import {requireSceneDesign} from './design-session.mjs';
import {digest,hash} from './common.mjs';

// What the composition asks of the brand's icon library and template, read straight from the file so it can be checked even when a slide does not compile.
function requested(comp) {
  const icons=[],layouts=[],walk=n=>{if(!n||typeof n!=='object')return;if(n.type==='icon'&&typeof n.id==='string')icons.push({id:n.id,icon:n.icon});if(Array.isArray(n.children))n.children.forEach(walk);};
  for(const s of Array.isArray(comp?.slides)?comp.slides:[]){if(!s||typeof s!=='object')continue;if(s.layout!==undefined)layouts.push({slide:s.id,layout:s.layout,placeholders:['subtitle','detail'].filter(k=>s[k]!==undefined)});else walk(s.canvas);}
  return {icons,layouts};
}
const lines=error=>error.message.split('\n').filter(line=>!/^\d+ problems to fix:$/.test(line));

// Without --output this only checks: every structure, fit, icon and layout problem comes back from one run and nothing is written.
export async function compileCompositionFile({file,brand,output,fonts,'design-project':designProject}) {
  if(!file)throw new Error('Provide --file composition.json, and a new --output directory to write the build');
  const bytes=await readFile(file),brandBytes=brand?await readFile(brand):null;
  const contract=brandBytes?JSON.parse(brandBytes):await neutralBrandContract();
  await checkBrandSources(contract);
  const comp=JSON.parse(bytes),problems=[];let compiled;
  try{compiled=await compileComposition(comp,contract,{fonts:fonts?JSON.parse(await readFile(fonts)):undefined});}catch(error){problems.push(...lines(error));}
  // Unknown or picture-only icons and unknown layouts are caught now, not when the deck is rendered, and alongside everything else.
  const native=await import('./pptx-native.mjs'),wanted=compiled?.structure??requested(comp);
  for(const check of [native.checkIcons,native.checkLayouts])try{await check(wanted,contract);}catch(error){problems.push(...lines(error));}
  if(problems.length)throw new Error(problems.length===1?problems[0]:`${problems.length} problems to fix:\n${problems.join('\n')}`);
  const {scene,structure,report}=compiled;
  const summary={slides:scene.slides.length,brandRevision:contract.revision,measurement:report.measurement,groups:structure.groups.length,connectors:structure.connectors.length,icons:structure.icons.length,room:Object.fromEntries(report.room.map(r=>[r.slide,`${r.needs} of ${r.has}`])),...(structure.adjusted?.length?{weightOverridden:structure.adjusted}:{}),...(structure.reading?.length?{readingSizeInLiveDeck:structure.reading.map(r=>`${r.slide}: ${r.nodes.length} items at ${r.size}pt`)}:{})};
  if(!output)return {status:'fits; nothing written. Add a new --output directory to write the build',...summary};
  const approved=await requireSceneDesign(scene,designProject);
  if(approved)report.designRevision=approved.revision;
  const assets=[];
  for(const s of scene.slides)for(const e of s.elements)if(e.type==='image'&&!/^https:\/\//.test(e.src)) {
    const path=resolve(dirname(resolve(file)),e.src);
    e.src=path;assets.push({object:e.id,path,sha256:hash(await readFile(path))});
  }
  report.inputs={composition:{path:resolve(file),sha256:hash(bytes)},brand:brand?{path:resolve(brand),sha256:hash(brandBytes)}:{kind:'neutral defaults',revision:contract.revision},assets};
  report.sceneDigest=digest(scene);report.structureDigest=digest(structure);
  output=resolve(output);await mkdir(output,{mode:0o700});
  try {
    for(const [name,value] of [['scene.json',scene],['structure.json',structure],['compose-report.json',report],['brand-contract.json',contract]])
      await writeFile(join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  } catch(error){await rm(output,{recursive:true,force:true});throw error;}
  return {output,sceneDigest:report.sceneDigest,...summary};
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
  if(structure.icons?.length&&!brand.design.nativeTemplate)throw new Error('This composition uses icons, which need a brand with a native template');
  if(structure.layouts?.length&&!brand.design.nativeTemplate)throw new Error('This composition uses template layouts, which need a brand with a native template');
  if(brand.design.nativeTemplate)return (await import('./pptx-native.mjs')).emitNativePptx({scene,structure,brand,output,base:dir});
  const {inventory,...result}=await (await import('./pptx-render.mjs')).renderPptxScene(scene,resolve(output),{base:dir});
  return {...result,emitter:'generated deck; the brand contract has no native template'};
}
