// Model-authored relative layout, compiled into absolute brand-constrained scene objects.
// The model chooses structure; this module owns arithmetic, fit and brand roles.
import {validateScene,shapeKinds} from './scene.mjs';
import {brandTheme,validateBrandContract} from './brand-contract.mjs';
import {resolveFont,measureText} from './text-metrics.mjs';

const idPattern=/^[a-zA-Z_][a-zA-Z0-9_-]{4,40}$/;
const fields={
  stack:['direction','gap','align','children','group'],
  grid:['columns','gap','children','group'],
  free:['children','group'],
  box:['text','shape','fill','color','textRole','align','children','gap'],
  text:['text','textRole','color','align'],
  image:['src','alt','fit'],
  icon:['icon'],
  spacer:[],
};
const common=['id','type','weight','at'],gapNames=['none','tight','normal','wide'],aligns=['start','center','end','stretch'];
const round=n=>Math.round(n*100)/100;
const fail=(where,message)=>{throw new Error(`${where}: ${message}`);};
const str=v=>typeof v==='string'&&v.trim()&&v.length<=20000;

export const composeContract=`Composition v1 (AI-owned; describe structure, never coordinates).
{version:1,title,slides:[{id,title,sources:[evidence IDs],canvas:NODE,connect?:[EDGE],notes?,intent?,layoutId?}]}
NODE containers: {type:stack,direction:row|column,gap?,align?,children:[NODE]} | {type:grid,columns:1-6,gap?,children:[NODE]} | {type:free,children:[NODE with at:{x,y,width,height} as 0-1 fractions]}.
NODE leaves: {type:icon,id,icon:STABLE ICON ID from the brand's icon search} | {type:box,id,text?|children?,shape?:rect|ellipse|roundRect|diamond|hexagon|chevron|can,fill?,color?,textRole?,align?} | {type:text,id,text,textRole?,color?,align?} | {type:image,id,src,alt,fit?} | {type:spacer}.
Any node may set weight (relative share, default 1). Containers may set group:true and an id.
gap: none|tight|normal|wide. align: start|center|end|stretch. fill/color: a brand color role name. textRole: a brand typography role name.
EDGE: {id,from:NODE id,to:NODE id,label?,arrow?:boolean,color?}.
A labelled edge needs room: its label must fit the gap between the two nodes, so put a spacer between them.
Generated IDs are reserved: <slide>_title, <box with children>_group, <labelled edge>_label.
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
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('each slide must be an object');
    if(Object.keys(s).some(k=>!['id','title','sources','canvas','connect','notes','intent','layoutId'].includes(k)))fail(s.id,'unsupported slide field');
    claim(s.id,'slide');claim(`${s.id}_title`,s.id);
    if(!str(s.title))fail(s.id,'provide a slide title');
    if(!Array.isArray(s.sources)||!s.sources.length||s.sources.some(x=>!str(x)))fail(s.id,'provide source references');
    const local=new Set(),fills=new Set();let nodes=0;
    const walk=(n,depth,inFree)=>{
      const where=`${s.id}/${n?.id??n?.type}`;
      if(!n||typeof n!=='object'||!fields[n.type])fail(where,'unknown node type');
      if(depth>6)fail(where,'nest at most 6 levels');
      if(Object.keys(n).some(k=>!common.includes(k)&&!fields[n.type].includes(k)))fail(where,'unsupported node field; never silently drop content');
      if(++nodes>80)fail(s.id,'use at most 80 nodes per slide');
      const needsId=['box','text','image','icon'].includes(n.type)||n.group;
      if(needsId||n.id!==undefined){claim(n.id,where);local.add(n.id);}
      if(n.group!==undefined&&typeof n.group!=='boolean')fail(where,'group must be boolean');
      if(n.weight!==undefined&&(!Number.isFinite(n.weight)||n.weight<=0||n.weight>10))fail(where,'weight must be 0–10');
      if(inFree){const a=n.at;if(!a||['x','y','width','height'].some(k=>!Number.isFinite(a[k])||a[k]<0||a[k]>1)||a.width<=0||a.height<=0||a.x+a.width>1.0001||a.y+a.height>1.0001)fail(where,'free children need at:{x,y,width,height} within 0–1');}
      else if(n.at!==undefined)fail(where,'at is only valid inside a free container');
      if(n.gap!==undefined&&!gapNames.includes(n.gap))fail(where,`gap must be one of ${gapNames.join('|')}`);
      if(n.align!==undefined&&!aligns.includes(n.align))fail(where,`align must be one of ${aligns.join('|')}`);
      for(const key of ['fill','color'])if(n[key]!==undefined&&!Object.hasOwn(colors,n[key]))fail(where,`${key} must be a brand color role: ${Object.keys(colors).join(', ')}`);
      if(n.textRole!==undefined&&!Object.hasOwn(roles,n.textRole))fail(where,`textRole must be one of ${Object.keys(roles).join(', ')}`);
      if(n.type==='stack'&&!['row','column'].includes(n.direction))fail(where,'stack needs direction row|column');
      if(n.type==='grid'&&(!Number.isInteger(n.columns)||n.columns<1||n.columns>6))fail(where,'grid needs 1–6 columns');
      if(n.type==='text'&&!str(n.text))fail(where,'provide text');
      if(n.type==='box') {
        if(n.text!==undefined&&n.children!==undefined)fail(where,'a box holds text or children, not both');
        if(n.text!==undefined&&!str(n.text))fail(where,'provide box text');
        if(!Object.hasOwn(shapeKinds,n.shape??'rect'))fail(where,`shape must be one of ${Object.keys(shapeKinds).join('|')}`);
        if(n.children!==undefined){if(n.align!==undefined)fail(where,'align applies to box text, not to a box with children');claim(`${n.id}_group`,where);}
        fills.add(n.fill??'canvasSecondary');
      }
      if(n.type==='icon'&&(!str(n.icon)||n.icon.length>80||!/^[\w.-]+$/.test(n.icon)))fail(where,'icon needs a stable icon ID from the brand icon search');
      if(n.type==='image'){if(!str(n.src)||!str(n.alt))fail(where,'image needs src and alt');if(!['contain','cover'].includes(n.fit??'contain'))fail(where,'fit must be contain|cover');}
      const kids=n.children;
      if(['stack','grid','free'].includes(n.type)||kids!==undefined) {
        if(!Array.isArray(kids)||!kids.length||kids.length>12)fail(where,'provide 1–12 children');
        for(const k of kids)walk(k,depth+1,n.type==='free');
      }
    };
    walk(s.canvas,1,false);
    if(fills.size>maxFills)fail(s.id,`uses ${fills.size} fill colors; the brand allows ${maxFills} per slide`);
    if(s.connect!==undefined&&(!Array.isArray(s.connect)||s.connect.length>40))fail(s.id,'connect must be a list of at most 40 edges');
    for(const c of s.connect??[]) {
      if(!c||typeof c!=='object')fail(s.id,'each edge must be an object');
      if(Object.keys(c).some(k=>!['id','from','to','label','arrow','color'].includes(k)))fail(s.id,'unsupported edge field');
      claim(c.id,`${s.id}/edge`);
      if(!local.has(c.from)||!local.has(c.to)||c.from===c.to)fail(`${s.id}/${c.id}`,'edges connect two distinct nodes on this slide');
      if(c.label!==undefined){if(!str(c.label))fail(`${s.id}/${c.id}`,'provide an edge label or omit it');claim(`${c.id}_label`,`${s.id}/${c.id}`);}
      if(c.color!==undefined&&!Object.hasOwn(colors,c.color))fail(`${s.id}/${c.id}`,'edge color must be a brand color role');
      if(c.arrow!==undefined&&typeof c.arrow!=='boolean')fail(`${s.id}/${c.id}`,'arrow must be boolean');
    }
    summary.push({id:s.id,nodes,fills:[...fills],edges:(s.connect??[]).length});
  }
  return {slides:summary};
}

async function measurer(contract,options) {
  const family=contract.design.fontFamily,fonts={};
  if(options!==undefined&&(!options||typeof options!=='object'||Array.isArray(options)||Object.entries(options).some(([k,v])=>!['regular','bold'].includes(k)||!v?.path||Object.keys(v).some(f=>!['path','sha256'].includes(f)))))throw new Error('Fonts use regular/bold {path,sha256?} records');
  for(const bold of [false,true]){const spec=options?.[bold?'bold':'regular'];fonts[bold]=(await resolveFont(family,{bold,file:spec?.path,expectedHash:spec?.sha256})).font;}
  const exact=Boolean(fonts.false&&fonts.true);
  const height=(value,style,width)=>{
    const font=fonts[style.bold];
    if(font)return measureText(value,{font,fontSize:style.size,width,height:1e6}).requiredHeight;
    const available=Math.max(1,width-7.2),lines=value.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((w,c)=>w+(/[MW@%]/.test(c)?.85:/[il., ']/.test(c)?.27:.53),0)*style.size/available)),0);
    return lines*style.size*1.25+7.2;
  };
  // Natural single-line width including the text insets, for labels that must fit a gap.
  const width=(value,style)=>{
    const font=fonts[style.bold];
    if(font)return measureText(value,{font,fontSize:style.size,width:1e6,height:1e6}).maxWidth+7.2;
    return [...value].reduce((w,c)=>w+(/[MW@%]/.test(c)?.85:/[il., ']/.test(c)?.27:.53),0)*style.size+7.2;
  };
  return {height,width,exact};
}

export async function compileComposition(comp,contract,{fonts}={}) {
  const summary=validateComposition(comp,contract);
  const d=contract.design,sl=d.slides,roles=sl.typography,colors=d.colors,sp=sl.spacing??{},inset=sp.inset??16;
  const gapSize={none:0,tight:inset/2,normal:inset,wide:sp.column??28};
  const bodyRole=contract.medium.delivery==='live'?'body':'bodyReference',measure=await measurer(contract,fonts);
  const iconSize=sl.icon?.size??48;
  const scene={version:2,title:comp.title,mode:'new',canvas:sl.canvas,theme:brandTheme(contract),slides:[]},structure={groups:[],connectors:[],icons:[]};

  const style=n=>roles[n.textRole??bodyRole];
  const flexible=n=>n.type!=='text';
  const gapOf=n=>gapSize[n.gap??'normal'];
  const rowWidths=(n,width)=>{const kids=n.children,total=kids.reduce((a,k)=>a+(k.weight??1),0),usable=width-gapOf(n)*(kids.length-1);return kids.map(k=>usable*(k.weight??1)/total);};
  const need=(n,width)=>{
    if(!(width>7.2))return Infinity; // narrower than the text insets: nothing can be laid out
    if(n.type==='text')return measure.height(n.text,style(n),width);
    if(n.type==='spacer'||n.type==='free')return 0;
    if(n.type==='image')return inset*4;
    if(n.type==='icon')return iconSize;
    if(n.type==='box') {
      if(n.text!==undefined) {
        // Rectangles pad their text by the brand inset; other presets already confine text to an inner area.
        const [,,,fx,fy]=shapeKinds[n.shape??'rect'];
        if(fx===1&&fy===1)return measure.height(n.text,style(n),width-inset*2)+inset*2;
        return fx*width>7.2?measure.height(n.text,style(n),fx*width)/fy:Infinity;
      }
      if(n.children)return need({type:'stack',direction:'column',gap:n.gap,children:n.children},Math.max(1,width-inset*2))+inset*2;
      return inset*2;
    }
    if(n.type==='grid'){const rows=Math.ceil(n.children.length/n.columns),w=(width-gapOf(n)*(n.columns-1))/n.columns;return rows*Math.max(...n.children.map(k=>need(k,w)))+gapOf(n)*(rows-1);}
    if(n.direction==='row'){const widths=rowWidths(n,width);return Math.max(...n.children.map((k,i)=>need(k,widths[i])));}
    return n.children.reduce((a,k)=>a+need(k,width),0)+gapOf(n)*(n.children.length-1);
  };

  for(const s of comp.slides) {
    const elements=[],rects=new Map();
    const put=(element,members)=>{elements.push(element);members?.push(element.id);return element;};
    const short=(n,rect,required)=>!Number.isFinite(required)?fail(`${s.id}/${n.id??n.name??n.type}`,'has no usable room; use fewer siblings, less nesting or larger weights'):fail(`${s.id}/${n.id??n.name??n.type}`,`needs ${round(required)}pt of height but has ${round(rect.height)}pt at ${round(rect.width)}pt wide; shorten the text, split the slide or restructure`);
    const textProps=n=>{const st=style(n);return {fontSize:st.size,bold:st.bold,color:colors[n.color??st.colorRole],...(n.align&&n.align!=='stretch'?{align:{start:'left',center:'center',end:'right'}[n.align]}:{})};};
    const box=r=>({x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)});

    const place=(n,rect,members)=>{
      if(!(rect.width>inset)||!(rect.height>0))fail(`${s.id}/${n.id??n.name??n.type}`,'has no usable room; use fewer siblings, less nesting or larger weights');
      // Leaves and column stacks own the fit check, so the error names the node to fix.
      const checks=!n.children||n.type==='stack'&&n.direction==='column';
      if(checks){const required=need(n,rect.width);if(required>rect.height+.5)short(n,rect,required);}
      if(n.id)rects.set(n.id,rect);
      const own=n.group?[]:members;
      if(n.type==='spacer')return;
      if(n.type==='text'){put({id:n.id,type:'text',...box(rect),text:n.text,...textProps(n)},own);return;}
      if(n.type==='icon') {
        // Icons are copied from the brand library as native geometry at render time, so the scene only reserves a centred square.
        if(rect.width<iconSize-.5)fail(`${s.id}/${n.id}`,`needs ${round(iconSize)}pt of width for an icon but has ${round(rect.width)}pt`);
        const side=Math.min(rect.width,rect.height,iconSize*2),slot={x:rect.x+(rect.width-side)/2,y:rect.y+(rect.height-side)/2,width:side,height:side};
        rects.set(n.id,slot);structure.icons.push({slide:s.id,id:n.id,icon:n.icon,...box(slot)});return;
      }
      if(n.type==='image'){put({id:n.id,type:'image',...box(rect),src:n.src,alt:n.alt,fit:n.fit??'contain'},own);return;}
      if(n.type==='box') {
        const base={id:n.id,type:'shape',...box(rect),shape:n.shape??'rect',fill:colors[n.fill??'canvasSecondary']};
        if(n.text!==undefined){put({...base,text:n.text,...textProps(n)},own);return;}
        const inner=[];put(base,inner);
        if(n.children)place({type:'stack',direction:'column',gap:n.gap,children:n.children,name:n.id},{x:rect.x+inset,y:rect.y+inset,width:rect.width-inset*2,height:rect.height-inset*2},inner);
        if(inner.length>1)structure.groups.push({slide:s.id,id:`${n.id}_group`,members:inner});
        own?.push(...inner);return;
      }
      const g=gapOf(n);
      if(n.type==='free'){for(const k of n.children)place(k,{x:rect.x+k.at.x*rect.width,y:rect.y+k.at.y*rect.height,width:k.at.width*rect.width,height:k.at.height*rect.height},own);}
      else if(n.type==='grid') {
        const rows=Math.ceil(n.children.length/n.columns),w=(rect.width-g*(n.columns-1))/n.columns,h=(rect.height-g*(rows-1))/rows;
        n.children.forEach((k,i)=>place(k,{x:rect.x+(i%n.columns)*(w+g),y:rect.y+Math.floor(i/n.columns)*(h+g),width:w,height:h},own));
      }
      else if(n.direction==='row') {
        const widths=rowWidths(n,rect.width);let x=rect.x;
        n.children.forEach((k,i)=>{
          if(!(widths[i]>inset))fail(`${s.id}/${k.id??k.type}`,'has no usable room; use fewer siblings, less nesting or larger weights');
          const min=need(k,widths[i]);
          if(min>rect.height+.5)short(k,{width:widths[i],height:rect.height},min);
          const h=flexible(k)||(n.align??'stretch')==='stretch'?rect.height:min;
          const y=rect.y+{start:0,stretch:0,center:(rect.height-h)/2,end:rect.height-h}[n.align??'stretch'];
          place(k,{x,y,width:widths[i],height:h},own);x+=widths[i]+g;
        });
      }
      else {
        const kids=n.children,mins=kids.map(k=>need(k,rect.width)),flex=kids.map(flexible),gaps=g*(kids.length-1);
        const fixed=mins.reduce((a,m,i)=>a+(flex[i]?0:m),0),weight=kids.reduce((a,k,i)=>a+(flex[i]?k.weight??1:0),0),pool=rect.height-gaps-fixed;
        let heights=kids.map((k,i)=>flex[i]?pool*(k.weight??1)/weight:mins[i]);
        if(heights.some((h,i)=>h<mins[i]-.5)){const spare=rect.height-gaps-mins.reduce((a,m)=>a+m,0);heights=kids.map((k,i)=>flex[i]?mins[i]+spare*(k.weight??1)/weight:mins[i]);}
        const used=heights.reduce((a,h)=>a+h,0)+gaps;
        let y=rect.y+(weight?0:{start:0,stretch:0,center:(rect.height-used)/2,end:rect.height-used}[n.align??'start']);
        kids.forEach((k,i)=>{place(k,{x:rect.x,y,width:rect.width,height:heights[i]},own);y+=heights[i]+g;});
      }
      if(n.group){if(own.length>1)structure.groups.push({slide:s.id,id:n.id,members:own});members?.push(...own);}
    };

    const title=roles.title,titleNeed=measure.height(s.title,title,sl.titleBox.width);
    if(titleNeed>sl.titleBox.height+.5)fail(`${s.id}/title`,`needs ${round(titleNeed)}pt of height but has ${round(sl.titleBox.height)}pt; shorten the title`);
    put({id:`${s.id}_title`,type:'text',...sl.titleBox,text:s.title,role:'title',fontSize:title.size,bold:title.bold,color:colors[title.colorRole]});
    place(s.canvas,sl.contentBox,null);

    for(const c of s.connect??[]) {
      const a=rects.get(c.from),b=rects.get(c.to),ac={x:a.x+a.width/2,y:a.y+a.height/2},bc={x:b.x+b.width/2,y:b.y+b.height/2};
      const horizontal=Math.abs(bc.x-ac.x)>=Math.abs(bc.y-ac.y);
      const p1=horizontal?{x:bc.x>ac.x?a.x+a.width:a.x,y:ac.y}:{x:ac.x,y:bc.y>ac.y?a.y+a.height:a.y};
      const p2=horizontal?{x:bc.x>ac.x?b.x:b.x+b.width,y:bc.y}:{x:bc.x,y:bc.y>ac.y?b.y:b.y+b.height};
      put({id:c.id,type:'line',x:round(Math.min(p1.x,p2.x)),y:round(Math.min(p1.y,p2.y)),width:round(Math.max(1,Math.abs(p2.x-p1.x))),height:round(Math.max(1,Math.abs(p2.y-p1.y))),color:colors[c.color??'headingPrimary'],weight:2,arrow:c.arrow??true,flipH:p2.x<p1.x,flipV:p2.y<p1.y});
      const record={slide:s.id,id:c.id,from:c.from,to:c.to};
      if(c.label) {
        // The label lives in the gap the line crosses: above a horizontal line, beside a vertical one.
        const st=roles.caption,width=measure.width(c.label,st),height=measure.height(c.label,st,width+1),mid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2};
        const gap=horizontal?Math.abs(p2.x-p1.x):Math.abs(p2.y-p1.y),required=horizontal?width:height,cb=sl.contentBox;
        if(required>gap+.5)fail(`${s.id}/${c.id}`,`label needs ${round(required)}pt but the gap between ${c.from} and ${c.to} is ${round(gap)}pt; put a spacer between them, shorten the label or remove it`);
        const x=horizontal?mid.x-width/2:Math.min(mid.x+4,cb.x+cb.width-width),y=horizontal?Math.max(cb.y,mid.y-height-2):mid.y-height/2;
        put({id:`${c.id}_label`,type:'text',x:round(x),y:round(y),width:round(width),height:round(height),text:c.label,fontSize:st.size,bold:st.bold,color:colors[st.colorRole],align:horizontal?'center':'left'});
        record.label=`${c.id}_label`;
      }
      structure.connectors.push(record);
    }

    scene.slides.push({id:s.id,title:s.title,sources:s.sources,elements,...(s.notes!==undefined?{notes:s.notes}:{}),...(s.intent?{intent:s.intent}:{}),...(s.layoutId?{layoutId:s.layoutId}:{})});
  }
  validateScene(scene);
  return {scene,structure,report:{schema:1,brandRevision:contract.revision,measurement:measure.exact?'exact brand font':'estimated; brand font unavailable',slides:summary.slides}};
}
