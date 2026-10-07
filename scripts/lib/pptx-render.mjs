import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateScene, themeFor, color } from './scene.mjs';
import { pptxTool } from './presentation-tools.mjs';

export async function renderPptxScene(scene,output,{base=process.cwd()}={}) {
  validateScene(scene); if(scene.mode!=='new')throw new Error('Rebuilding a PPTX from a scene can lose source parts. Use guarded patches or template composition for existing decks.');
  const {default:PptxGenJS}=await import('pptxgenjs');
  const pptx=new PptxGenJS(),t=themeFor(scene),hex=v=>color(v,t).slice(1);
  pptx.defineLayout({name:'SCENE',width:scene.canvas.width/72,height:scene.canvas.height/72});pptx.layout='SCENE';
  pptx.title=scene.title;pptx.author='Harness Slides';pptx.subject='Editable scene';pptx.lang='en-US';
  for(const s of scene.slides) {
    const slide=pptx.addSlide();slide.background={color:hex('background')};
    if(s.notes)slide.addNotes(s.notes);
    for(const e of s.elements) {
      const box={x:e.x/72,y:e.y/72,w:e.width/72,h:e.height/72,objectName:e.id};
      const style={fontFace:t.font,fontSize:e.fontSize??(e.role==='title'?t.titleSize:t.bodySize),color:hex(e.color??'text'),bold:e.bold??false,align:e.align??'left',margin:3.6,breakLine:false,vertAnchor:'ctr'};
      if(e.type==='text')slide.addText(e.text,{...box,...style});
      else if(e.type==='shape') {
        slide.addShape(e.shape==='ellipse'?pptx.ShapeType.ellipse:pptx.ShapeType.rect,{...box,fill:e.fill?{color:hex(e.fill)}:{color:hex('background'),transparency:100},line:{transparency:100}});
        if(e.text)slide.addText(e.text,{...box,...style,objectName:`${e.id}_text`});
      } else if(e.type==='line')slide.addShape(pptx.ShapeType.line,{...box,line:{color:hex(e.color??'accent'),width:e.weight??2,...(e.arrow?{endArrowType:'triangle'}:{})}});
      else if(e.type==='table')slide.addTable(e.rows.map((row,i)=>row.map(text=>({text,options:{bold:i===0,fill:hex(i===0?'muted':'background')}}))),{...box,...style,valign:'middle',border:{pt:0.5,color:'CCCCCC'},fill:hex('background'),autoPage:false,rowH:e.height/e.rows.length/72,colW:Array(e.rows[0].length).fill(e.width/e.rows[0].length/72)});
      else if(e.type==='image') {
        if(/^https?:/.test(e.src))throw new Error('Download authorized images to the workspace before PPTX rendering; no remote fetch during build');
        const path=resolve(base,e.src);await readFile(path);
        slide.addImage({...box,path,altText:e.alt,sizing:{type:e.fit??'contain',w:box.w,h:box.h}});
      } else {
        const kind=({bar:pptx.ChartType.bar,line:pptx.ChartType.line,pie:pptx.ChartType.pie})[e.chartType];
        slide.addChart(kind,structuredClone(e.series),{...box,showTitle:false,showLegend:e.series.length>1,catAxisLabelFontFace:t.font,valAxisLabelFontFace:t.font,catAxisLabelFontSize:14,valAxisLabelFontSize:14,showValue:true,valAxisMinVal:e.chartType==='bar'?0:undefined,varyColors:false,chartColors:[hex('accent'),'777777','AAAAAA']});
      }
    }
  }
  const bytes=await pptx.write({outputType:'nodebuffer'});
  await writeFile(output,bytes,{flag:'wx',mode:0o600});
  const inventory=await pptxTool('inspect',[output]);
  return {output,slides:inventory.slides.length,sha256:inventory.sha256,editable:true,status:'unreviewed draft',inventory};
}

// Reuse native slide XML, charts and related parts from explicit source templates.
export async function composePptx({root,sources,slides,output}) {
  if(!Array.isArray(sources)||!sources.length||!Array.isArray(slides)||!slides.length)throw new Error('Composition requires sources and selected slides');
  if([root,...sources.map(s=>s.file)].some(f=>resolve(f)===resolve(output)))throw new Error('Output must differ from every source');
  const module=await import('pptx-automizer'),Automizer=module.Automizer??module.default?.default??module.default;
  const a=new Automizer({removeExistingSlides:true,autoImportSlideMasters:true,cleanup:false});
  a.loadRoot(resolve(root));
  const names=new Set();for(const s of sources){if(!/^[\w-]+$/.test(s.name)||names.has(s.name))throw new Error('Unique source names required');names.add(s.name);a.load(resolve(s.file),s.name);}
  for(const s of slides){if(!names.has(s.source)||!Number.isInteger(s.number)||s.number<1)throw new Error('Select source and one-based slide number');a.addSlide(s.source,s.number);}
  // Automizer writes directly; reserve a private directory and publish exclusively.
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'harness-compose-'));
  try{a.outputDir=dir+'/';await a.write('composed.pptx');await pptxTool('inspect',[join(dir,'composed.pptx')]);await writeFile(output,await readFile(join(dir,'composed.pptx')),{flag:'wx',mode:0o600});}
  finally{await rm(dir,{recursive:true,force:true});}
  return {output,status:'native template composition; target-rendered review required',limitations:['Animations and complex layouts require native inspection']};
}
