import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateScene, themeFor, color, shapeKinds, textRuns } from './scene.mjs';
import { pptxTool } from './presentation-tools.mjs';

export async function renderPptxScene(scene,output,{base=process.cwd(),brand}={}) {
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
      const style={fontFace:t.font,fontSize:e.fontSize??(e.role==='title'?t.titleSize:t.bodySize),color:hex(e.color??'text'),bold:e.bold??false,...(e.strike?{strike:'sngStrike'}:{}),align:e.align??'left',margin:3.6,lineSpacingMultiple:1.25,paraSpaceBefore:0,paraSpaceAfter:0,breakLine:false,...(e.href?{hyperlink:{url:e.href}}:{}),vertAnchor:'ctr',...(e.fill?{fill:{color:hex(e.fill)}}:{})};
      // Text with code is one box of runs, the code runs in the code font. Lines are split here, because PptxGenJS ends
      // a paragraph after every piece of a run it splits at a line break, not only the last.
      const words=e.code?(()=>{const lines=[[]];for(const r of textRuns(e))r.text.split('\n').forEach((piece,i)=>{if(i)lines.push([]);if(piece)lines.at(-1).push({text:piece,options:r.code?{fontFace:t.codeFont}:{}});});
        return lines.flatMap((line,i)=>{const runs=line.length?line:[{text:'',options:{}}];if(i<lines.length-1)runs.at(-1).options={...runs.at(-1).options,breakLine:true};return runs;});})():e.text;
      if(e.type==='text')slide.addText(words,{...box,...style});
      else if(e.type==='shape') {
        slide.addShape(shapeKinds[e.shape??'rect'][0],{...box,fill:e.fill?{color:hex(e.fill)}:{color:hex('background'),transparency:100},line:e.stroke?{color:hex(e.stroke),width:e.strokeWeight??1.5,...(e.dash?{dashType:e.dash==='dot'?'sysDot':'dash'}:{})}:{transparency:100}});
        // The label is a separate box here; keep it inside the preset's own text area so it cannot spill past the outline.
        if(e.text){const [,,,fx,fy]=shapeKinds[e.shape??'rect'];slide.addText(words,{...box,x:box.x+box.w*(1-fx)/2,y:box.y+box.h*(1-fy)/2,w:box.w*fx,h:box.h*fy,...style,objectName:`${e.id}_text`});}
      } else if(e.type==='line')slide.addShape(pptx.ShapeType.line,{...box,flipH:e.flipH??false,flipV:e.flipV??false,line:{color:hex(e.color??'accent'),width:e.weight??2,...(e.dash?{dashType:e.dash==='dot'?'sysDot':'dash'}:{}),...(e.arrow?{endArrowType:'triangle'}:{})}});
      else if(e.type==='table')slide.addTable(e.rows.map((row,i)=>row.map(text=>({text,options:{bold:i===0,color:hex(i===0?(e.headerColor??e.color??'text'):(e.color??'text')),fill:hex(i===0?(e.headerFill??'muted'):(e.bodyFill??'background'))}}))),{...box,...style,margin:e.padding??3.6,valign:'middle',border:{pt:0.5,color:'CCCCCC'},fill:hex('background'),autoPage:false,rowH:e.height/e.rows.length/72,colW:(e.columnWidths??e.rows[0].map(()=>e.width/e.rows[0].length)).map(v=>v/72)});
      else if(e.type==='image') {
        if(/^https?:/.test(e.src))throw new Error('Download authorized images to the workspace before PPTX rendering; no remote fetch during build');
        const path=resolve(base,e.src),imageBytes=await readFile(path);if(imageBytes.length>20*1024*1024)throw new Error('Image exceeds the supported size');const {imageSize}=await import('image-size'),dimensions=imageSize(imageBytes);if(!dimensions.width||!dimensions.height)throw new Error('Image has no actual dimensions');
        slide.addImage({...box,w:dimensions.width/72,h:dimensions.height/72,path,altText:e.alt,sizing:{type:e.fit??'contain',w:box.w,h:box.h}});
      } else {
        const kind=({bar:pptx.ChartType.bar,line:pptx.ChartType.line,pie:pptx.ChartType.pie})[e.chartType];
        slide.addChart(kind,structuredClone(e.series),{...box,showTitle:Boolean(e.title),...(e.title?{title:e.title,titleFontFace:t.font,titleFontSize:e.labelSize??14}:{}),...(e.units?{showValAxisTitle:true,valAxisTitle:e.units,valAxisTitleFontFace:t.font,valAxisTitleFontSize:e.labelSize??14}:{}),showLegend:e.series.length>1,catAxisLabelFontFace:t.font,valAxisLabelFontFace:t.font,catAxisLabelFontSize:e.labelSize??14,valAxisLabelFontSize:e.labelSize??14,showValue:true,valAxisMinVal:e.chartType==='bar'?(()=>{const values=e.series.flatMap(s=>s.values),lo=Math.min(0,...values),hi=Math.max(0,...values);return lo<0?lo-Math.max(1,(hi-lo)*.15):0;})():undefined,varyColors:false,chartColors:e.colors?e.colors.map(hex):[hex('accent'),'777777','AAAAAA']});
      }
    }
  }
  let bytes=await pptx.write({outputType:'nodebuffer'});
  // Runs of text with code each get their own paragraph properties from PptxGenJS; a paragraph may hold only one.
  if(scene.slides.some(s=>s.elements.some(e=>e.code)))bytes=await oneParagraphProperties(bytes);
  if(brand){
    const {checkBrandSources,validateBrandContract}=await import('./brand-contract.mjs');
    validateBrandContract(brand,{medium:'slides'});await checkBrandSources(brand);
    if(!brand.design.nativeTemplate)await writeFile(output,bytes,{flag:'wx',mode:0o600});
    else {
    const native=brand.design.nativeTemplate,layout=Number(native?.layoutPart?.match(/slideLayout(\d+)\.xml$/)?.[1]);
    if(!native?.path||!layout)throw new Error('Brand rendering requires the measured native template and layout');
    if(Math.abs(brand.design.slides.canvas.width-scene.canvas.width)>1||Math.abs(brand.design.slides.canvas.height-scene.canvas.height)>1)throw new Error('Scene and brand canvas differ');
    const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),dir=await mkdtemp(join(tmpdir(),'brand-native-content-'));
    try{const content=join(dir,'content.pptx');await writeFile(content,bytes,{flag:'wx',mode:0o600});await composePptx({root:native.path,sources:[{name:'content',file:content}],slides:scene.slides.map((_,i)=>({source:'content',number:i+1,layout})),output});}finally{await rm(dir,{recursive:true,force:true});}
    }
  }else await writeFile(output,bytes,{flag:'wx',mode:0o600});
  // This call created the file, so one that cannot be read back is removed rather than left under the output name.
  const inventory=await pptxTool('inspect',[output]).catch(async error=>{await rm(output,{force:true}).catch(()=>{});throw error;});
  return {output,slides:inventory.slides.length,sha256:inventory.sha256,editable:true,status:'unreviewed draft',inventory};
}

async function oneParagraphProperties(bytes) {
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{fileURLToPath}=await import('node:url'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');
  const dir=await mkdtemp(join(tmpdir(),'harness-paragraphs-'));
  try{
    const from=join(dir,'runs.pptx'),to=join(dir,'fixed.pptx');await writeFile(from,bytes,{flag:'wx',mode:0o600});
    try{await promisify(execFile)('python3',['-B',fileURLToPath(new URL('./pptx-paragraphs.py',import.meta.url)),from,to],{timeout:60000,maxBuffer:4*1024*1024});}
    catch(error){throw new Error(error.code==='ENOENT'?'Python 3.9+ is required. Run harness-slides doctor.':error.stderr?.trim()||error.message);}
    return await readFile(to);
  }finally{await rm(dir,{recursive:true,force:true});}
}

// Reuse native slide XML, charts and related parts from explicit source templates.
export async function composePptx({root,sources,slides,output}) {
  if(!Array.isArray(sources)||!sources.length||!Array.isArray(slides)||!slides.length)throw new Error('Composition requires sources and selected slides');
  if([root,...sources.map(s=>s.file)].some(f=>resolve(f)===resolve(output)))throw new Error('Output must differ from every source');
  // Normalize XML BOMs in private copies for the strict parser. Native artwork
  // bytes stay unchanged; original templates are never rewritten.
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{fileURLToPath}=await import('node:url'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');
  const dir=await mkdtemp(join(tmpdir(),'harness-compose-')),exec=promisify(execFile),normalizations=[];
  async function copy(file,name){const target=join(dir,name+'.pptx');const {stdout}=await exec('python3',['-B',fileURLToPath(new URL('./pptx-normalize.py',import.meta.url)),resolve(file),target],{timeout:60000,maxBuffer:4*1024*1024});normalizations.push({source:file,...JSON.parse(stdout)});return target;}
  try{
    const module=await import('pptx-automizer'),Automizer=module.Automizer??module.default?.default??module.default;
    const a=new Automizer({removeExistingSlides:true,autoImportSlideMasters:true,cleanup:false});
    a.loadRoot(await copy(root,'root'));
    const names=new Set();for(const [i,s] of sources.entries()){if(!/^[\w-]+$/.test(s.name)||names.has(s.name))throw new Error('Unique source names required');names.add(s.name);a.load(await copy(s.file,'source-'+i),s.name);}
    for(const s of slides){if(!names.has(s.source)||!Number.isInteger(s.number)||s.number<1)throw new Error('Select source and one-based slide number');if(s.layout!==undefined&&(!Number.isInteger(s.layout)||s.layout<1))throw new Error('Native layout must be a positive index');a.addSlide(s.source,s.number,slide=>{if(s.layout)slide.useSlideLayout(s.layout);});}
    a.outputDir=dir+'/';await a.write('composed.pptx');await exec('python3',['-B',fileURLToPath(new URL('./pptx-restore-template.py',import.meta.url)),resolve(root),join(dir,'composed.pptx'),join(dir,'retained.pptx')],{timeout:60000});const inventory=await pptxTool('inspect',[join(dir,'retained.pptx')]);for(const [index,s] of slides.entries())if(s.layout&&inventory.slides[index]?.layoutPart!==`ppt/slideLayouts/slideLayout${s.layout}.xml`)throw new Error('Native layout selection was not retained');await writeFile(output,await readFile(join(dir,'retained.pptx')),{flag:'wx',mode:0o600});
  }finally{await rm(dir,{recursive:true,force:true});}
  return {output,normalizations,status:'native template composition; target-rendered review required',limitations:['Animations and complex layouts require native inspection']};
}
