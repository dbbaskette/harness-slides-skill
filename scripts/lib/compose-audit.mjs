// Audits that read a compiled deck against what was approved and what a slide can honestly show.
// They find what a composer should repair; none of them approves a slide.

const words=text=>String(text??'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const contains=(whole,part)=>part&&` ${whole} `.includes(` ${part} `);

// An approved point's sentence chopped into several nodes: "Base backup," / "continuous archived WAL," / "storage access…".
// The sentence is whole when one node, or the slide's notes, holds all of it. A fragment equal to a label the outline gave
// (the point's own label, or one of its parts) is a short node label, which is what a diagram node should carry.
// The words a slide shows: a compiled scene's elements, or a composition's nodes, edge labels and furniture before it is laid out.
function visible(slide) {
  if(Array.isArray(slide.elements))return slide.elements.filter(e=>e.role!=='title'&&typeof e.text==='string');
  const found=[],walk=n=>{if(!n||typeof n!=='object')return;if(typeof n.text==='string')found.push({id:n.id??n.type,text:n.text});if(n.type==='metric'){found.push({id:n.id,text:String(n.value??'')},{id:`${n.id}_label`,text:String(n.label??'')});}(Array.isArray(n.children)?n.children:[]).forEach(walk);walk(n.hub);};
  walk(slide.canvas);
  for(const c of Array.isArray(slide.connect)?slide.connect:[])if(typeof c?.label==='string')found.push({id:`${c.id}_label`,text:c.label});
  for(const key of ['subtitle','source'])if(typeof slide[key]==='string')found.push({id:`${slide.id}_${key}`,text:slide[key]});
  if(slide.caveat)found.push({id:`${slide.id}_caveat`,text:typeof slide.caveat==='string'?slide.caveat:String(slide.caveat.text??'')});
  return found;
}

// deck is a compiled scene or a composition.
export function splitPoints(outline,deck,{severity='warn'}={}) {
  const findings=[],approved=new Map((outline?.slides??[]).filter(s=>s?.kind==='content').map(s=>[s.id,s]));
  for(const slide of deck.slides??[]) {
    const source=approved.get(slide?.id);if(!source)continue;
    const shown=visible(slide).map(e=>({id:e.id,text:words(e.text)})).filter(e=>e.text);
    const notes=words([slide.notes,slide.provenance].filter(x=>typeof x==='string').join(' ')),labels=new Set(source.points.flatMap(p=>[p.label,...(p.parts??[])]).map(words).filter(Boolean));
    for(const point of source.points??[]) {
      const sentence=words(point.text);if(!sentence||sentence.split(' ').length<4)continue;
      if(contains(notes,sentence)||shown.some(e=>contains(e.text,sentence)))continue;
      const pieces=shown.filter(e=>e.text!==sentence&&!labels.has(e.text)&&contains(sentence,e.text));
      const covered=new Set(pieces.flatMap(e=>e.text.split(' '))),share=sentence.split(' ').filter(w=>covered.has(w)).length/sentence.split(' ').length;
      if(pieces.length<2||share<.4)continue;
      const name=point.label?`"${point.label}"`:`"${point.text.slice(0,40)}${point.text.length>40?'…':''}"`;
      findings.push({slide:slide.id,code:'split-point',severity,objects:pieces.map(e=>e.id),point:point.label??point.text,
        detail:`The approved point ${name} is split across ${pieces.map(e=>e.id).join(', ')}. Keep its sentence whole in one node, or in the notes, and give diagram nodes short labels; an outline point can provide them as parts.`});
    }
  }
  return findings;
}

// A source line is a citation the audience can follow. These patterns are a team's own bookkeeping instead:
// finding and research IDs (g3, f27), objective IDs (O4), blueprints and slug-prefixed references (research:g4).
const internal=[/\bfindings?\s+[a-z]?\d/i,/\bblueprint\b/i,/\bO\d{1,2}\b/,/\b[gf]\d{1,3}\b/,/^[a-z0-9]+(?:[-_][a-z0-9]+)*:\S/,/\b(?:dossier|intake|session|outline)\s+(?:item\s+)?\d/i];
export const internalSource=text=>typeof text==='string'&&internal.some(pattern=>pattern.test(text.trim()));

// Drawing faked with characters: ASCII arrows (-->, - - >, ==>, <--), box-drawing characters, +---+ frames, and text
// that is nothing but punctuation, such as a "." placed to anchor a hand-drawn line.
const faked=[/[─-╿]/u,/(?:^|\s)[-=]{1,3}\s?>/,/-\s+-\s*>/,/<\s?[-=]{1,3}(?:\s|$)/,/\+-{2,}|-{2,}\+/,/^[\s\p{P}\p{S}]+$/u];
export const asciiArt=text=>typeof text==='string'&&text.trim()!==''&&!/^[→←↑↓]+$/u.test(text.trim())&&faked.some(pattern=>pattern.test(text));

// Findings grouped per slide, worst first, so a caller can send each slide back for repair with what to fix on it.
// A slide with an error-level finding blocks delivery; info-level prompts are left out.
export function repairClusters(slides) {
  const clusters=[];
  for(const s of slides) {
    const findings=(s.findings??[]).filter(f=>['warn','error'].includes(f.severity));if(!findings.length)continue;
    const codes={},objects=[];
    for(const f of findings){codes[f.code]=(codes[f.code]??0)+1;for(const id of [f.object,...(f.objects??[]),...(f.relatedObjects??[])])if(id&&!objects.includes(id))objects.push(id);}
    clusters.push({slide:s.id,number:s.number,blocking:findings.some(f=>f.severity==='error'),codes,objects});
  }
  clusters.sort((a,b)=>Number(b.blocking)-Number(a.blocking)||a.number-b.number);
  return {blocking:clusters.filter(c=>c.blocking).map(c=>c.slide),slides:clusters};
}
