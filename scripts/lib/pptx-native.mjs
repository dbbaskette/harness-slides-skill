// Native emitter boundary: turn a compiled scene and its structure into a plan for pptx-native.py.
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {validateScene,themeFor,color} from './scene.mjs';
import {validateBrandContract,checkBrandSources} from './brand-contract.mjs';
import {pptxTool} from './presentation-tools.mjs';

const exec=promisify(execFile);

// Check every requested icon against the brand's hashed library index before anything is built.
export async function checkIcons(structure,brand) {
  const icons=structure.icons??[];if(!icons.length)return null;
  const library=brand.design.slides.icon?.library;
  if(!library?.path||!library?.index||![library.path,library.index].every(path=>brand.sources.some(s=>s.path===path)))throw new Error('This composition uses icons, but the brand contract names no hashed icon library and index');
  const index=JSON.parse(await readFile(library.index,'utf8'));
  const wrong=[];
  for(const i of icons) {
    const entry=index.entries.find(e=>e.id===i.icon);
    if(!entry)wrong.push(`${i.id}: unknown icon ${i.icon}; search the brand icon library for a current ID`);
    else if(!entry.native||!(entry.bounds?.[2]>0)||!(entry.bounds?.[3]>0))wrong.push(`${i.id}: icon ${i.icon} is a picture, not native geometry; choose another`);
  }
  if(wrong.length)throw new Error(wrong.join('\n'));
  return library;
}

export async function emitNativePptx({scene,structure={groups:[],connectors:[]},brand,output,base=process.cwd()}) {
  validateScene(scene);validateBrandContract(brand,{medium:'slides'});await checkBrandSources(brand);
  const native=brand.design.nativeTemplate,sl=brand.design.slides;
  if(!native)throw new Error('The native emitter needs a brand contract with a native template; use pptx render for unbranded decks');
  if(Math.abs(sl.canvas.width-scene.canvas.width)>1||Math.abs(sl.canvas.height-scene.canvas.height)>1)throw new Error('Scene and brand canvas differ');
  const theme=themeFor(scene),hex=value=>color(value,theme),slides=[];
  for(const s of scene.slides) {
    const elements=[];
    for(const e of s.elements) {
      if(e.type==='table'||e.type==='chart')throw new Error(`${e.id}: the native emitter does not write ${e.type} objects yet; use pptx render`);
      if(e.href)throw new Error(`${e.id}: the native emitter does not write hyperlinks yet; use pptx render`);
      const out={...e};
      if(e.type==='text'||e.type==='shape'&&e.text!==undefined){out.fontSize=e.fontSize??(e.role==='title'?theme.titleSize:theme.bodySize);out.color=hex(e.color??'text');}
      if(e.fill)out.fill=hex(e.fill);
      if(e.stroke)out.stroke=hex(e.stroke);
      if(e.type==='line')out.color=hex(e.color??'accent');
      if(e.type==='image') {
        if(/^https?:/.test(e.src))throw new Error('Download authorized images to the workspace before PPTX rendering; no remote fetch during build');
        const path=resolve(base,e.src),bytes=await readFile(path);
        if(bytes.length>20*1024*1024)throw new Error('Image exceeds the supported size');
        const {imageSize}=await import('image-size'),dimensions=imageSize(bytes);
        if(!dimensions.width||!dimensions.height)throw new Error('Image has no actual dimensions');
        Object.assign(out,{path,pixelWidth:dimensions.width,pixelHeight:dimensions.height});
      }
      elements.push(out);
    }
    // Icons take their recorded place in the drawing order, so they sit and group with their neighbours.
    // Each order was recorded against the scene's own elements, so earlier insertions shift later ones by one.
    for(const [n,icon] of (structure.icons??[]).filter(i=>i.slide===s.id).sort((a,b)=>a.order-b.order).entries()){const {slide:_,order,...rest}=icon;elements.splice(Math.min(order+n,elements.length),0,{type:'icon',...rest});}
    const chosen=(structure.layouts??[]).find(l=>l.slide===s.id);
    slides.push({id:s.id,...(chosen?{layout:chosen.layout,placeholders:chosen.placeholders}:{}),elements,...(s.notes?{notes:s.notes}:{}),groups:structure.groups.filter(g=>g.slide===s.id).map(({id,members})=>({id,members})),connectors:structure.connectors.filter(c=>c.slide===s.id).map(({id,from,to})=>({id,from,to}))});
  }
  const iconLibrary=await checkIcons(structure,brand);
  const plan={layoutPart:native.layoutPart,...(iconLibrary?{iconLibrary}:{}),font:brand.design.fontFamily,shapeInset:sl.spacing?.inset??16,slides};
  const dir=await mkdtemp(join(tmpdir(),'harness-native-'));
  try {
    const planFile=join(dir,'plan.json');await writeFile(planFile,JSON.stringify(plan),{flag:'wx',mode:0o600});
    let stdout;
    try{({stdout}=await exec('python3',['-B',fileURLToPath(new URL('./pptx-native.py',import.meta.url)),'emit',resolve(native.path),planFile,resolve(output)],{timeout:120000,maxBuffer:16*1024*1024}));}
    catch(error){throw new Error(error.code==='ENOENT'?'Python 3.9+ is required. Run harness-slides doctor.':error.stderr?.trim()||error.message);}
    const emitted=JSON.parse(stdout),inventory=await pptxTool('inspect',[resolve(output)]);
    return {output:resolve(output),slides:emitted.slides,sha256:inventory.sha256,editable:true,status:'unreviewed draft',emitter:'native template',layoutPart:emitted.layoutPart,titlePlaceholder:emitted.titlePlaceholder,removedTemplateParts:emitted.removedTemplateParts,icons:emitted.report.flatMap(r=>r.icons),native:emitted.report};
  } finally{await rm(dir,{recursive:true,force:true});}
}

// The template's layouts by name, with the placeholders a composition can fill.
export async function templateLayouts(brand) {
  if(!brand)throw new Error('Provide --brand brand-contract.json');
  validateBrandContract(brand,{medium:'slides'});await checkBrandSources(brand);
  const native=brand.design.nativeTemplate;
  if(!native)throw new Error('This brand contract has no native template, so there are no template layouts to choose');
  let stdout;
  try{({stdout}=await exec('python3',['-B',fileURLToPath(new URL('./pptx-native.py',import.meta.url)),'layouts',resolve(native.path),native.layoutPart],{timeout:60000,maxBuffer:4*1024*1024}));}
  catch(error){throw new Error(error.code==='ENOENT'?'Python 3.9+ is required. Run harness-slides doctor.':error.stderr?.trim()||error.message);}
  const found=JSON.parse(stdout);
  return {default:found.default,layouts:found.layouts.map(l=>({name:l.name,title:Boolean(l.title),subtitles:l.subtitles.length,pictures:l.pictures,canvas:l.default,...(l.subtitled?{subtitled:true}:{})})),use:'A content slide that sets a subtitle moves to the layout marked subtitled, and keeps its canvas. A slide on the default layout has a canvas. A slide that names another layout fills its title and up to that many subtitle lines, and has no canvas. A layout with pictures reserves an area for a photo that compositions cannot fill yet, so it renders as an empty panel; prefer layouts with pictures: 0. A layout with title: false shows no title.'};
}

// Catch a misspelled or overfilled template layout at compile, not at render.
export async function checkLayouts(structure,brand) {
  const wanted=structure.layouts??[];if(!wanted.length)return;
  if(!brand.design.nativeTemplate){if(wanted.every(w=>w.layout==='@subtitled'))return;throw new Error('This composition uses template layouts, which need a brand with a native template');}
  const {layouts}=await templateLayouts(brand),tidy=name=>String(name).replace(/\s+/g,' ').trim();
  const wrong=[];
  for(const w of wanted) {
    if(w.layout==='@subtitled'){if(!layouts.some(l=>l.subtitled))wrong.push(`${w.slide}: the template has no layout with a title, a subtitle line and an open canvas; remove the subtitle`);continue;}
    const match=layouts.find(l=>tidy(l.name)===tidy(w.layout));
    if(!match)wrong.push(`${w.slide}: the template has no layout named ${w.layout}. Available: ${layouts.map(l=>l.name).join(', ')}`);
    else if(w.placeholders.length>match.subtitles)wrong.push(`${w.slide}: layout ${match.name} has ${match.subtitles} subtitle placeholders; remove the extra text`);
  }
  if(wrong.length)throw new Error(wrong.join('\n'));
}
