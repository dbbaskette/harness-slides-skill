// Model-authored relative layout, compiled into absolute brand-constrained scene objects.
// The model chooses structure; this module owns arithmetic, fit and brand roles.
import {validateBrandContract} from './brand-contract.mjs';

const idPattern=/^[a-zA-Z_][a-zA-Z0-9_-]{4,40}$/;
const fields={
  stack:['direction','gap','align','children','group'],
  grid:['columns','gap','children','group'],
  free:['children','group'],
  box:['text','shape','fill','color','textRole','align','children','gap'],
  text:['text','textRole','color','align'],
  image:['src','alt','fit'],
  spacer:[],
};
const common=['id','type','weight','at'],gapNames=['none','tight','normal','wide'],aligns=['start','center','end','stretch'];
const round=n=>Math.round(n*100)/100;
const fail=(where,message)=>{throw new Error(`${where}: ${message}`);};
const str=v=>typeof v==='string'&&v.trim()&&v.length<=20000;

export const composeContract=`Composition v1 (AI-owned; describe structure, never coordinates).
{version:1,title,slides:[{id,title,sources:[evidence IDs],canvas:NODE,connect?:[EDGE],notes?,intent?,layoutId?}]}
NODE containers: {type:stack,direction:row|column,gap?,align?,children:[NODE]} | {type:grid,columns:1-6,gap?,children:[NODE]} | {type:free,children:[NODE with at:{x,y,width,height} as 0-1 fractions]}.
NODE leaves: {type:box,id,text?|children?,shape?:rect|ellipse,fill?,color?,textRole?,align?} | {type:text,id,text,textRole?,color?,align?} | {type:image,id,src,alt,fit?} | {type:spacer}.
Any node may set weight (relative share, default 1). Containers may set group:true and an id.
gap: none|tight|normal|wide. align: start|center|end|stretch. fill/color: a brand color role name. textRole: a brand typography role name.
EDGE: {id,from:NODE id,to:NODE id,label?,arrow?:boolean,color?}.
IDs match [a-zA-Z_][a-zA-Z0-9_-]{4,40} and are unique across the deck.
Text is measured with the brand font. Content that cannot fit at its role's size fails with the shortfall; rewrite, split or restructure.`;

export function validateComposition(comp,contract) {
  validateBrandContract(contract,{medium:'slides'});
  const d=contract.design,roles=d.slides.typography,colors=d.colors,maxFills=d.slides.constraints?.maxFills??3;
  if(comp?.version!==1)throw new Error('Use composition version 1 (run compose contract)');
  if(Object.keys(comp).some(k=>!['version','title','slides'].includes(k)))throw new Error('Unsupported composition field');
  if(!str(comp.title))throw new Error('Provide a deck title');
  if(!Array.isArray(comp.slides)||!comp.slides.length||comp.slides.length>100)throw new Error('Provide 1–100 slides');
  const ids=new Set(),claim=(id,where)=>{if(!idPattern.test(id??'')||ids.has(id))fail(where,`invalid or repeated ID: ${id}`);ids.add(id);};
  const summary=[];
  for(const s of comp.slides) {
    if(Object.keys(s).some(k=>!['id','title','sources','canvas','connect','notes','intent','layoutId'].includes(k)))fail(s.id,'unsupported slide field');
    claim(s.id,'slide');
    if(!str(s.title))fail(s.id,'provide a slide title');
    if(!Array.isArray(s.sources)||!s.sources.length||s.sources.some(x=>!str(x)))fail(s.id,'provide source references');
    const local=new Set(),fills=new Set();let nodes=0;
    const walk=(n,depth,inFree)=>{
      const where=`${s.id}/${n?.id??n?.type}`;
      if(!n||typeof n!=='object'||!fields[n.type])fail(where,'unknown node type');
      if(depth>6)fail(where,'nest at most 6 levels');
      if(Object.keys(n).some(k=>!common.includes(k)&&!fields[n.type].includes(k)))fail(where,'unsupported node field; never silently drop content');
      if(++nodes>80)fail(s.id,'use at most 80 nodes per slide');
      const needsId=['box','text','image'].includes(n.type)||n.group;
      if(needsId||n.id!==undefined){claim(n.id,where);local.add(n.id);}
      if(n.weight!==undefined&&(!Number.isFinite(n.weight)||n.weight<=0||n.weight>10))fail(where,'weight must be 0–10');
      if(inFree){const a=n.at;if(!a||['x','y','width','height'].some(k=>!Number.isFinite(a[k])||a[k]<0||a[k]>1)||a.width<=0||a.height<=0||a.x+a.width>1.0001||a.y+a.height>1.0001)fail(where,'free children need at:{x,y,width,height} within 0–1');}
      else if(n.at!==undefined)fail(where,'at is only valid inside a free container');
      if(n.gap!==undefined&&!gapNames.includes(n.gap))fail(where,`gap must be one of ${gapNames.join('|')}`);
      if(n.align!==undefined&&!aligns.includes(n.align))fail(where,`align must be one of ${aligns.join('|')}`);
      for(const key of ['fill','color'])if(n[key]!==undefined&&!colors[n[key]])fail(where,`${key} must be a brand color role: ${Object.keys(colors).join(', ')}`);
      if(n.textRole!==undefined&&!roles[n.textRole])fail(where,`textRole must be one of ${Object.keys(roles).join(', ')}`);
      if(n.type==='stack'&&!['row','column'].includes(n.direction))fail(where,'stack needs direction row|column');
      if(n.type==='grid'&&(!Number.isInteger(n.columns)||n.columns<1||n.columns>6))fail(where,'grid needs 1–6 columns');
      if(n.type==='text'&&!str(n.text))fail(where,'provide text');
      if(n.type==='box') {
        if(n.text!==undefined&&n.children!==undefined)fail(where,'a box holds text or children, not both');
        if(n.text!==undefined&&!str(n.text))fail(where,'provide box text');
        if(!['rect','ellipse'].includes(n.shape??'rect'))fail(where,'shape must be rect|ellipse');
        if(n.fill)fills.add(n.fill);
      }
      if(n.type==='image'){if(!str(n.src)||!str(n.alt))fail(where,'image needs src and alt');if(!['contain','cover'].includes(n.fit??'contain'))fail(where,'fit must be contain|cover');}
      const kids=n.children;
      if(['stack','grid','free'].includes(n.type)||kids!==undefined) {
        if(!Array.isArray(kids)||!kids.length||kids.length>12)fail(where,'provide 1–12 children');
        for(const k of kids)walk(k,depth+1,n.type==='free');
      }
    };
    walk(s.canvas,1,false);
    if(fills.size>maxFills)fail(s.id,`uses ${fills.size} fill colors; the brand allows ${maxFills} per slide`);
    for(const c of s.connect??[]) {
      if(Object.keys(c).some(k=>!['id','from','to','label','arrow','color'].includes(k)))fail(s.id,'unsupported edge field');
      claim(c.id,`${s.id}/edge`);
      if(!local.has(c.from)||!local.has(c.to)||c.from===c.to)fail(`${s.id}/${c.id}`,'edges connect two distinct nodes on this slide');
      if(c.label!==undefined&&!str(c.label))fail(`${s.id}/${c.id}`,'provide an edge label or omit it');
      if(c.color!==undefined&&!colors[c.color])fail(`${s.id}/${c.id}`,'edge color must be a brand color role');
      if(c.arrow!==undefined&&typeof c.arrow!=='boolean')fail(`${s.id}/${c.id}`,'arrow must be boolean');
    }
    summary.push({id:s.id,nodes,fills:[...fills],edges:(s.connect??[]).length});
  }
  return {slides:summary};
}
