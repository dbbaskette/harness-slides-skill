// Native emitter boundary: turn a compiled scene and its structure into a plan for pptx-native.py.
import {readFile,writeFile,mkdtemp,rm,copyFile,constants} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {validateScene,themeFor,color} from './scene.mjs';
import {validateBrandContract,checkBrandSources} from './brand-contract.mjs';
import {pptxTool} from './presentation-tools.mjs';

const exec=promisify(execFile);

// Where each requested icon goes, fitted inside its reserved square without changing its proportions.
async function iconPlan(scene,structure,brand) {
  const icons=structure.icons??[];if(!icons.length)return [];
  const library=brand.design.slides.icon?.library;
  if(!library?.path||!library?.index||![library.path,library.index].every(path=>brand.sources.some(s=>s.path===path)))throw new Error('This composition uses icons, but the brand contract names no hashed icon library and index');
  const index=JSON.parse(await readFile(library.index,'utf8'));
  return icons.map(i=>{
    const entry=index.entries.find(e=>e.id===i.icon),slide=scene.slides.findIndex(s=>s.id===i.slide)+1;
    if(!entry)throw new Error(`${i.id}: unknown icon ${i.icon}; search the brand icon library for a current ID`);
    if(!entry.native)throw new Error(`${i.id}: icon ${i.icon} is a picture, not native geometry; choose another`);
    if(!slide)throw new Error(`${i.id}: icon belongs to no slide of this scene`);
    const ratio=entry.bounds[2]/entry.bounds[3],width=ratio>=1?i.width:i.width*ratio,height=width/ratio;
    return {id:i.id,icon:i.icon,label:entry.label,request:{source:library.path,index:library.index,ident:i.icon,slide,x:(i.x+(i.width-width)/2)/72,y:(i.y+(i.height-height)/2)/72,width:width/72}};
  });
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
    slides.push({id:s.id,elements,...(s.notes?{notes:s.notes}:{}),groups:structure.groups.filter(g=>g.slide===s.id).map(({id,members})=>({id,members})),connectors:structure.connectors.filter(c=>c.slide===s.id).map(({id,from,to})=>({id,from,to}))});
  }
  const icons=await iconPlan(scene,structure,brand);
  const plan={layoutPart:native.layoutPart,font:brand.design.fontFamily,shapeInset:sl.spacing?.inset??16,slides};
  const dir=await mkdtemp(join(tmpdir(),'harness-native-'));
  try {
    const planFile=join(dir,'plan.json');await writeFile(planFile,JSON.stringify(plan),{flag:'wx',mode:0o600});
    let stdout;
    // Icons are added to private copies; the output appears only when every step has succeeded.
    const first=icons.length?join(dir,'step-0.pptx'):resolve(output);
    try{({stdout}=await exec('python3',['-B',fileURLToPath(new URL('./pptx-native.py',import.meta.url)),'emit',resolve(native.path),planFile,first],{timeout:120000,maxBuffer:16*1024*1024}));}
    catch(error){throw new Error(error.code==='ENOENT'?'Python 3.9+ is required. Run harness-slides doctor.':error.stderr?.trim()||error.message);}
    let current=first;
    for(const [n,icon] of icons.entries()){const next=join(dir,`step-${n+1}.pptx`);try{await pptxTool('icon-copy',[JSON.stringify({...icon.request,target:current,output:next})]);}catch(error){throw new Error(`${icon.id}: ${error.message}`);}current=next;}
    if(icons.length)await copyFile(current,resolve(output),constants.COPYFILE_EXCL);
    const emitted=JSON.parse(stdout),inventory=await pptxTool('inspect',[resolve(output)]);
    return {output:resolve(output),slides:emitted.slides,sha256:inventory.sha256,editable:true,status:'unreviewed draft',emitter:'native template',layoutPart:emitted.layoutPart,titlePlaceholder:emitted.titlePlaceholder,removedTemplateParts:emitted.removedTemplateParts,icons:icons.map(({id,icon,label})=>({id,icon,label})),native:emitted.report};
  } finally{await rm(dir,{recursive:true,force:true});}
}
