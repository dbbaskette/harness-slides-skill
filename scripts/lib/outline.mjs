// The draft stage: an outline of what a deck says, checked and shown as wireframes before any slide is drawn.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBrandContract,checkBrandSources,neutralBrandContract} from './brand-contract.mjs';
import {validateComposition,titleLines,relationNames,rhythmNames} from './compose.mjs';
import {hash,escape} from './common.mjs';

const idPattern=/^[a-zA-Z_][a-zA-Z0-9_-]{4,40}$/,kinds=['cover','section','content','closing'];
const str=v=>typeof v==='string'&&v.trim()&&v.length<=20000;
const round=n=>Math.round(n*100)/100;
// A relation between things needs at least this many things to relate.
const fewest={order:2,dependency:2,hierarchy:2,membership:2,contrast:2,parallel:2,overlap:2,quantity:1,none:0};
// Body words a slide can carry before it stops being a slide, by how the deck is delivered.
const budgets={live:60,reading:90};
const marker='<!-- harness-slides draft -->';

export const outlineContract=`Outline v1 (AI-owned; words and decisions, no layout).
{version:1,title,audience?,delivery?:live|reading,minutes?,direction?:DIRECTION,layouts?:{cover?,section?,closing?},material?:[paths or notes],house?:[lines],slides:[SLIDE]}
SLIDE cover: {id,kind:cover,title,subtitle?,detail?,notes?}. section: {id,kind:section,title,subtitle?,notes?}. closing: {id,kind:closing,title,notes?}.
SLIDE content: {id,kind:content,title,understand,relation,focal?,rhythm?,points:[{label?,text?}],caveat?,source?,notes?,sources:[one or more IDs]}.
title is the claim, short enough for the brand's title lines. understand is one sentence: what the audience must leave the slide knowing.
relation: ${relationNames.join('|')}. It says how the points relate; a relation other than quantity or none needs two or more points.
focal names the point of the slide in words. Give the label of one of the points, or a short statement of its own, which is then shown on the slide too. Leave it out when the slide lists or compares equals.
rhythm: anchor for structure, dense for information (the default), breathing for a pause. Four dense slides in a row is a finding; lighten one and mark it breathing, or put a section slide between.
points are the real units, counted from the content: a label, a line of text, or both. For quantity the first point's label is the figure.
caveat is one line, and source is one line naming where the claim comes from; both are shown at the foot of the slide. notes are for the speaker and are shown under the slide in the draft. sources are one or more IDs naming what the slide rests on: a section of the source material, or one ID such as request or author_knowledge.
minutes is the length of the talk; the draft shows what that leaves for each content slide.
DIRECTION is the composition's: {focal,neutral,meanings?,motif?}, in brand color roles. A draft is drawn without it; the build uses it.
layouts name the brand template layouts for cover, section and closing slides (run compose layouts); the build needs them.
material lists the sources a builder may draw on. house lists what must match across sections: color meanings, icon style, where caveats go.
IDs match [a-zA-Z_][a-zA-Z0-9_-]{4,40} and are unique.`;

// What a brand allows a draft: how long a title may be and how many words a slide carries.
export async function outlineSizes(contract,{fonts}={}) {
  const {fit}=await titleLines(contract,[],{fonts}),sl=contract.design.slides,size=sl.typography.title.size,delivery=contract.medium.delivery??'reading';
  return `For ${contract.identity.id}: a title holds ${fit} line${fit===1?'':'s'} at ${size}pt, about ${Math.floor(sl.titleBox.width/(size*.52))*fit} characters. A slide delivered ${delivery==='live'?'live':'for reading'} carries about ${budgets[delivery]} body words.`;
}
const words=text=>String(text??'').split(/\s+/).filter(Boolean).length;
const bodyWords=s=>(s.points??[]).reduce((n,p)=>n+words(p.label)+words(p.text),0)+(typeof s.focal==='string'&&!(s.points??[]).some(p=>p.label===s.focal)?words(s.focal):0);

// Structure problems are thrown together; everything about the words is returned as findings.
export async function checkOutline(outline,contract,{fonts}={}) {
  validateBrandContract(contract,{medium:'slides'});
  const problems=[],fail=(where,message)=>problems.push(`${where}: ${message}`);
  if(outline?.version!==1)throw new Error('Use outline version 1 (run outline contract)');
  const top=['version','title','audience','delivery','minutes','direction','layouts','material','house','slides'];
  for(const key of Object.keys(outline))if(!top.includes(key))fail('outline',`unsupported field ${key}`);
  if(!str(outline.title))fail('outline','provide the deck title');
  if(outline.audience!==undefined&&!str(outline.audience))fail('outline','audience is a short description, or omitted');
  if(outline.minutes!==undefined&&!(Number.isFinite(outline.minutes)&&outline.minutes>0&&outline.minutes<=600))fail('outline','minutes is the length of the talk, as a number');
  const delivery=outline.delivery??contract.medium.delivery??'reading';
  if(!['live','reading'].includes(delivery))fail('outline','delivery is live or reading');
  else if(outline.delivery&&contract.medium.delivery&&outline.delivery!==contract.medium.delivery)fail('outline',`delivery is ${outline.delivery}, but the brand contract was exported for ${contract.medium.delivery}; export it for ${outline.delivery}`);
  for(const key of ['material','house'])if(outline[key]!==undefined&&(!Array.isArray(outline[key])||outline[key].some(x=>!str(x))))fail('outline',`${key} is a list of lines`);
  if(outline.layouts!==undefined&&(!outline.layouts||typeof outline.layouts!=='object'||Array.isArray(outline.layouts)||Object.entries(outline.layouts).some(([k,v])=>!['cover','section','closing'].includes(k)||!str(v))))fail('outline','layouts names template layouts for cover, section and closing');
  if(outline.direction!==undefined) {
    // The composition's own rules decide whether a direction is sound.
    try{validateComposition({version:1,title:'direction',direction:outline.direction,slides:[{id:'direction_probe',title:'t',sources:['s'],canvas:{type:'text',id:'direction_text',text:'t'}}]},contract);}catch(error){fail('outline',error.message);}
  }
  if(!Array.isArray(outline.slides)||!outline.slides.length||outline.slides.length>100){fail('outline','provide 1–100 slides');throw new Error(problems.join('\n'));}
  const ids=new Set(),fields={cover:['subtitle','detail'],section:['subtitle'],closing:[],content:['understand','relation','focal','rhythm','points','caveat','source','sources']};
  for(const [index,s] of outline.slides.entries()) {
    const where=str(s?.id)?s.id:`slide ${index+1}`;
    if(!s||typeof s!=='object'||Array.isArray(s)){fail(where,'each slide is an object');continue;}
    if(!idPattern.test(s.id??'')||ids.has(s.id))fail(where,`invalid or repeated ID: ${s.id}`);ids.add(s.id);
    if(!kinds.includes(s.kind)){fail(where,`kind is one of ${kinds.join('|')}`);continue;}
    for(const key of Object.keys(s))if(!['id','kind','title','notes',...fields[s.kind]].includes(key))fail(where,`a ${s.kind} slide has no ${key}`);
    if(!str(s.title))fail(where,'provide the title');
    for(const key of ['subtitle','detail','notes','caveat','source','focal'])if(s[key]!==undefined&&!str(s[key]))fail(where,`provide ${key} text or omit it`);
    if(s.detail!==undefined&&s.subtitle===undefined)fail(where,'detail needs a subtitle before it');
    if(s.kind!=='content')continue;
    if(!str(s.understand))fail(where,'say in one sentence what the audience must understand');
    if(!relationNames.includes(s.relation)){fail(where,`relation is one of ${relationNames.join('|')}`);continue;}
    if(s.rhythm!==undefined&&!rhythmNames.includes(s.rhythm))fail(where,`rhythm is one of ${rhythmNames.join('|')}`);
    if(!Array.isArray(s.sources)||!s.sources.length||s.sources.some(x=>!str(x)))fail(where,'provide sources: one or more IDs naming what the slide rests on, such as request or author_knowledge');
    const points=s.points??[];
    if(!Array.isArray(points)||points.length>12||points.some(p=>!p||typeof p!=='object'||Object.keys(p).some(k=>!['label','text'].includes(k))||!str(p.label)&&!str(p.text)||p.label!==undefined&&!str(p.label)||p.text!==undefined&&!str(p.text))){fail(where,'points is a list of up to 12 items, each with a label, a text or both');continue;}
    if(points.length<fewest[s.relation])fail(where,`relation "${s.relation}" needs at least ${fewest[s.relation]} point${fewest[s.relation]===1?'':'s'}; it has ${points.length}`);
    if(s.relation==='quantity'&&points.length&&!str(points[0].label))fail(where,'for quantity, the first point\'s label is the figure');
  }
  if(problems.length)throw new Error(problems.length===1?problems[0]:`${problems.length} problems to fix:\n${problems.join('\n')}`);

  const findings=[],content=outline.slides.filter(s=>s.kind==='content'),budget=budgets[delivery];
  const measured=await titleLines(contract,content.map(s=>s.title),{fonts});
  content.forEach((s,i)=>{if(measured.lines[i]>measured.fit)findings.push({slide:s.id,code:'title-too-long',detail:`The title runs to ${measured.lines[i]} lines and the brand's title holds ${measured.fit}. Shorten the claim.`});});
  const counts=Object.fromEntries(content.map(s=>[s.id,bodyWords(s)]));
  for(const s of content)if(counts[s.id]>budget)findings.push({slide:s.id,code:'over-budget',detail:`${counts[s.id]} body words; a slide delivered ${delivery==='live'?'live':'for reading'} carries about ${budget}. Cut words or split the slide.`});
  const seen=new Map();
  for(const s of outline.slides){const key=s.title.trim().toLowerCase();if(seen.has(key))findings.push({slide:s.id,code:'repeated-title',detail:`Same title as ${seen.get(key)}.`});else seen.set(key,s.id);}
  let run=[];
  for(const s of outline.slides) {
    if(s.kind==='content'&&(s.rhythm??'dense')==='dense')run.push(s.id);
    else{if(run.length>=4)findings.push({slide:run[3],code:'dense-run',detail:`${run.length} dense slides in a row from ${run[0]}. Lighten one and mark it breathing, or put a section slide between.`});run=[];}
  }
  if(run.length>=4)findings.push({slide:run[3],code:'dense-run',detail:`${run.length} dense slides in a row from ${run[0]}. Lighten one and mark it breathing, or put a section slide between.`});
  if(delivery==='live')for(const s of content)if(!s.notes)findings.push({slide:s.id,code:'no-notes',detail:'A slide presented live needs speaker notes: what the presenter says, and the source behind the claim.'});
  for(const s of content)if(s.focal===undefined&&!['contrast','parallel','none'].includes(s.relation))findings.push({slide:s.id,code:'no-focal',detail:'Nothing is named as the point of this slide. Name it, unless the slide compares equals.'});
  return {delivery,budget,counts,findings};
}

// Plain arrangements, one per relation. They carry the words; the build redraws every slide.
function arrange(s,area) {
  const points=s.points??[],own=typeof s.focal==='string'&&!points.some(p=>p.label===s.focal)?s.focal:null;
  const shapes=[],arrows=[],gap=18,isFocal=p=>s.focal!==undefined&&p.label===s.focal;
  const box=(p,x,y,w,h,extra={})=>shapes.push({x,y,w,h,label:p.label,text:p.text,focal:isFocal(p),...extra});
  let {x,y,width:w,height:h}=area;
  if(s.source){h-=26;shapes.push({x,y:y+h+2,w,h:24,text:s.source,kind:'caveat'});}
  if(s.caveat){h-=30;shapes.push({x,y:y+h+4,w,h:26,text:s.caveat,kind:'caveat'});}
  const hub=own&&s.relation==='dependency';
  if(own&&!hub){shapes.push({x,y,w,h:58,label:own,focal:true});y+=58+gap;h-=58+gap;}
  const cells=(n,cols,ax=x,ay=y,aw=w,ah=h)=>{const rows=Math.ceil(n/cols),cw=(aw-gap*(cols-1))/cols,ch=(ah-gap*(rows-1))/rows;return Array.from({length:n},(_,i)=>({x:ax+(i%cols)*(cw+gap),y:ay+Math.floor(i/cols)*(ch+gap),w:cw,h:ch}));};
  const n=points.length;
  if(!n&&!hub)return {shapes,arrows};
  if(s.relation==='order') {
    const all=points,span=34,cw=(w-span*(all.length-1))/all.length,ch=Math.min(h,200),top=y+(h-ch)/2;
    all.forEach((p,i)=>{const bx=x+i*(cw+span);shapes.push({x:bx,y:top,w:cw,h:ch,label:p.label,text:p.text,focal:isFocal(p)});if(i)arrows.push({x1:bx-span,y1:top+ch/2,x2:bx,y2:top+ch/2});});
  } else if(s.relation==='dependency') {
    const source=hub?{label:own}:points.find(isFocal)??points[0],rest=points.filter(p=>p!==source),hw=w*.3,hh=Math.min(h*.5,180),hy=y+(h-hh)/2,rx=x+w*.5,rw=w*.5;
    shapes.push({x,y:hy,w:hw,h:hh,label:source.label,text:source.text,focal:hub||isFocal(source)});
    cells(rest.length,1,rx,y,rw,h).forEach((c,i)=>{box(rest[i],c.x,c.y,c.w,c.h);arrows.push({x1:x+hw,y1:hy+hh/2,x2:c.x,y2:c.y+c.h/2});});
  } else if(s.relation==='hierarchy') cells(n,1).forEach((c,i)=>box(points[i],c.x,c.y,c.w,c.h));
  else if(s.relation==='membership'){shapes.push({x,y,w,h,kind:'group'});cells(n,n<=4?n:Math.ceil(n/2),x+gap,y+gap,w-gap*2,h-gap*2).forEach((c,i)=>box(points[i],c.x,c.y,c.w,c.h));}
  else if(s.relation==='overlap'){const m=Math.min(n,3),ew=w/(m*.7+.3),eh=Math.min(h,ew*.7);points.slice(0,m).forEach((p,i)=>box(p,x+i*ew*.7,y+(h-eh)/2,ew,eh,{round:true}));}
  else if(s.relation==='quantity') {
    const [first,...rest]=points,lw=rest.length?w*.42:w;
    shapes.push({x,y,w:lw,h,label:first.label,text:first.text,kind:'figure',focal:isFocal(first)});
    cells(rest.length,1,x+lw+gap,y,w-lw-gap,h).forEach((c,i)=>box(rest[i],c.x,c.y,c.w,c.h));
  } else if(s.relation==='none') cells(n,1).forEach((c,i)=>box(points[i],c.x,c.y,c.w,c.h,{kind:'plain'}));
  else cells(n,s.relation==='contrast'?Math.min(n,4):n<=4?n:n<=9?3:4).forEach((c,i)=>box(points[i],c.x,c.y,c.w,c.h));
  return {shapes,arrows};
}

export async function draftOutline(outline,contract,{fonts}={}) {
  const checked=await checkOutline(outline,contract,{fonts}),sl=contract.design.slides,t=sl.typography,W=sl.canvas.width,H=sl.canvas.height,scale=.6;
  const body=t[checked.delivery==='live'?'body':'bodyReference'].size,flagged=id=>checked.findings.filter(f=>f.slide===id);
  const px=n=>`${round(n)}px`,place=o=>`left:${px(o.x)};top:${px(o.y)};width:${px(o.w)};height:${px(o.h)}`;
  const slide=(s,index)=>{
    let inner;
    if(s.kind==='content') {
      const {shapes,arrows}=arrange(s,sl.contentBox);
      inner=`<div class="title" style="${place({x:sl.titleBox.x,y:sl.titleBox.y,w:sl.titleBox.width,h:sl.titleBox.height})};font-size:${t.title.size}px">${escape(s.title)}</div>`+
        shapes.map(o=>`<div class="shape fit ${o.kind??'box'}${o.focal?' focal':''}${o.round?' round':''}${o.h<110&&!o.kind?' inline':''}" style="${place(o)}">${o.label?`<b style="font-size:${o.kind==='figure'?t.metric.size:t.label.size}px">${escape(o.label)}</b>`:''}${o.text?`<span style="font-size:${o.kind==='caveat'?t.caption.size:body}px">${escape(o.text)}</span>`:''}</div>`).join('')+
        (arrows.length?`<svg class="arrows" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><marker id="tip${index}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#555"/></marker></defs>${arrows.map(a=>`<line x1="${round(a.x1)}" y1="${round(a.y1)}" x2="${round(a.x2)}" y2="${round(a.y2)}" stroke="#555" stroke-width="2" marker-end="url(#tip${index})"/>`).join('')}</svg>`:'');
    } else inner=`<div class="plate"><small>${s.kind}</small><b style="font-size:${t.section?.size??40}px">${escape(s.title)}</b>${s.subtitle?`<span style="font-size:${body}px">${escape(s.subtitle)}</span>`:''}${s.detail?`<span style="font-size:${body}px">${escape(s.detail)}</span>`:''}</div>`;
    const notes=flagged(s.id),count=checked.counts[s.id];
    return `<figure id="${escape(s.id)}"><figcaption><b>${index+1}</b> ${escape(s.id)} · ${s.kind==='content'?`${s.relation}${s.rhythm?` · ${s.rhythm}`:''} · ${count} words`:s.kind}${notes.map(f=>` <mark>${escape(f.code)}</mark>`).join('')}</figcaption><div class="frame" style="width:${px(W*scale)};height:${px(H*scale)}"><section style="width:${px(W)};height:${px(H)};transform:scale(${scale})">${inner}</section></div>${s.kind==='content'?`<p class="understand">${escape(s.understand)}</p>`:''}${s.notes?`<p class="notes">Notes: ${escape(s.notes)}</p>`:''}${notes.map(f=>`<p class="finding">${escape(f.detail)}</p>`).join('')}</figure>`;
  };
  const total=Object.values(checked.counts).reduce((a,b)=>a+b,0);
  const html=`<!doctype html>${marker}<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draft: ${escape(outline.title)}</title><style>
body{margin:24px;background:#f4f4f4;color:#222;font-family:${JSON.stringify(contract.design.fontFamily)},Arial,sans-serif}
header{max-width:1180px;margin:0 auto 20px}h1{font-size:24px;margin:0 0 6px}header p{margin:2px 0;color:#555;font-size:14px}
main{display:grid;grid-template-columns:repeat(auto-fill,${px(W*scale)});gap:28px 24px;justify-content:center}
figure{margin:0}figcaption{font-size:12px;color:#555;margin-bottom:6px}mark{background:#222;color:#fff;padding:1px 5px;border-radius:2px;margin-left:4px}
.frame{background:#fff;border:1px solid #bbb;overflow:hidden}section{position:relative;transform-origin:top left;background:#fff}
.title{position:absolute;display:flex;align-items:center;color:#222}.shape{position:absolute;box-sizing:border-box;border:1.5px solid #999;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:14px;overflow:hidden;line-height:1.25}
.shape.inline{flex-direction:row;align-items:center;justify-content:flex-start;gap:14px}.shape.inline b:not(:only-child){flex:none;max-width:45%}
.shape.focal{border:5px solid #222}.shape.round{border-radius:50%;align-items:center;text-align:center;padding:24px 90px}.shape.group{border-style:dashed}.shape.plain,.shape.caveat{border:0;padding:4px}.shape.caveat{color:#555}.shape.figure{align-items:flex-start}
.arrows{position:absolute;left:0;top:0;pointer-events:none}
.plate{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:0 70px;border:14px solid #ddd;box-sizing:border-box}.plate small{text-transform:uppercase;letter-spacing:.12em;color:#777;font-size:16px}
.notes{font-size:12px;color:#555;margin:6px 0 0;max-width:${px(W*scale)}}.understand{font-size:13px;margin:8px 0 0;max-width:${px(W*scale)}}.finding{font-size:12px;margin:4px 0 0;color:#222;max-width:${px(W*scale)}}.finding::before{content:"▲ "}
footer{max-width:1180px;margin:28px auto 0;color:#777;font-size:12px}
</style><header><h1>${escape(outline.title)}</h1><p>${[outline.audience?`For ${escape(outline.audience)}`:'',`delivered ${checked.delivery==='live'?'live':'for reading'}`,`${outline.slides.length} slides`,outline.minutes?`${outline.minutes} minutes, about ${round(outline.minutes/Math.max(1,Object.keys(checked.counts).length)).toFixed(1)} a content slide`:'',`${total} body words`,`${checked.findings.length} finding${checked.findings.length===1?'':'s'}`].filter(Boolean).join(' · ')}</p><p>Draft: wording and structure only. The heavy outline marks the point of each slide. Nothing here is a design; every slide is redrawn in the build.</p>${outline.direction?`<p>For the build: ${escape(outline.direction.focal)} marks the point of a slide, on ${escape(outline.direction.neutral)} panels${Object.entries(outline.direction.meanings??{}).map(([role,meaning])=>`; ${escape(role)} means ${escape(meaning)}`).join('')}.</p>`:''}</header><main>${outline.slides.map(slide).join('')}</main><footer>Draft: wording and structure only · outline ${hash(JSON.stringify(outline)).slice(0,12)}</footer><script>
for(const el of document.querySelectorAll('.fit')){let n=0;while(el.scrollHeight>el.clientHeight+1&&n++<40)for(const c of el.children)c.style.fontSize=Math.max(8,parseFloat(c.style.fontSize)*.94)+'px';if(n)el.title='Text shrunk to fit';}
</script></html>`;
  return {html,...checked,slides:outline.slides.length,words:total};
}

const load=async(file,brand)=>{
  if(!file)throw new Error('Provide --file outline.json');
  const bytes=await readFile(file),contract=brand?JSON.parse(await readFile(brand)):await neutralBrandContract();
  await checkBrandSources(contract);
  return {bytes,outline:JSON.parse(bytes),contract};
};
const fontsOf=async fonts=>fonts?JSON.parse(await readFile(fonts)):undefined;

export async function checkOutlineFile({file,brand,fonts}) {
  const {bytes,outline,contract}=await load(file,brand),checked=await checkOutline(outline,contract,{fonts:await fontsOf(fonts)});
  return {status:checked.findings.length?'sound; look at the findings':'sound',slides:outline.slides.length,delivery:checked.delivery,wordBudget:checked.budget,words:checked.counts,findings:checked.findings,outlineSha256:hash(bytes)};
}

export async function draftOutlineFile({file,brand,output,fonts}) {
  if(!output)throw new Error('Provide --output draft.html');
  const {bytes,outline,contract}=await load(file,brand),draft=await draftOutline(outline,contract,{fonts:await fontsOf(fonts)});
  output=resolve(output);
  // A draft is rewritten on every round, so its own earlier output may be replaced; anything else is left alone.
  let existing=null;try{existing=await readFile(output,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  if(existing!==null&&!existing.includes(marker))throw new Error(`${output} exists and is not a draft page; choose another output`);
  await writeFile(output,draft.html,{mode:0o600});
  return {output,slides:draft.slides,words:draft.words,findings:draft.findings,outlineSha256:hash(bytes),status:'draft written; show it to the user. It is wording and structure only, not a design.'};
}

// Sections of three or four neighbouring content slides: the unit one builder takes.
const sections=run=>{const count=Math.ceil(run.length/4),size=Math.ceil(run.length/count);return Array.from({length:count},(_,i)=>run.slice(i*size,(i+1)*size));};

export async function startOutlineFile({file,brand,output,fonts}) {
  if(!output)throw new Error('Provide a new --output directory for the build');
  if(!brand)throw new Error('Provide --brand brand-contract.json; the build needs the brand');
  const {bytes,outline,contract}=await load(file,brand),checked=await checkOutline(outline,contract,{fonts:await fontsOf(fonts)});
  // What a draft may leave open, a build may not.
  const blocking=checked.findings.filter(f=>f.code==='title-too-long').map(f=>`${f.slide}: ${f.detail}`);
  for(const kind of new Set(outline.slides.filter(s=>s.kind!=='content').map(s=>s.kind)))if(!outline.layouts?.[kind])blocking.push(`outline: name the template layout for ${kind} slides in layouts.${kind} (run compose layouts)`);
  if(!outline.direction)blocking.push('outline: the build needs a direction; add one');
  if(blocking.length)throw new Error(blocking.length===1?blocking[0]:`${blocking.length} problems to fix:\n${blocking.join('\n')}`);
  output=resolve(output);await mkdir(output,{mode:0o700});await mkdir(join(output,'briefs'),{mode:0o700});
  const save=(name,text)=>writeFile(join(output,name),text,{flag:'wx',mode:0o600}),parts=[],table=[];
  const composition=slides=>JSON.stringify({version:1,title:outline.title,direction:outline.direction,slides},null,2)+'\n';
  const fixed=s=>({id:s.id,title:s.title,layout:outline.layouts[s.kind],...(s.subtitle?{subtitle:s.subtitle}:{}),...(s.detail?{detail:s.detail}:{}),...(s.notes?{notes:s.notes}:{}),sources:['outline'],brief:{rhythm:'anchor'}});
  const runtime=resolve(dirname(fileURLToPath(import.meta.url)),'..','..'),house=outline.house??[];
  let lead=[],run=[],leads=0,number=0;
  const flushLead=async()=>{if(!lead.length)return;const name=`lead-${++leads}.json`;await save(name,composition(lead.map(fixed)));parts.push(name);table.push(`| Lead | ${name} | ${lead.map(s=>s.id).join(', ')} |`);lead=[];};
  const flushRun=async(before,after)=>{
    if(!run.length)return;
    const groups=sections(run);
    for(const [i,group] of groups.entries()) {
      const n=++number,name=`section-${n}.json`,prev=i?groups[i-1].at(-1):before,next=i<groups.length-1?groups[i+1][0]:after;
      const beside=x=>!x?'nothing':x.kind==='content'?`the slide "${x.title}", built by another worker`:`a ${x.kind} slide`;
      await save(`briefs/section-${n}.md`,`# Section ${n} of ${outline.title}

You are building one section of a deck. Other sections are being built at the same time. Read \`references/parallel-build.md\`, the part headed "If you are a worker", in the guidance for this task, and follow what it tells you to read.

## The deck

${outline.title}${outline.audience?`, for ${outline.audience}`:''}, delivered ${checked.delivery==='live'?'live':'for reading'}. The user has approved what each slide says. How each is drawn is yours to design.

## Paths

- Runtime: \`${runtime}\`
- Brand contract: \`${resolve(brand)}\`
- Work directory: \`${output}\`
- Write your section to \`${name}\`, and keep your builds and previews under \`w${n}/\`. Touch nothing else in the work directory.
${(outline.material??[]).map(m=>`- Source material: ${m}`).join('\n')}

## Direction, to copy unchanged

\`\`\`json
${JSON.stringify(outline.direction)}
\`\`\`

## House style
${house.length?house.map(line=>`\n- ${line}`).join(''):'\nNone given beyond the direction.'}

## Your slides, in order

Prefix every node and edge ID you create with \`s${n}_\`. Slide IDs, titles, wording and order are fixed.
${group.map((s,k)=>`
${k+1}. **\`${s.id}\`: "${s.title}"**
   - The audience must understand: ${s.understand}
   - Relation \`${s.relation}\`${s.rhythm?`, rhythm \`${s.rhythm}\``:''}. ${s.focal?`The point of the slide: ${s.focal}.`:'No focal point: it compares equals.'}
${(s.points??[]).map(p=>`   - ${[p.label,p.text].filter(Boolean).join(': ')}`).join('\n')}${s.caveat?`\n   - Caveat, to set on the slide as \`caveat\`: "${s.caveat}"`:''}${s.source?`\n   - Source line, to set on the slide as \`source\`: "${s.source}"`:''}${s.notes?`\n   - Speaker notes, to go in the slide's \`notes\`: ${s.notes}`:''}
   - Sources: ${JSON.stringify(s.sources)}`).join('\n')}

Before your section comes ${beside(prev)}; after it comes ${beside(next)}. Do not echo a neighbour, and make your own slides differ from each other.

## Preview

Use one Drive preview file of your own for every preview, and say which it was.

## Return

The section file, your final preview directory, the Drive file ID, what you changed after looking, and what still bothers you.
`);
      parts.push(name);table.push(`| Worker ${n} | ${name} | ${group.map(s=>s.id).join(', ')} |`);
    }
    run=[];
  };
  for(const [i,s] of outline.slides.entries()) {
    if(s.kind==='content'){if(lead.length)await flushLead();run.push(s);}
    else{if(run.length)await flushRun(outline.slides[i-run.length-1],s);lead.push(s);}
  }
  await flushRun(outline.slides[outline.slides.length-run.length-1],undefined);await flushLead();
  await save('parts.json',JSON.stringify({title:outline.title,direction:outline.direction,parts},null,2)+'\n');
  await save('outline.json',bytes);
  await save('presentation-brief.md',`# ${outline.title}

${outline.audience?`For ${outline.audience}. `:''}Delivered ${checked.delivery==='live'?'live':'for reading'}. ${outline.slides.length} slides.

Outline: \`outline.json\`, SHA-256 \`${hash(bytes)}\`.

## Approval

Record here what the user said when they approved the draft, in their words.

## Direction

\`\`\`json
${JSON.stringify(outline.direction)}
\`\`\`

## House style
${house.length?house.map(line=>`\n- ${line}`).join(''):'\nNone given beyond the direction.'}

## Parts

| Who | File | Slides |
| --- | --- | --- |
${table.join('\n')}
`);
  return {output,slides:outline.slides.length,parts,sections:number,briefs:Array.from({length:number},(_,i)=>join(output,'briefs',`section-${i+1}.md`)),outlineSha256:hash(bytes),next:number>1?'Hand each brief to a worker, or build the sections yourself in order; then compose merge --file parts.json':'Build the section, then compose merge --file parts.json'};
}
