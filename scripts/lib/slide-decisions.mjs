// Concise design decisions, not a transcript of private reasoning.
const families=['text','icon','diagram','regions','table','chart','sourced-image','generated-art','quote'];
const nonempty=v=>typeof v==='string'&&v.trim()&&v.length<=20000;
export function validateSlideDecision(intent,sources,{required=false}={}) {
  if(!intent) {if(required)throw new Error('Every new slide needs a content-based intent');return;}
  const keys=['takeaway','relationship','rationale','evidence','audienceQuestion','alternative','visual'];
  if(Object.keys(intent).some(k=>!keys.includes(k)))throw new Error('Unsupported intent field');
  for(const key of ['takeaway','relationship','rationale'])if(!nonempty(intent[key]))throw new Error(`Provide intent ${key}`);
  if(!Array.isArray(intent.evidence)||!intent.evidence.length||intent.evidence.some(x=>!sources.includes(x)))throw new Error('Intent evidence must be retained in slide sources');
  if(required||intent.audienceQuestion!==undefined)if(!nonempty(intent.audienceQuestion))throw new Error('Provide the audience question for this slide');
  if(required||intent.alternative!==undefined){const a=intent.alternative;if(!a||Object.keys(a).some(k=>!['treatment','reason'].includes(k))||!nonempty(a.treatment)||!nonempty(a.reason))throw new Error('Provide an alternative treatment and content-specific rejection reason');}
  if(required||intent.visual!==undefined){const v=intent.visual;if(!v||Object.keys(v).some(k=>!['family','purpose','route'].includes(k))||!families.includes(v.family)||!nonempty(v.purpose)||v.route!==undefined&&!nonempty(v.route))throw new Error('Provide a visual family and communicative purpose (text/no asset is valid)');}
}
export function compositionGeometry(slide,canvas) {
  // Ignore wording/IDs/colors; semantic variants with identical geometry group together.
  return JSON.stringify(slide.elements.filter(e=>e.role!=='title'&&e.text!==slide.title).map(e=>[e.type,e.shape??'',...[e.x/canvas.width,e.y/canvas.height,e.width/canvas.width,e.height/canvas.height].map(v=>Math.round(v*50)),e.type==='table'?[e.rows.length,e.rows[0].length]:null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
