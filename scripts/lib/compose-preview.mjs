// Build, render and screen a compiled composition so each slide can be seen and fixed while its design is fresh.
import {readFile,writeFile,mkdir,rm,copyFile,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {auditSceneQuality} from './slide-quality.mjs';
import {renderCompositionDir} from './compose-file.mjs';
import {importDeck,updateDeck,exportPdf,previewPrefix} from '../google-drive-deck.mjs';
import {hash,regularInside,digest} from './common.mjs';
import {requireSceneDesign} from './design-session.mjs';
import {refuse} from './refusals.mjs';
import {themeFor,color} from './scene.mjs';
import {contrastRatio as contrast} from './compose.mjs';
import {writeContactSheet} from './contact-sheet.mjs';
import {splitPoints,internalSource,asciiArt,repairClusters} from './compose-audit.mjs';

// Wording that states an order or a dependency. Everyday words such as "after" or "next" alone are not enough.
const relational=/→|->|=>|\b(?:and then|, then|first\b.{1,80}\bthen|leads? to|results? in|depends? on|flows? (?:to|into|through|from)|sends? (?:\w+ ){1,4}to|hands? off to|followed by|versus|vs\.?|step \d|stage \d|phase \d)\b/i;
const numbered=/^\s*(?:(?:step|stage|phase)\s*)?\d+[.):]?\s/i;
const signature=slide=>JSON.stringify(slide.elements.filter(e=>e.role!=='title').map(e=>[e.type,...['x','y','width','height'].map(k=>Math.round(e[k]/20))]));

// The filled shape drawn beneath a box, if any: the last one before it in drawing order that contains it.
const backdrop=(slide,box,before=slide.elements.length)=>slide.elements.slice(0,before).filter(e=>e.type==='shape'&&e.fill&&e.x<=box.x+.5&&e.y<=box.y+.5&&e.x+e.width>=box.x+box.width-.5&&e.y+e.height>=box.y+box.height-.5).at(-1);

// Screens that need no render. They point at slides to look at; they do not approve anything.
export async function screenComposition({scene,structure={groups:[],connectors:[]},native=[],fonts,outline,delivery='reading'}) {
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
  // A content slide that only borrows the template's subtitle line is still a content slide.
  const templated=new Set((structure.layouts??[]).filter(l=>l.layout!=='@subtitled').map(l=>l.slide));
  for(const id of structure.unspoken??[])findings.push({slide:id,severity:'info',code:'no-notes',detail:'This deck is presented live and the slide has no speaker notes. Say what the presenter says here and name the source behind the claim.'});
  for(const r of structure.reading??[])findings.push({slide:r.slide,severity:'warn',code:'reading-size-in-live-deck',detail:`${r.nodes.length} text items here are set at ${r.size}pt, the reading size, in a deck delivered live at ${r.live}pt. Cut words, split the slide or restructure instead of shrinking the type.`});
  for(const u of structure.unverifiedFit??[])findings.push({slide:u.slide,object:u.id,severity:'warn',code:'unverified-fit',detail:`${u.detail}. The brand font was unavailable, so this was measured by estimate: look at the render.`});
  for(const a of structure.adjusted??[])findings.push({slide:a.slide,object:a.id,severity:'warn',code:'weight-overridden',detail:`${a.id} was given ${a.got}pt, not the ${a.asked}pt its weight asked for, because its content or a neighbour's needs more room. If the proportion is the point, use empty boxes or less text.`});
  for(let i=findings.length-1;i>=0;i--)if(templated.has(findings[i].slide)&&['text-only','similar-geometry','density','measured-text-overflow','title-value-needs-support','content-collision'].includes(findings[i].code))findings.splice(i,1);
  // Words over a picture are deliberate here: the compiler has already refused any that lack a filled box behind them.
  const pictures=new Set(scene.slides.flatMap(s=>s.elements.filter(e=>e.type==='image').map(e=>`${s.id}/${e.id}`)));
  for(let i=findings.length-1;i>=0;i--){const f=findings[i];if(f.code==='content-collision'&&[f.object,...(f.relatedObjects??[])].some(id=>pictures.has(`${f.slide}/${id}`)))findings.splice(i,1);}
  // Deck-level discipline: one direction for the whole deck, a brief per content slide, and a rhythm that varies.
  const briefs=new Map((structure.briefs??[]).map(b=>[b.slide,b])),content=scene.slides.filter(s=>!templated.has(s.id));
  if(!structure.direction&&content.length)findings.push({slide:content[0].id,severity:'info',code:'no-direction',detail:'This deck has no direction. Decide once which color means "look here", which is the neutral and what each other color stands for, so every slide follows the same rules.'});
  // A long deck needs colors that mean something. Without meanings the build fell back on supporting colors from the brand.
  if(structure.direction&&!Object.keys(structure.direction.meanings??{}).length&&content.length>10)findings.push({slide:content[0].id,severity:'warn',code:'no-meanings',detail:`This deck has ${content.length} content slides and its direction gives no color a meaning, so cards can only be told apart by position.${structure.supporting?.length?` The build allowed the brand's supporting colors (${structure.supporting.join(', ')});`:''} Name two or three meanings in the direction, such as one product or one state, and fill tint or bar cards with them.`});
  // An approved sentence chopped into nodes. In a deck read without a presenter it misleads, so it blocks delivery.
  if(outline)findings.push(...splitPoints(outline,scene,{severity:delivery==='live'?'warn':'error'}));
  let run=0;
  for(const slide of scene.slides) {
    const brief=briefs.get(slide.id);
    // A slide with no brief has no declared rhythm, so it neither extends nor is blamed for a dense run.
    run=brief?.rhythm==='dense'?run+1:0;
    if(run>=4)findings.push({slide:slide.id,severity:'info',code:'dense-run',detail:`${run} dense slides in a row. Give the audience a pause: a section break, one large statement or a single image.`});
    if(templated.has(slide.id))continue;
    if(!brief?.relation)findings.push({slide:slide.id,severity:'info',code:'no-brief',detail:'This slide has no brief. Name the relation between its parts and its focal node, so the form follows from the content.'});
    // Only short titles in a spaced script are judged; a three-word claim with a number is still a claim.
    if(/^[\x20-\x7E]+$/.test(slide.title)&&slide.title.trim().split(/\s+/).length<3&&!/\d/.test(slide.title))findings.push({slide:slide.id,severity:'info',code:'label-title',detail:'The title reads as a label. Write the claim as a sentence the slide then supports.'});
  }
  const labelled=[];
  scene.slides.forEach((slide,index)=>{
    if(templated.has(slide.id))return;
    const body=slide.elements.filter(e=>e.role!=='title'),words=body.map(e=>e.text??'').join(' '),edges=structure.connectors.filter(c=>c.slide===slide.id).length;
    const drawn=body.filter(e=>['shape','image','table','chart'].includes(e.type)).length+(structure.icons??[]).filter(i=>i.slide===slide.id).length,ordered=body.filter(e=>e.type==='shape'&&numbered.test(e.text??'')).length;
    if(ordered>=2&&!edges)findings.push({slide:slide.id,severity:'info',code:'sequence-without-edges',detail:'Numbered boxes with nothing joining them. Add edges if the order matters, or drop the numbers if it does not.'});
    if(relational.test(words)&&!edges&&drawn<=1)findings.push({slide:slide.id,severity:'warn',code:'relational-text-only',detail:'The wording describes a sequence or relationship, but nothing on the slide shows it. Consider nodes joined by edges, or regions that show ownership.'});
    if(index>0&&body.length>1&&!templated.has(scene.slides[index-1].id)&&signature(slide)===signature(scene.slides[index-1])&&!findings.some(f=>f.slide===slide.id&&f.code==='similar-geometry'))findings.push({slide:slide.id,severity:'info',code:'repeats-previous-layout',relatedSlides:[scene.slides[index-1].id],detail:'Same geometry as the previous slide. Keep it only when the two slides are meant to be compared.'});
    for(const icon of (structure.icons??[]).filter(i=>i.slide===slide.id)) {
      const card=backdrop(slide,icon),drawn=native.find(n=>n.id===slide.id)?.icons?.find(i=>i.id===icon.id);
      // A solid icon's glyph sits on its own disc, so only its other colors can disappear into the card.
      if(card&&drawn?.colors?.filter(c=>!icon.glyph||c.toUpperCase()!==icon.glyph.slice(1).toUpperCase()).includes(color(card.fill,theme).slice(1).toUpperCase()))findings.push({slide:slide.id,object:icon.id,severity:'warn',code:'icon-blends-into-fill',detail:`Part of this icon is the same color as the ${card.id} fill behind it, so that part disappears. Use a different fill for the card.`});
    }
    // An icon has a job: it marks one thing, and the words that say what are right beside it.
    const here=(structure.icons??[]).filter(i=>i.slide===slide.id),counts=new Map();
    for(const icon of here)counts.set(icon.icon,(counts.get(icon.icon)??0)+1);
    for(const [name,count] of counts)if(count>=3)findings.push({slide:slide.id,object:here.find(i=>i.icon===name).id,severity:'warn',code:'icon-repeated',detail:`The same icon appears ${count} times on this slide, so it tells nothing apart. Give each thing its own icon, or use none.`});
    const texts=slide.elements.filter(e=>e.text&&e.role!=='title'),centre=b=>({x:b.x+b.width/2,y:b.y+b.height/2});
    for(const icon of here) {
      const c=centre(icon),reach=Math.max(icon.width,icon.height)*2.5,near=texts.map(e=>({e,d:Math.hypot(Math.max(e.x-c.x,0,c.x-e.x-e.width),Math.max(e.y-c.y,0,c.y-e.y-e.height))})).filter(x=>x.d<=reach).sort((a,b)=>a.d-b.d)[0];
      if(!near)findings.push({slide:slide.id,object:icon.id,severity:'warn',code:'icon-alone',detail:'No words sit beside this icon, so it cannot be read. Put its label next to it, or remove it.'});
      else labelled.push({slide:slide.id,id:icon.id,icon:icon.icon,label:near.e.text.split('\n')[0].trim().toLowerCase()});
    }
    for(const id of native.find(n=>n.id===slide.id)?.unattached??[])findings.push({slide:slide.id,object:id,severity:'info',code:'unattached-connector',detail:'This arrow is positioned but not attached, so it will not follow its shapes. An arrow attaches to a box of any shape, a text and an icon with a disc or ring, not to a plain icon.'});
    const source=slide.elements.find(e=>e.id===`${slide.id}_source`);
    if(source&&internalSource(source.text))findings.push({slide:slide.id,object:source.id,severity:'warn',code:'internal-source',detail:`The source line "${source.text}" reads as internal provenance, not a citation the audience can follow. Cite the document by name, such as "Tanzu for Postgres 4.5 documentation", and move finding or objective IDs to the slide's provenance, which goes into the speaker notes.`});
    for(const e of body.filter(e=>typeof e.text==='string'&&!/_state$/.test(e.id)&&asciiArt(e.text)))findings.push({slide:slide.id,object:e.id,severity:'warn',code:'ascii-art',detail:`"${e.text.slice(0,40)}" fakes a drawing with characters. Draw an edge (style: "dashed" or "dotted" for a weaker link), mark a node with state: "struck" or "failed", or remove the placeholder.`});
  });
  // One icon should mean one thing across the deck.
  const meanings=new Map();
  for(const use of labelled){const first=meanings.get(use.icon);if(!first)meanings.set(use.icon,use);else if(first.label!==use.label&&first.slide!==use.slide)findings.push({slide:use.slide,object:use.id,severity:'info',code:'icon-two-meanings',detail:`This icon is labelled "${use.label}" here and "${first.label}" on ${first.slide}. Keep one icon to one meaning.`});}
  return findings;
}

// What a reviewer is asked about each slide. The answers are yes or no; a no is a finding.
export const criticQuestions=[
  'After three seconds, is the main point clear, and is it the claim in the title?',
  'Does the eye land first on the element that carries the point?',
  'Is there exactly one emphasis?',
  'Does every element support the title?',
  'Is each label inside or right beside what it names?',
  'Is the space balanced, with nothing stranded or crowded?',
  'Is the slide consistent with its neighbours in style, and different from them in layout unless they are meant to be compared?',
  'Does every image and icon explain something?',
];
const grades={critical:'The slide misleads, cannot be read, or its point cannot be found. Blocks delivery.',major:'The slide works but is clearly weaker than it should be. Fix it.',minor:'A small flaw. Log it.'};

// Record a reviewer's answers against the exact render they looked at. A critical finding blocks delivery until a new render clears it.
export async function recordCritique({file,assessment}) {
  if(!file||!assessment)throw new Error('Provide --file PREVIEW_DIR and --assessment critique.json');
  const dir=resolve(file),packet=JSON.parse(await readFile(join(dir,'critic.json'),'utf8').catch(()=>{throw new Error('No critic packet here; run compose preview on the whole deck, without --slide');}));
  await verifyCriticPacket(dir,packet);
  const record=assessCompositionCritique(packet,JSON.parse(await readFile(assessment,'utf8'))),blocked=record.critical>0;
  await writeFile(join(dir,'critique.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600}).catch(error=>{throw new Error(error.code==='EEXIST'?'This render already has a critique; fix the slides, preview again and critique the new render':error.message);});
  return {critique:join(dir,'critique.json'),reviewer:record.reviewer,critical:record.critical,major:record.major,minor:record.minor,status:record.status,next:blocked?'Do not deliver. Fix each critical finding, preview the deck again and have the new render critiqued.':record.major?'Fix the major findings in one pass, then preview again. Undo any fix that causes a new finding.':'Clear to show the user.'};
}

export function assessCompositionCritique(packet,given){
  const problems=[],ids=new Set(packet.slides.map(s=>s.id));
  if(!given||typeof given!=='object'||Object.keys(given).some(k=>!['deckSha256','reviewer','findings','weakest','slides'].includes(k)))throw new Error('A critique takes deckSha256, reviewer, slides, findings and weakest');
  if(given.deckSha256!==packet.deckSha256)problems.push('deckSha256 is not the deck this packet describes; critique the latest render');
  if(!['independent','author'].includes(given.reviewer))problems.push('reviewer is independent (did not write the slides) or author');
  if(!Array.isArray(given.findings))problems.push('findings is a list; use an empty list when there are none');
  for(const [n,f] of (Array.isArray(given.findings)?given.findings:[]).entries()) {
    const where=`finding ${n+1}`;
    if(!f||typeof f!=='object'||Object.keys(f).some(k=>!['slide','question','severity','note','fix'].includes(k))){problems.push(`${where}: takes slide, question, severity, note and fix`);continue;}
    if(!ids.has(f.slide))problems.push(`${where}: no slide ${f.slide} in this deck`);
    if(!Number.isInteger(f.question)||f.question<1||f.question>criticQuestions.length)problems.push(`${where}: question is 1 to ${criticQuestions.length}`);
    if(!Object.hasOwn(grades,f.severity))problems.push(`${where}: severity is critical, major or minor`);
    if(typeof f.note!=='string'||f.note.trim().length<12)problems.push(`${where}: note says what is wrong on this slide, in a sentence`);
    if(f.fix!==undefined&&(typeof f.fix!=='string'||!f.fix.trim()))problems.push(`${where}: fix is a sentence, or omitted`);
  }
  if(given.weakest!==undefined&&(!Array.isArray(given.weakest)||given.weakest.length>3||given.weakest.some(id=>!ids.has(id))))problems.push('weakest names up to three slides of this deck');
  if(!Array.isArray(given.slides)||given.slides.length!==ids.size||new Set(given.slides.map(s=>s?.id)).size!==ids.size)problems.push('slides must answer every question for every slide exactly once');
  for(const s of Array.isArray(given.slides)?given.slides:[]){
    if(!ids.has(s?.id)||!Array.isArray(s.answers)||s.answers.length!==criticQuestions.length||s.answers.some(a=>typeof a!=='boolean')||typeof s.note!=='string'||s.note.trim().length<12){problems.push('Each slide needs its id, eight boolean answers, and a slide-specific inspection note');continue;}
    for(const [i,pass] of s.answers.entries())if(pass===Boolean((Array.isArray(given.findings)?given.findings:[]).some(f=>f.slide===s.id&&f.question===i+1)))problems.push(`${s.id}: question ${i+1} must agree with its finding (false requires a finding; true must have none)`);
  }
  if(problems.length)throw new Error(problems.length===1?problems[0]:`${problems.length} problems to fix:\n${problems.join('\n')}`);
  const count=level=>given.findings.filter(f=>f.severity===level).length,blocked=count('critical')>0;
  const record={schema:2,packetDigest:digest(packet),deckSha256:packet.deckSha256,reviewer:given.reviewer,slides:given.slides,recordedAt:new Date().toISOString(),findings:given.findings,weakest:given.weakest??[],critical:count('critical'),major:count('major'),minor:count('minor'),status:blocked?'blocked':'clear'};
  return record;
}

export async function verifyCriticPacket(dir,packet){
  if(packet.schema!==2||!Array.isArray(packet.slides)||!packet.slides.length)throw new Error('This critic packet predates artifact verification; preview the whole deck again');
  const preview=JSON.parse(await readFile(await regularInside(dir,'preview.json'),'utf8'));
  if(packet.deckSha256!==preview.deckSha256||digest(packet.questions)!==digest(criticQuestions)||digest(packet.slides.map(s=>[s.id,s.number]))!==digest(preview.slides.map(s=>[s.id,s.number])))throw new Error('Critic inventory changed; preview and inspect again');
  for(const [name,sha] of [['deck.pptx',packet.deckSha256],...packet.slides.map(s=>[s.image,s.imageSha256])]){
    if(!sha||hash(await readFile(await regularInside(dir,name)))!==sha)throw new Error(`Critique artifact changed: ${name}; preview and inspect again`);
  }
  return packet;
}

export async function previewComposition(options,deps={}){
  // Always check current design/input state, including when pixels can be reused.
  if(!options.file||!options.output)throw new Error('Provide --file COMPILED_DIR and a new --output directory');
  try{await lstat(options.output);throw new Error('Preview output already exists; choose a new directory');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(options.section&&!options['design-project'])throw refuse('--section needs --design-project: a section is checked against the approved design',{code:'input-invalid'});
  const scene=JSON.parse(await readFile(join(options.file,'scene.json'),'utf8'));
  const approved=options['design-project']?await requireSceneDesign(scene,options['design-project'],undefined,{section:options.section}):null;
  if(options.slide&&!scene.slides.some(s=>s.id===options.slide))throw new Error(`No slide ${options.slide}; choose one of ${scene.slides.map(s=>s.id).join(', ')}`);
  const {compositionRenderBundle,materializeRenderBundle}=await import('./render-bundle.mjs');
  const bundle=await compositionRenderBundle(options,deps,renderCompositionPreview),result=await materializeRenderBundle(bundle,options.output,{slide:options.slide});
  if(approved)result.design={revision:approved.revision,scope:approved.scope,slides:approved.slides};else delete result.design;
  const {compositionBinding,recordCompositionArtifact}=await import('./composition-project.mjs');
  result.buildBinding=await compositionBinding(options.file);
  if(!options.slide){const packet=JSON.parse(await readFile(join(options.output,'critic.json'),'utf8'));packet.buildBinding=result.buildBinding;await writeFile(join(options.output,'critic.json'),JSON.stringify(packet,null,2)+'\n');}
  await writeFile(join(options.output,'preview.json'),JSON.stringify(result,null,2)+'\n');
  if(options.register!==false)await recordCompositionArtifact(options.project??resolve(options.file,JSON.parse(await readFile(join(options.file,'compose-report.json'),'utf8')).project??'.'),options.file,'preview',{path:resolve(options.output),remote:result.fileId?{fileId:result.fileId,url:result.url}:null});
  return result;
}

async function renderCompositionPreview({file,output,slide,'file-id':fileId,renderer='google',fonts,'design-project':designProject,section,soffice:customSoffice,pdfinfo:customPdfinfo,pdftoppm:customPdftoppm},deps={}) {
  if(!file||!output)throw new Error('Provide --file COMPILED_DIR and a new --output directory');
  if(!['google','local'].includes(renderer))throw new Error('Renderer must be google or local');
  if(section&&!designProject)throw refuse('--section needs --design-project: a section is checked against the approved design',{code:'input-invalid'});
  const run=deps.run??promisify(execFile),drive={importDeck,updateDeck,exportPdf,...deps.drive};
  const dir=resolve(file),load=async name=>JSON.parse(await readFile(join(dir,name),'utf8')),scene=await load('scene.json'),structure=await load('structure.json');
  const wanted=slide===undefined?null:scene.slides.findIndex(s=>s.id===slide);
  if(wanted===-1)throw new Error(`No slide ${slide}; choose one of ${scene.slides.map(s=>s.id).join(', ')}`);
  // With --design-project the build is checked against the design approved now, before anything is rendered or uploaded.
  const approved=designProject?await requireSceneDesign(scene,designProject,undefined,{section}):null;
  const tool=async(command,args,options)=>{try{return await run(command,args,options);}catch(error){throw new Error(error.code==='ENOENT'?'Poppler (pdfinfo, pdftoppm) is required to turn the render into images: brew install poppler':String(error.message).split('\n')[0]);}};
  // Check the image tools before anything is uploaded, so a missing tool cannot strand a Drive file.
  const pdfinfo=customPdfinfo||process.env.HARNESS_PDFINFO||'pdfinfo',pdftoppm=customPdftoppm||process.env.HARNESS_PDFTOPPM||'pdftoppm';await tool(pdfinfo,['-v'],{timeout:15000});await tool(pdftoppm,['-v'],{timeout:15000});
  output=resolve(output);await mkdir(output,{mode:0o700});let remote=null;
  try {
    const deck=join(output,'deck.pptx'),pdf=join(output,'deck.pdf'),built=await renderCompositionDir({file:dir,output:deck});
    if(renderer==='google') {
      remote=fileId?await drive.updateDeck({fileId,file:deck},deps.google):await drive.importDeck({file:deck,name:`${previewPrefix}${scene.title}`,preview:true},deps.google);
      await drive.exportPdf({fileId:remote.id,output:pdf},deps.google);
    } else {
      const soffice=customSoffice||process.env.HARNESS_SOFFICE||'soffice',profile=join(output,'.office-profile');
      try{await run(soffice,[`-env:UserInstallation=${pathToFileURL(profile).href}`,'--headless','--convert-to','pdf','--outdir',output,deck],{timeout:120000,maxBuffer:1024*1024});}
      catch(error){throw new Error(error.code==='ENOENT'?'LibreOffice (soffice) is not installed. Use --renderer google, or install LibreOffice for offline previews.':`Local render failed: ${String(error.message).split('\n')[0]}`);}
      finally{await rm(profile,{recursive:true,force:true});}
      if(!await readFile(pdf).then(()=>true,()=>false))throw new Error('LibreOffice finished without writing a PDF; open the deck to check it');
    }
    const pages=Number((await tool(pdfinfo,[pdf],{timeout:30000,maxBuffer:1024*1024})).stdout.match(/^Pages:\s+(\d+)/m)?.[1]);
    if(!Number.isInteger(pages))throw new Error('Could not read the page count of the render');
    if(pages!==scene.slides.length)throw new Error(`The render has ${pages} pages for ${scene.slides.length} slides; check the deck for an import problem`);
    // The approved outline recorded with the build, if any, lets the screen find sentences chopped into nodes.
    const report=await load('compose-report.json'),contract=await load('brand-contract.json').catch(()=>null);
    // The outline must be the one the build was compiled against; a changed or missing outline means the approval moved.
    const recorded=report.inputs?.outline,outlineBytes=recorded?.path?await readFile(resolve(dir,recorded.path)).catch(()=>null):null;
    const outlineCurrent=Boolean(outlineBytes&&hash(outlineBytes)===recorded.sha256),outline=outlineCurrent?JSON.parse(outlineBytes):null;
    const findings=await screenComposition({scene,structure,native:built.native??[],fonts:fonts?JSON.parse(await readFile(fonts,'utf8')):report.fonts,outline,delivery:contract?.medium?.delivery??'reading'}),slides=[];
    if(recorded&&!outlineCurrent)findings.push({slide:scene.slides[0].id,severity:'error',code:'outline-changed',detail:`The outline this build was compiled against (${recorded.path}) is ${outlineBytes?'changed':'missing'}. The approved wording may have moved: compile again against the current outline before previewing.`});
    for(const [index,s] of scene.slides.entries()) {
      if(wanted!==null&&wanted!==index)continue;
      const image=`slide-${String(index+1).padStart(2,'0')}.png`;
      if(deps.reuseImages?.has(index+1))await copyFile(deps.reuseImages.get(index+1),join(output,image));
      else await tool(pdftoppm,['-f',String(index+1),'-l',String(index+1),'-singlefile','-scale-to','1600','-png',pdf,join(output,image.replace(/\.png$/,''))],{timeout:60000,maxBuffer:1024*1024});
      slides.push({id:s.id,number:index+1,title:s.title,image:join(output,image),findings:findings.filter(f=>f.slide===s.id).map(({slide:_,metrics,...rest})=>rest)});
    }
    // A render of the whole deck also gets one sheet of every slide and the packet a reviewer works from.
    const deckSha256=hash(await readFile(deck)),review={};
    if(wanted===null) {
      const thumbs=[];
      const {thumbnailPng}=await import('./contact-sheet.mjs');
      try{for(const s of slides){const name=join(output,`thumb-${String(s.number).padStart(2,'0')}.png`);await writeFile(name,thumbnailPng(await readFile(s.image),480));thumbs.push(name);}review.contactSheet=(await writeContactSheet(thumbs,join(output,'contact-sheet.png'))).path;}catch(error){review.contactSheetError=error.message;}
      for(const thumb of thumbs)await rm(thumb,{force:true});
      const briefs=new Map((structure.briefs??[]).map(b=>[b.slide,b]));
      review.critic=join(output,'critic.json');
      await writeFile(review.critic,JSON.stringify({schema:2,deckSha256,...(review.contactSheet?{contactSheet:'contact-sheet.png'}:{}),questions:criticQuestions,grades,
        instructions:'For a reviewer who did not write these slides. Look at the contact sheet for the deck as a whole, then each image at full size. Answer every question for every slide; each no is a finding with a severity and one sentence on what is wrong. Judge only what is visible. Do not propose changes to brand colors or to what a slide says.',
        slides:await Promise.all(slides.map(async s=>({number:s.number,id:s.id,title:s.title,image:s.image.split(/[\\/]/).at(-1),imageSha256:hash(await readFile(s.image)),...(briefs.get(s.id)?.relation?{relation:briefs.get(s.id).relation}:{}),rhythm:briefs.get(s.id)?.rhythm??'dense'}))),
        answer:{deckSha256,reviewer:'independent|author',slides:slides.map(s=>({id:s.id,answers:Array(8).fill(null),note:'What you inspected on this slide; use true/false for every question.'})),findings:[{slide:'SLIDE_ID',question:1,severity:'critical|major|minor',note:'What is wrong, in a sentence.',fix:'Optional: what would fix it.'}],weakest:['up to three slide IDs']}},null,2)+'\n',{flag:'wx',mode:0o600});
    }
    const repair=repairClusters(slides);
    const result={schema:1,output,deck,deckSha256,...review,repair,...(approved?{design:{revision:approved.revision,scope:approved.scope,slides:approved.slides}}:{}),renderer:renderer==='google'?'Google Slides PDF export':'LibreOffice',emitter:built.emitter,native:built.native??[],...(remote?{fileId:remote.id,url:remote.url}:{}),slides,
      status:repair.blocking.length?`rendered and screened; ${repair.blocking.length} slide${repair.blocking.length===1?'':'s'} (${repair.blocking.join(', ')}) carry blocking findings: repair them before delivery. Screens are prompts to look, not approval.`:'rendered and screened; open each image and judge it. Screens are prompts to look, not approval.',next:remote?`Reuse this Drive file for the next preview: --file-id ${remote.id}`:undefined};
    await writeFile(join(output,'preview.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
    return result;
  } catch(error) {
    await rm(output,{recursive:true,force:true});
    // The upload already happened: say where it is so a retry reuses it instead of creating another file.
    if(remote)throw new Error(`${error.message} The preview deck is in Drive (${remote.url}); retry with --file-id ${remote.id}.`,{cause:error});
    throw error;
  }
}
