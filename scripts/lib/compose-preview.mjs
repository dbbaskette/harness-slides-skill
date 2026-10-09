// Build, render and screen a compiled composition so each slide can be seen and fixed while its design is fresh.
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {auditSceneQuality} from './slide-quality.mjs';
import {renderCompositionDir} from './compose-file.mjs';
import {importDeck,updateDeck,exportPdf,previewPrefix} from '../google-drive-deck.mjs';
import {hash} from './common.mjs';
import {themeFor,color} from './scene.mjs';
import {contrastRatio as contrast} from './compose.mjs';

// Wording that states an order or a dependency. Everyday words such as "after" or "next" alone are not enough.
const relational=/→|->|=>|\b(?:and then|, then|first\b.{1,80}\bthen|leads? to|results? in|depends? on|flows? (?:to|into|through|from)|sends? (?:\w+ ){1,4}to|hands? off to|followed by|versus|vs\.?|step \d|stage \d|phase \d)\b/i;
const numbered=/^\s*(?:(?:step|stage|phase)\s*)?\d+[.):]?\s/i;
const signature=slide=>JSON.stringify(slide.elements.filter(e=>e.role!=='title').map(e=>[e.type,...['x','y','width','height'].map(k=>Math.round(e[k]/20))]));

// The filled shape drawn beneath a box, if any: the last one before it in drawing order that contains it.
const backdrop=(slide,box,before=slide.elements.length)=>slide.elements.slice(0,before).filter(e=>e.type==='shape'&&e.fill&&e.x<=box.x+.5&&e.y<=box.y+.5&&e.x+e.width>=box.x+box.width-.5&&e.y+e.height>=box.y+box.height-.5).at(-1);

// Screens that need no render. They point at slides to look at; they do not approve anything.
export async function screenComposition({scene,structure={groups:[],connectors:[]},native=[],fonts}) {
  const audit=await auditSceneQuality(scene,{fonts}),theme=themeFor(scene);
  // The audit judges text against the slide background. Text on a filled card is judged against that card instead.
  const findings=audit.findings.filter(f=>{
    if(f.code!=='contrast'||!f.object)return true;
    const slide=scene.slides.find(x=>x.id===f.slide),index=slide?.elements.findIndex(e=>e.id===f.object)??-1,e=slide?.elements[index];
    // A shape's own text is already judged against that shape's fill.
    if(!e||e.type==='shape'&&e.fill)return true;
    const card=backdrop(slide,e,index);
    if(!card)return true;
    const size=e.fontSize??theme.bodySize,large=size>=18||e.bold&&size>=14;
    return contrast(color(e.color??'text',theme),color(card.fill,theme))<(large?3:4.5);
  });
  // Cover, section and closing slides are text by design and repeat on purpose.
  const templated=new Set((structure.layouts??[]).map(l=>l.slide));
  for(let i=findings.length-1;i>=0;i--)if(templated.has(findings[i].slide)&&['text-only','similar-geometry','density','measured-text-overflow'].includes(findings[i].code))findings.splice(i,1);
  // Deck-level discipline: one direction for the whole deck, a brief per content slide, and a rhythm that varies.
  const briefs=new Map((structure.briefs??[]).map(b=>[b.slide,b])),content=scene.slides.filter(s=>!templated.has(s.id));
  if(!structure.direction&&content.length)findings.push({slide:content[0].id,severity:'info',code:'no-direction',detail:'This deck has no direction. Decide once which color means "look here", which is the neutral and what each other color stands for, so every slide follows the same rules.'});
  let run=0;
  for(const slide of scene.slides) {
    const brief=briefs.get(slide.id);
    run=(brief?.rhythm??(templated.has(slide.id)?'anchor':'dense'))==='dense'?run+1:0;
    if(run>=4)findings.push({slide:slide.id,severity:'info',code:'dense-run',detail:`${run} dense slides in a row. Give the audience a pause: a section break, one large statement or a single image.`});
    if(templated.has(slide.id))continue;
    if(!brief?.relation)findings.push({slide:slide.id,severity:'info',code:'no-brief',detail:'This slide has no brief. Name the relation between its parts and its focal node, so the form follows from the content.'});
    if(slide.title.trim().split(/\s+/).length<4)findings.push({slide:slide.id,severity:'info',code:'label-title',detail:'The title reads as a label. Write the claim as a sentence the slide then supports.'});
  }
  scene.slides.forEach((slide,index)=>{
    if(templated.has(slide.id))return;
    const body=slide.elements.filter(e=>e.role!=='title'),words=body.map(e=>e.text??'').join(' '),edges=structure.connectors.filter(c=>c.slide===slide.id).length;
    const drawn=body.filter(e=>['shape','image','table','chart'].includes(e.type)).length+(structure.icons??[]).filter(i=>i.slide===slide.id).length,ordered=body.filter(e=>e.type==='shape'&&numbered.test(e.text??'')).length;
    if(ordered>=2&&!edges)findings.push({slide:slide.id,severity:'info',code:'sequence-without-edges',detail:'Numbered boxes with nothing joining them. Add edges if the order matters, or drop the numbers if it does not.'});
    if(relational.test(words)&&!edges&&drawn<=1)findings.push({slide:slide.id,severity:'warn',code:'relational-text-only',detail:'The wording describes a sequence or relationship, but nothing on the slide shows it. Consider nodes joined by edges, or regions that show ownership.'});
    if(index>0&&body.length>1&&!templated.has(scene.slides[index-1].id)&&signature(slide)===signature(scene.slides[index-1])&&!findings.some(f=>f.slide===slide.id&&f.code==='similar-geometry'))findings.push({slide:slide.id,severity:'info',code:'repeats-previous-layout',relatedSlides:[scene.slides[index-1].id],detail:'Same geometry as the previous slide. Keep it only when the two slides are meant to be compared.'});
    for(const icon of (structure.icons??[]).filter(i=>i.slide===slide.id)) {
      const card=backdrop(slide,icon),drawn=native.find(n=>n.id===slide.id)?.icons?.find(i=>i.id===icon.id);
      if(card&&drawn?.colors?.includes(color(card.fill,theme).slice(1).toUpperCase()))findings.push({slide:slide.id,object:icon.id,severity:'warn',code:'icon-blends-into-fill',detail:`Part of this icon is the same color as the ${card.id} fill behind it, so that part disappears. Use a different fill for the card.`});
    }
    for(const id of native.find(n=>n.id===slide.id)?.unattached??[])findings.push({slide:slide.id,object:id,severity:'info',code:'unattached-connector',detail:'This arrow is positioned but not attached, so it will not follow its shapes. Attach works for rect, roundRect, diamond and ellipse.'});
  });
  return findings;
}

export async function previewComposition({file,output,slide,'file-id':fileId,renderer='google',fonts},deps={}) {
  if(!file||!output)throw new Error('Provide --file COMPILED_DIR and a new --output directory');
  if(!['google','local'].includes(renderer))throw new Error('Renderer must be google or local');
  const run=deps.run??promisify(execFile),drive={importDeck,updateDeck,exportPdf,...deps.drive};
  const dir=resolve(file),load=async name=>JSON.parse(await readFile(join(dir,name),'utf8')),scene=await load('scene.json'),structure=await load('structure.json');
  const wanted=slide===undefined?null:scene.slides.findIndex(s=>s.id===slide);
  if(wanted===-1)throw new Error(`No slide ${slide}; choose one of ${scene.slides.map(s=>s.id).join(', ')}`);
  const tool=async(command,args,options)=>{try{return await run(command,args,options);}catch(error){throw new Error(error.code==='ENOENT'?'Poppler (pdfinfo, pdftoppm) is required to turn the render into images: brew install poppler':String(error.message).split('\n')[0]);}};
  // Check the image tools before anything is uploaded, so a missing tool cannot strand a Drive file.
  const pdfinfo=process.env.HARNESS_PDFINFO||'pdfinfo',pdftoppm=process.env.HARNESS_PDFTOPPM||'pdftoppm';await tool(pdfinfo,['-v'],{timeout:15000});await tool(pdftoppm,['-v'],{timeout:15000});
  output=resolve(output);await mkdir(output,{mode:0o700});let remote=null;
  try {
    const deck=join(output,'deck.pptx'),pdf=join(output,'deck.pdf'),built=await renderCompositionDir({file:dir,output:deck});
    if(renderer==='google') {
      remote=fileId?await drive.updateDeck({fileId,file:deck},deps.google):await drive.importDeck({file:deck,name:`${previewPrefix}${scene.title}`},deps.google);
      await drive.exportPdf({fileId:remote.id,output:pdf},deps.google);
    } else {
      const soffice=process.env.HARNESS_SOFFICE||'soffice',profile=join(output,'.office-profile');
      try{await run(soffice,[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--convert-to','pdf','--outdir',output,deck],{timeout:120000,maxBuffer:1024*1024});}
      catch(error){throw new Error(error.code==='ENOENT'?'LibreOffice (soffice) is not installed. Use --renderer google, or install LibreOffice for offline previews.':`Local render failed: ${String(error.message).split('\n')[0]}`);}
      finally{await rm(profile,{recursive:true,force:true});}
      if(!await readFile(pdf).then(()=>true,()=>false))throw new Error('LibreOffice finished without writing a PDF; open the deck to check it');
    }
    const pages=Number((await tool(pdfinfo,[pdf],{timeout:30000,maxBuffer:1024*1024})).stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if(!Number.isInteger(pages))throw new Error('Could not read the page count of the render');
    if(pages!==scene.slides.length)throw new Error(`The render has ${pages} pages for ${scene.slides.length} slides; check the deck for an import problem`);
    const findings=await screenComposition({scene,structure,native:built.native??[],fonts:fonts?JSON.parse(await readFile(fonts,'utf8')):undefined}),slides=[];
    for(const [index,s] of scene.slides.entries()) {
      if(wanted!==null&&wanted!==index)continue;
      const image=`slide-${String(index+1).padStart(2,'0')}.png`;
      await tool(pdftoppm,['-f',String(index+1),'-l',String(index+1),'-singlefile','-scale-to','1600','-png',pdf,join(output,image.replace(/\.png$/,''))],{timeout:60000,maxBuffer:1024*1024});
      slides.push({id:s.id,number:index+1,title:s.title,image:join(output,image),findings:findings.filter(f=>f.slide===s.id).map(({slide:_,metrics,...rest})=>rest)});
    }
    const result={schema:1,output,deck,deckSha256:hash(await readFile(deck)),renderer:renderer==='google'?'Google Slides PDF export':'LibreOffice',emitter:built.emitter,...(remote?{fileId:remote.id,url:remote.url}:{}),slides,
      status:'rendered and screened; open each image and judge it. Screens are prompts to look, not approval.',next:remote?`Reuse this Drive file for the next preview: --file-id ${remote.id}`:undefined};
    await writeFile(join(output,'preview.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    return result;
  } catch(error) {
    await rm(output,{recursive:true,force:true});
    // The upload already happened: say where it is so a retry reuses it instead of creating another file.
    if(remote)throw new Error(`${error.message} The preview deck is in Drive (${remote.url}); retry with --file-id ${remote.id}.`,{cause:error});
    throw error;
  }
}
