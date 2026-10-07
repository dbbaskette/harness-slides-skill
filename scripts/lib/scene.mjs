import { digest, escape } from './common.mjs';

export const defaultTheme = Object.freeze({
  font: 'Arial', background: '#FFFFFF', text: '#202124', accent: '#2867B2', muted: '#F0F2F5',
  titleSize: 32, bodySize: 20,
});
const idPattern = /^[a-zA-Z_][a-zA-Z0-9_-]{4,49}$/;
const types = new Set(['text','shape','line','image','table','chart']);
const positive = (n, name, max=2000) => { if (!Number.isFinite(n) || n<=0 || n>max) throw new Error(`Invalid ${name}`); };
const nonempty = (s, name) => { if (typeof s !== 'string' || !s.trim() || s.length>20000) throw new Error(`Invalid ${name}`); };
export function themeFor(scene) {
  const t = {...defaultTheme, ...scene.theme};
  if (scene.theme && Object.keys(scene.theme).some(k=>!Object.hasOwn(defaultTheme,k))) throw new Error('Unsupported theme field');
  nonempty(t.font,'font');
  if (!/^[\p{L}\p{N} _-]{1,100}$/u.test(t.font)) throw new Error('Use a font family name, not CSS');
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
    if (Object.keys(s).some(k=>!['id','title','sources','elements','notes','layoutId','replace','protect'].includes(k))) throw new Error('Unsupported slide field');
    claim(s.id); nonempty(s.title,'slide title');
    if (!Array.isArray(s.sources) || !s.sources.length || s.sources.some(x=>typeof x!=='string'||!x.trim())) throw new Error('Each slide needs source references; use brief:<section> for supplied creative briefs');
    if (!Array.isArray(s.elements) || !s.elements.length || s.elements.length>200) throw new Error('Provide 1–200 slide elements');
    if (s.notes !== undefined && typeof s.notes !== 'string') throw new Error('Notes must be text');
    for (const e of s.elements) {
      const fields={text:['text','role','fontSize','color','fill','bold','align'],shape:['shape','text','role','fontSize','color','fill','bold','align'],line:['color','weight','arrow'],image:['src','alt','fit'],table:['rows','fontSize','color'],chart:['chartType','series','source','sheetsChart']};
      if (!types.has(e.type) || Object.keys(e).some(k=>!['id','type','x','y','width','height',...(fields[e.type]??[])].includes(k))) throw new Error(`Unsupported element field/type in ${e.id}; do not silently drop it`);
      claim(e.id);
      if (!types.has(e.type)) throw new Error(`Unsupported element type: ${e.type}; do not flatten it`);
      for (const [k,max] of [['width',scene.canvas.width],['height',scene.canvas.height]]) positive(e[k],k,max);
      for (const [k,max] of [['x',scene.canvas.width],['y',scene.canvas.height]]) if (!Number.isFinite(e[k]) || e[k]<0 || e[k]>max) throw new Error(`Invalid ${k}`);
      if (e.x+e.width>scene.canvas.width+.01 || e.y+e.height>scene.canvas.height+.01) throw new Error(`${e.id} exceeds slide bounds`);
      if (e.color) color(e.color,theme); if (e.fill) color(e.fill,theme);
      if (e.fontSize !== undefined) positive(e.fontSize,'font size',120);
      for (const k of ['bold','arrow']) if (e[k]!==undefined && typeof e[k]!=='boolean') throw new Error(`Invalid ${k}`);
      if (e.weight!==undefined) positive(e.weight,'line weight',20);
      if (e.role!==undefined && !['title','body'].includes(e.role)) throw new Error('Unknown semantic text role');
      if (e.align !== undefined && !['left','center','right'].includes(e.align)) throw new Error('Invalid text alignment');
      if (e.type==='text') nonempty(e.text,'text');
      if (e.type==='shape') {if (!['rect','ellipse'].includes(e.shape??'rect')) throw new Error('Use rect or ellipse');if(e.text!==undefined)nonempty(e.text,'shape text');}
      if (e.type==='image') { nonempty(e.src,'image source'); nonempty(e.alt,'image alt text'); if (!['contain','cover'].includes(e.fit??'contain')) throw new Error('Invalid image fit'); }
      if (e.type==='table') {
        if (!Array.isArray(e.rows)||!e.rows.length||e.rows.length>30||!e.rows[0]?.length||e.rows[0].length>12||e.rows.some(row=>!Array.isArray(row)||row.length!==e.rows[0].length||row.some(c=>typeof c!=='string'))) throw new Error('Use a rectangular table, maximum 30 × 12');
      }
      if (e.type==='chart') {
        if (!['bar','line','pie'].includes(e.chartType)) throw new Error('Supported charts: bar, line, pie');
        if (!Array.isArray(e.series)||!e.series.length||e.series.some(s=>!s.name||!Array.isArray(s.labels)||!s.labels.length||s.labels.length!==s.values?.length||s.values.some(v=>!Number.isFinite(v)))) throw new Error('Chart needs labeled finite data series');
        nonempty(e.source,'chart evidence source');
      }
    }
  }
  return scene;
}
export function sceneFindings(scene) {
  validateScene(scene); const findings=[];
  for (const s of scene.slides) {
    const text=s.elements.filter(e=>e.type==='text').map(e=>e.text).join(' '), words=text.trim().split(/\s+/).length;
    if (words>90) findings.push({slide:s.id,severity:'warn',code:'density',detail:`${words} visible text words; inspect reading effort`});
    if (s.elements.every(e=>e.type==='text')) findings.push({slide:s.id,severity:'warn',code:'text-only',detail:'Consider a visual relationship or evidence when it serves the message'});
    for (const e of s.elements) if (e.fontSize<14) findings.push({slide:s.id,object:e.id,severity:'warn',code:'small-text',detail:'Inspect at presentation size'});
  }
  return findings;
}
export function renderSceneHtml(scene) {
  validateScene(scene); const t=themeFor(scene);
  const view=e=>{
    const box=`left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px`, textStyle=`color:${color(e.color??'text',t)};font-size:${e.fontSize??(e.role==='title'?t.titleSize:t.bodySize)}px;font-weight:${e.bold?700:400};text-align:${e.align??'left'}`;
    if (e.type==='image') return `<img class="object" data-object-id="${e.id}" alt="${escape(e.alt)}" src="${escape(e.src)}" style="${box};object-fit:${e.fit??'contain'}">`;
    if (e.type==='line') return `<svg class="object" data-object-id="${e.id}" style="${box}" viewBox="0 0 ${e.width} ${e.height}"><defs><marker id="a-${e.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="${color(e.color??'accent',t)}"/></marker></defs><line x1="0" y1="0" x2="${e.width}" y2="${e.height}" stroke="${color(e.color??'accent',t)}" stroke-width="${e.weight??2}" ${e.arrow?`marker-end="url(#a-${e.id})"`:''}/></svg>`;
    if (e.type==='table') return `<table class="object" data-object-id="${e.id}" style="${box};${textStyle}">${e.rows.map((row,i)=>`<tr>${row.map(c=>`<${i?'td':'th'}>${escape(c)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</table>`;
    if (e.type==='chart') return `<div class="object chart" data-object-id="${e.id}" style="${box}"><strong>${escape(e.chartType)} chart · native PowerPoint data</strong>${e.series.map(s=>`<p>${escape(s.name)}: ${s.values.map((v,i)=>`${escape(s.labels[i])} ${v}`).join(', ')}</p>`).join('')}<small>Chart geometry needs target-rendered review</small></div>`;
    return `<div class="object text" data-object-id="${e.id}" style="${box};${textStyle};background:${e.fill?color(e.fill,t):'transparent'};border-radius:${e.shape==='ellipse'?'50%':'0'}">${escape(e.text??'')}</div>`;
  };
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(scene.title)}</title><style>body{background:#eee;margin:20px;font-family:${JSON.stringify(t.font)},sans-serif}section{position:relative;width:${scene.canvas.width}px;height:${scene.canvas.height}px;background:${t.background};margin:20px auto;overflow:hidden;box-shadow:0 2px 8px #0002}.object{position:absolute;box-sizing:border-box}.text{white-space:pre-wrap;display:flex;align-items:center;padding:3.6px;overflow:hidden}table{border-collapse:collapse;table-layout:fixed}td,th{padding:3.6px;border:1px solid #ccc}th{background:${t.muted}}.chart{border:1px dashed #999;padding:12px;overflow:auto}</style><p>Editable scene preview. Native editor metrics, charts and template artwork require final rendered review.</p>${scene.slides.map(s=>`<section data-slide-id="${s.id}" aria-label="${escape(s.title)}">${s.elements.map(view).join('')}</section>`).join('')}</html>`;
}
export function coverage(scene, required=[]) {
  validateScene(scene); const refs=new Set(scene.slides.flatMap(s=>s.sources));
  const missing=required.filter(id=>!refs.has(id));
  return {sceneDigest:digest(scene),covered:[...refs],missing,complete:!missing.length};
}
export const contract = `Scene v2 (AI-owned intermediate; users may supply a brief or source documents).
{version:2,title,mode:new|redesign|rework,canvas:{width,height},theme?:{font,background,text,accent,muted,titleSize,bodySize},slides:[...]}
Coordinates are points. Stable IDs match [a-zA-Z_][a-zA-Z0-9_-]{4,49} and are unique across the scene.
Slide: {id,title,sources:[evidence IDs],elements:[...],notes?:string,layoutId?:native Google layout ID,replace?:[existing object IDs],protect?:[existing object IDs]}.
Element: {id,type:text|shape|line|table|image|chart,x,y,width,height,...}.
Text/shape: text, role?:title|body, fontSize, color/fill (hex or theme key), bold, align:left|center|right. Shape: rect|ellipse.
Line: color, weight, arrow. Table: rows (rectangular strings), fontSize.
Image: src (local path for PPTX, public HTTPS URL for Google), alt, fit:contain|cover.
Chart: chartType:bar|line|pie, series:[{name,labels:[...],values:[...]}], source. Native editable chart data in PPTX; Google requires an existing linked Sheets chart via sheetsChart:{spreadsheetId,chartId}.
Brand add-ons supply themes, source templates, icons, voice and protected artwork. Never flatten unsupported objects or imply HTML is a target-editor render.`;
