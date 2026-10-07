// A manifest is an optional routing aid, never a replacement for native sources.
export function chooseTemplate(entries,{id,query='',format='google-slides'}={}) {
  if(!Array.isArray(entries))throw new Error('Template manifest needs an array');
  const compatible=entries.filter(e=>e.enabled!==false&&e.format===format);
  if(id){const match=compatible.find(e=>e.id===id);if(!match)throw new Error('Explicit template is missing or incompatible');return {selected:match,reason:'explicit choice'};}
  const words=new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const scored=compatible.map(e=>({entry:e,score:(e.useWhen??[]).filter(term=>term.toLowerCase().split(/\W+/).every(w=>words.has(w))).length}));
  const matches=scored.filter(x=>x.score>0).sort((a,b)=>b.score-a.score||(b.entry.priority??0)-(a.entry.priority??0));
  if(matches.length){const top=matches[0],ties=matches.filter(x=>x.score===top.score&&(x.entry.priority??0)===(top.entry.priority??0));if(ties.length===1)return {selected:top.entry,reason:'matching use case'};return {selected:null,candidates:ties.map(x=>x.entry),reason:'ambiguous; ask'};}
  const defaults=compatible.filter(e=>e.default);if(defaults.length===1)return {selected:defaults[0],reason:'declared default'};
  if(compatible.length===1)return {selected:compatible[0],reason:'only compatible template'};
  return {selected:null,candidates:compatible,reason:'ambiguous; ask'};
}
