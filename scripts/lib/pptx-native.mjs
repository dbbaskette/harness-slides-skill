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
  for(const i of icons) {
    const entry=index.entries.find(e=>e.id===i.icon);
    if(!entry)throw new Error(`${i.id}: unknown icon ${i.icon}; search the brand icon library for a current ID`);
    if(!entry.native||!(entry.bounds?.[2]>0)||!(entry.bounds?.[3]>0))throw new Error(`${i.id}: icon ${i.icon} is a picture, not native geometry; choose another`);
  }
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
    slides.push({id:s.id,elements,...(s.notes?{notes:s.notes}:{}),groups:structure.groups.filter(g=>g.slide===s.id).map(({id,members})=>({id,members})),connectors:structure.connectors.filter(c=>c.slide===s.id).map(({id,from,to})=>({id,from,to}))});
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
