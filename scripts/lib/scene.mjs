import {validateSlideDecision} from './slide-decisions.mjs';
import { digest, escape } from './common.mjs';

export const defaultTheme = Object.freeze({
  font: 'Arial', background: '#FFFFFF', text: '#202124', accent: '#2867B2', muted: '#F0F2F5',
  titleSize: 32, bodySize: 20, codeFont: 'Courier New',
});
// Inline code (configuration fields, commands, API and file names) is set in a monospace family. A brand names its own
// in a code type role; without one, files use Courier New, the monospace every target editor has, and HTML pages fall
// back through Menlo and Consolas first.
export const codeFallback = Object.freeze(['Menlo','Consolas','Courier New']);
// Author text marks code with backticks: "High availability (`highAvailability`)". A pair of backticks on one line
// is a code span; \` is a literal backtick, inside a span or out, and a lone backtick stays a backtick.
export function codeSpans(raw) {
  raw=String(raw);const items=[];
  for (let i=0;i<raw.length;i++) {
    if (raw[i]==='\\'&&raw[i+1]==='`') { items.push({c:'`'}); i++; }
    else items.push(raw[i]==='`'?{tick:true}:{c:raw[i]});
  }
  let text='';const code=[];
  for (let i=0;i<items.length;i++) {
    if (!items[i].tick) { text+=items[i].c; continue; }
    let j=i+1;while (j<items.length&&!items[j].tick&&items[j].c!=='\n') j++;
    if (j<items.length&&items[j].tick&&j>i+1) { const inner=items.slice(i+1,j).map(x=>x.c).join(''); code.push([text.length,text.length+inner.length]); text+=inner; i=j; }
    else text+='`';
  }
  return {text,code};
}
// The author form again, for editing: the visible words with their code spans in backticks and literal backticks escaped.
export function withCodeTicks(e) {
  const text=e?.text??'',esc=v=>v.replaceAll('`','\\`');let out='',at=0;
  for (const [a,b] of e?.code??[]) { out+=esc(text.slice(at,a))+'`'+esc(text.slice(a,b))+'`'; at=b; }
  return out+esc(text.slice(at));
}
// The words of a text as runs: [{text,code}], in order, for writers that set code in its own font.
export function textRuns(e) {
  const runs=[];let at=0;
  for (const [a,b] of e.code??[]) { if (a>at) runs.push({text:e.text.slice(at,a),code:false}); runs.push({text:e.text.slice(a,b),code:true}); at=b; }
  if (at<e.text.length) runs.push({text:e.text.slice(at),code:false});
  return runs;
}
const idPattern = /^[a-zA-Z_][a-zA-Z0-9_-]{4,49}$/;
const types = new Set(['text','shape','line','image','table','chart']);
// Native preset shapes every emitter can draw: [PowerPoint preset, Google Slides shape type, CSS preview radius,
// fraction of the shape's width its text area spans, fraction of its height]. A preset's text area is smaller
// than its bounding box, so layout must measure text against these fractions.
export const shapeKinds = Object.freeze({rect:['rect','RECTANGLE','0',1,1],ellipse:['ellipse','ELLIPSE','50%',.7,.7],roundRect:['roundRect','ROUND_RECTANGLE','12px',1,1],diamond:['diamond','DIAMOND','0',.5,.5],hexagon:['hexagon','HEXAGON','0',.6,.65],chevron:['chevron','CHEVRON','0',.6,1],can:['can','CAN','10px',1,.6]});
const positive = (n, name, max=2000) => { if (!Number.isFinite(n) || n<=0 || n>max) throw new Error(`Invalid ${name}`); };
const nonempty = (s, name) => { if (typeof s !== 'string' || !s.trim() || s.length>20000) throw new Error(`Invalid ${name}`); };
export function themeFor(scene) {
  const t = {...defaultTheme, ...scene.theme};
  if (scene.theme && Object.keys(scene.theme).some(k=>!Object.hasOwn(defaultTheme,k))) throw new Error('Unsupported theme field');
  nonempty(t.font,'font');
  for (const key of ['font','codeFont']) if (typeof t[key]!=='string' || !/^[\p{L}\p{N} _-]{1,100}$/u.test(t[key])) throw new Error('Use a font family name, not CSS');
  for (const key of ['background','text','accent','muted']) if (!/^#[0-9a-f]{6}$/i.test(t[key])) throw new Error(`Invalid theme ${key}`);
  for (const key of ['titleSize','bodySize']) positive(t[key],key,120);
  return t;
}
export function color(value, theme) {
  const result = theme[value] ?? value;
  if (!/^#[0-9a-f]{6}$/i.test(result ?? '')) throw new Error(`Invalid color: ${value}`);
  return result;
}
export function validateScene(scene) {
  if (scene?.version !== 2) throw new Error('Use scene version 2 (run scene contract)');
  if (Object.keys(scene).some(k=>!['version','title','mode','canvas','theme','slides'].includes(k))) throw new Error('Unsupported scene field');
  nonempty(scene.title,'deck title');
  if (!['new','redesign','rework'].includes(scene.mode)) throw new Error('Scene supports new, redesign or rework. Use guarded native patches for polish.');
  if (!scene.canvas) throw new Error('Scene requires canvas dimensions in points');
  positive(scene.canvas.width,'canvas width'); positive(scene.canvas.height,'canvas height');
  const theme = themeFor(scene), ids = new Set(), claim = id => {
    if (!idPattern.test(id ?? '') || ids.has(id)) throw new Error(`Invalid or repeated stable object ID: ${id}`);
    ids.add(id);
  };
  if (!Array.isArray(scene.slides) || !scene.slides.length || scene.slides.length>100) throw new Error('Provide 1–100 slides');
  for (const s of scene.slides) {
    if (Object.keys(s).some(k=>!['id','title','sources','elements','notes','layoutId','replace','protect','intent'].includes(k))) throw new Error('Unsupported slide field');
    claim(s.id); nonempty(s.title,'slide title');
    if (!Array.isArray(s.sources) || !s.sources.length || s.sources.some(x=>typeof x!=='string'||!x.trim())) throw new Error('Each slide needs source references; use brief:<section> for supplied creative briefs');
    if(s.intent)validateSlideDecision(s.intent,s.sources,{required:true});
    if (!Array.isArray(s.elements) || !s.elements.length || s.elements.length>200) throw new Error('Provide 1–200 slide elements');
    if (s.notes !== undefined && typeof s.notes !== 'string') throw new Error('Notes must be text');
    for (const e of s.elements) {
      const fields={text:['href','text','role','fontSize','color','fill','bold','align','strike','code'],shape:['href','shape','text','role','fontSize','color','fill','bold','align','stroke','strokeWeight','dash','strike','code'],line:['color','weight','arrow','flipH','flipV','route','lead','turns','dash'],image:['src','alt','fit'],table:['rows','fontSize','color','headerFill','headerColor','bodyFill','padding','columnWidths','rowHeights'],chart:['chartType','series','source','sheetsChart','colors','labelSize','title','units']};
      if (!types.has(e.type) || Object.keys(e).some(k=>!['id','type','x','y','width','height',...(fields[e.type]??[])].includes(k))) throw new Error(`Unsupported element field/type in ${e.id}; do not silently drop it`);
      claim(e.id);
      if (!types.has(e.type)) throw new Error(`Unsupported element type: ${e.type}; do not flatten it`);
      for (const [k,max] of [['width',scene.canvas.width],['height',scene.canvas.height]]) positive(e[k],k,max);
      for (const [k,max] of [['x',scene.canvas.width],['y',scene.canvas.height]]) if (!Number.isFinite(e[k]) || e[k]<0 || e[k]>max) throw new Error(`Invalid ${k}`);
      if (e.x+e.width>scene.canvas.width+.01 || e.y+e.height>scene.canvas.height+.01) throw new Error(`${e.id} exceeds slide bounds`);
      if (e.color) color(e.color,theme); if (e.fill) color(e.fill,theme); if (e.stroke) color(e.stroke,theme);
      if (e.strokeWeight!==undefined) { positive(e.strokeWeight,'stroke weight',20); if (!e.stroke) throw new Error(`${e.id}: a stroke weight needs a stroke color`); }
      if (e.fontSize !== undefined) positive(e.fontSize,'font size',120);
      for (const k of ['bold','arrow','flipH','flipV','strike']) if (e[k]!==undefined && typeof e[k]!=='boolean') throw new Error(`Invalid ${k}`);
      if (e.dash!==undefined && !['dash','dot'].includes(e.dash)) throw new Error('A dash is dash or dot');
      if (e.type==='shape' && e.dash!==undefined && !e.stroke) throw new Error(`${e.id}: a dashed outline needs a stroke color`);
      if (e.weight!==undefined) positive(e.weight,'line weight',20);
      if (e.route!==undefined && !['elbow','curve'].includes(e.route)) throw new Error('A line route is elbow or curve');
      if (e.lead!==undefined && !['horizontal','vertical'].includes(e.lead)) throw new Error('A line leads off horizontal or vertical');
      if (e.turns!==undefined && e.turns!==1) throw new Error('A routed line turns once when turns is set');
      if (e.role!==undefined && !['title','body'].includes(e.role)) throw new Error('Unknown semantic text role');
      if(e.href!==undefined){let url;try{url=new URL(e.href);}catch{throw new Error('Use an absolute HTTP(S) hyperlink');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP(S) hyperlink without credentials');}
      if (e.align !== undefined && !['left','center','right'].includes(e.align)) throw new Error('Invalid text alignment');
      if (e.type==='text') nonempty(e.text,'text');
      // code lists the [start,end) character ranges of the text set in the code font, in order and apart.
      if (e.code!==undefined) { if (typeof e.text!=='string' || !Array.isArray(e.code) || !e.code.length || e.code.some((r,i)=>!Array.isArray(r) || r.length!==2 || !r.every(Number.isInteger) || r[0]<(i?e.code[i-1][1]:0) || r[1]<=r[0] || r[1]>e.text.length)) throw new Error(`${e.id}: code is a list of [start,end) ranges within its text, in order`); }
      if (e.type==='shape') {if (!Object.hasOwn(shapeKinds,e.shape??'rect')) throw new Error(`Use one of: ${Object.keys(shapeKinds).join(', ')}`);if(e.text!==undefined)nonempty(e.text,'shape text');}
      if (e.type==='image') { nonempty(e.src,'image source'); nonempty(e.alt,'image alt text'); if (!['contain','cover'].includes(e.fit??'contain')) throw new Error('Invalid image fit'); }
      for(const key of ['headerFill','headerColor','bodyFill'])if(e[key]!==undefined)color(e[key],theme);
      if(e.padding!==undefined && (!Number.isFinite(e.padding)||e.padding<0||e.padding>40))throw new Error('Invalid table padding');
      if (e.type==='table') {
        if (!Array.isArray(e.rows)||!e.rows.length||e.rows.length>30||!e.rows[0]?.length||e.rows[0].length>12||e.rows.some(row=>!Array.isArray(row)||row.length!==e.rows[0].length||row.some(c=>typeof c!=='string'))) throw new Error('Use a rectangular table, maximum 30 × 12');
      }
      if(e.type==='table'&&e.rowHeights!==undefined){if(!Array.isArray(e.rowHeights)||e.rowHeights.length!==e.rows.length||e.rowHeights.some(v=>!Number.isFinite(v)||v<=0)||Math.abs(e.rowHeights.reduce((a,v)=>a+v,0)-e.height)>.5)throw new Error('Table row heights must sum to its height in points');}
      if(e.type==='table'&&e.columnWidths!==undefined){if(!Array.isArray(e.columnWidths)||e.columnWidths.length!==e.rows[0].length||e.columnWidths.some(v=>!Number.isFinite(v)||v<=0)||Math.abs(e.columnWidths.reduce((a,v)=>a+v,0)-e.width)>.01)throw new Error('Table column widths must sum to its width in points');}
      if (e.type==='chart') {
        if (!['bar','line','pie'].includes(e.chartType)) throw new Error('Supported charts: bar, line, pie');
        if (!Array.isArray(e.series)||!e.series.length||e.series.some(s=>!s.name||!Array.isArray(s.labels)||!s.labels.length||s.labels.length!==s.values?.length||s.values.some(v=>!Number.isFinite(v)))) throw new Error('Chart needs labeled finite data series');
        nonempty(e.source,'chart evidence source');
        if(e.colors!==undefined){if(!Array.isArray(e.colors)||!e.colors.length)throw new Error('Chart colors need roles');e.colors.forEach(v=>color(v,theme));}
        if(e.labelSize!==undefined)positive(e.labelSize,'chart label size',120);
        for(const key of ['title','units'])if(e[key]!==undefined)nonempty(e[key],`chart ${key}`);
        if(e.units!==undefined&&e.chartType==='pie')throw new Error('A pie chart has no value axis to carry units');
        if(e.chartType==='pie'&&(e.series.length!==1||e.series[0].values.some(v=>v<0)||!e.series[0].values.some(v=>v>0)))throw new Error('Pie charts need one nonnegative series with a positive total');
      }
    }
  }
  return scene;
}
export function sceneFindings(scene) {
  validateScene(scene); const findings=[];
  const theme=themeFor(scene),luminance=hex=>{const values=[0,1,2].map(i=>parseInt(hex.slice(1+i*2,3+i*2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
  for (const s of scene.slides) {
    const text=s.elements.flatMap(e=>e.type==='table'?e.rows.flat():e.text?[e.text]:[]).join(' '), words=text.trim().split(/\s+/).length;
    if (words>90) findings.push({slide:s.id,severity:'warn',code:'density',detail:`${words} visible text words; inspect reading effort`});
    if (s.elements.every(e=>e.type==='text')) findings.push({slide:s.id,severity:s.intent?.visual?.family==='text'?'info':'warn',code:'text-only',detail:s.intent?.visual?.family==='text'?'Text is the recorded visual choice; judge its reading purpose':'Consider a visual relationship or evidence when it serves the message'});
    for (const e of s.elements) if (e.fontSize<14) findings.push({slide:s.id,object:e.id,severity:'warn',code:'small-text',detail:'Inspect at presentation size'});
    for (const e of s.elements.filter(e=>e.type==='text'||e.text)) {
      const ink=luminance(color(e.color??'text',theme)),fill=luminance(color(e.fill??'background',theme)),ratio=(Math.max(ink,fill)+.05)/(Math.min(ink,fill)+.05),font=e.fontSize??(e.role==='title'?theme.titleSize:theme.bodySize),minimum=font>=18||font>=14&&e.bold?3:4.5;
      if(ratio<minimum)findings.push({slide:s.id,object:e.id,severity:'warn',code:'contrast',detail:`Declared foreground/background contrast ${ratio.toFixed(2)}; inspect actual background and fix readability`});
    }
  }
  return findings;
}
export function renderSceneHtml(scene) {
  validateScene(scene); const t=themeFor(scene);
  // Code runs sit in one span with the words around them, so the flex box wraps them as one line of text.
  const mono=[...new Set([t.codeFont,...codeFallback])].map(f=>`'${f}'`).join(',')+',monospace';
  const words=e=>e.code?`<span>${textRuns(e).map(r=>r.code?`<code style="font-family:${mono};font-size:inherit">${escape(r.text)}</code>`:escape(r.text)).join('')}</span>`:escape(e.text??'');
  const view=e=>{
    const box=`left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px`, textStyle=`color:${color(e.color??'text',t)};font-size:${e.fontSize??(e.role==='title'?t.titleSize:t.bodySize)}px;font-weight:${e.bold?700:400};text-align:${e.align??'left'}${e.strike?';text-decoration:line-through':''}`;
    if (e.type==='image') return `<img class="object" data-object-id="${e.id}" alt="${escape(e.alt)}" src="${escape(e.src)}" style="${box};object-fit:${e.fit??'contain'}">`;
    if (e.type==='line') return `<svg class="object" data-object-id="${e.id}" style="${box}" viewBox="0 0 ${e.width} ${e.height}"><defs><marker id="a-${e.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="${color(e.color??'accent',t)}"/></marker></defs><line x1="${e.flipH?e.width:0}" y1="${e.flipV?e.height:0}" x2="${e.flipH?0:e.width}" y2="${e.flipV?0:e.height}" stroke="${color(e.color??'accent',t)}" stroke-width="${e.weight??2}"${e.dash?` stroke-dasharray="${e.dash==='dot'?'2 4':'8 5'}"`:''} ${e.arrow?`marker-end="url(#a-${e.id})"`:''}/></svg>`;
    if (e.type==='table') return `<table class="object" data-object-id="${e.id}" style="${box};${textStyle}">${(e.columnWidths??e.rows[0].map(()=>e.width/e.rows[0].length)).map(w=>`<col style="width:${w}px">`).join('')}${e.rows.map((row,i)=>`<tr>${row.map(c=>`<${i?'td':'th'} style="padding:${e.padding??3.6}px;color:${color(i?(e.color??'text'):(e.headerColor??e.color??'text'),t)};background:${color(i?(e.bodyFill??'background'):(e.headerFill??'muted'),t)}">${escape(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table>`;
    if (e.type==='chart') return `<div class="object chart" data-object-id="${e.id}" style="${box}"><strong>${escape(e.chartType)} chart${e.title?`: ${escape(e.title)}`:''}${e.units?` (${escape(e.units)})`:''} · native PowerPoint data</strong>${e.series.map(s=>`<p>${escape(s.name)}: ${s.values.map((v,i)=>`${escape(s.labels[i])} ${v}`).join(', ')}</p>`).join('')}<small>Chart geometry needs target-rendered review</small></div>`;
    return `<div class="object text" data-object-id="${e.id}" style="${box};${textStyle};background:${e.fill?color(e.fill,t):'transparent'};${e.stroke?`border:${e.strokeWeight??1.5}px ${e.dash==='dot'?'dotted':e.dash?'dashed':'solid'} ${color(e.stroke,t)};`:''}border-radius:${shapeKinds[e.shape??'rect'][2]}">${words(e)}</div>`;
  };
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(scene.title)}</title><style>body{background:#eee;margin:20px;font-family:${JSON.stringify(t.font)},sans-serif}section{position:relative;width:${scene.canvas.width}px;height:${scene.canvas.height}px;background:${t.background};margin:20px auto;overflow:hidden;box-shadow:0 2px 8px #0002}.object{position:absolute;box-sizing:border-box}.text{white-space:pre-wrap;display:flex;align-items:center;padding:3.6px;overflow:hidden}table{border-collapse:collapse;table-layout:fixed}td,th{padding:3.6px;border:1px solid #ccc}th{background:${t.muted}}.chart{border:1px dashed #999;padding:12px;overflow:auto}</style><p>Editable scene preview. Native editor metrics, charts and template artwork require final rendered review.</p>${scene.slides.map(s=>`<section data-slide-id="${s.id}" aria-label="${escape(s.title)}">${s.elements.map(view).join('')}</section>`).join('')}</html>`;
}
export function coverage(scene, required=[]) {
  validateScene(scene); const refs=new Set(scene.slides.flatMap(s=>s.sources));
  const missing=required.filter(id=>!refs.has(id));
  return {sceneDigest:digest(scene),covered:[...refs],missing,complete:!missing.length};
}
export const contract = `Scene v2 (AI-owned intermediate; users may supply a brief or source documents).
{version:2,title,mode:new|redesign|rework,canvas:{width,height},theme?:{font,codeFont,background,text,accent,muted,titleSize,bodySize},slides:[...]}
Coordinates are points. Stable IDs match [a-zA-Z_][a-zA-Z0-9_-]{4,49} and are unique across the scene.
Slide: {id,title,sources:[evidence IDs],elements:[...],intent?:{takeaway,relationship,rationale,evidence,audienceQuestion,alternative:{treatment,reason},visual:{family,purpose,route?}},notes?:string,layoutId?:native Google layout ID,replace?:[existing object IDs],protect?:[existing object IDs]}.
Element: {id,type:text|shape|line|table|image|chart,x,y,width,height,...}.
Text/shape: text, href?:absolute HTTP(S) hyperlink, role?:title|body, fontSize, color/fill (hex or theme key), bold, strike?:boolean, code?:[[start,end]] character ranges set in theme.codeFont (default Courier New), align:left|center|right. Shape: rect|ellipse|roundRect|diamond|hexagon|chevron|can; stroke?:outline color, strokeWeight?:points, dash?:dash|dot.
Line: color, weight, arrow, dash?:dash|dot, flipH/flipV, route?:elbow|curve with lead?:horizontal|vertical and turns?:1 for a single corner. Table: rows (rectangular strings), fontSize, headerFill/headerColor/bodyFill, padding, columnWidths (points summing to width).
Image: src (local path for PPTX, public HTTPS URL for Google), alt, fit:contain|cover.
Chart: chartType:bar|line|pie, series:[{name,labels:[...],values:[...]}], source, colors?:[hex], labelSize?:points, title?, units?:value-axis title (not on a pie). Native editable chart data in PPTX; Google requires an existing linked Sheets chart via sheetsChart:{spreadsheetId,chartId}.
For new creative work, include concise intent decisions on every slide; retained old scenes need not be rewritten. Native-template work records equivalent decisions against slide/object IDs.
Brand add-ons supply themes, source templates, icons, voice and protected artwork. Never flatten unsupported objects or imply HTML is a target-editor render.`;
