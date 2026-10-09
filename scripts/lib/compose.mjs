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
const relations=['order','dependency','hierarchy','membership','contrast','overlap','quantity','none'],rhythms=['anchor','dense','breathing'];
// How each relation must show up in the structure, and what to tell the author when it does not.
const drawn={
  order:[f=>f.edges>0||f.chevrons>1||f.layers,'Join nodes with edges, use chevrons in sequence or stack the steps in a column'],
  dependency:[f=>f.edges>0,'Join the nodes with edges'],
  hierarchy:[f=>f.edges>0||f.nested||f.layers,'Use edges, nested boxes or stacked layers'],
  membership:[f=>f.members,'Put the members inside a box'],
  contrast:[f=>f.pair,'Place the things compared side by side'],
  quantity:[f=>f.metric,'Show the number with the metric text role'],
};
const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
export const contrastRatio=(a,b)=>{const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};

export const composeContract=`Composition v1 (AI-owned; describe structure, never coordinates).
{version:1,title,direction?:DIRECTION,slides:[{id,title,sources:[one or more IDs],canvas:NODE,connect?:[EDGE],brief?:BRIEF,notes?,intent?,layoutId?} | {id,title,sources,layout:TEMPLATE LAYOUT NAME,subtitle?,detail?,notes?}]}
A slide with layout uses that template layout's own placeholders (cover, section break, closing) and has no canvas; run compose layouts for the names.
NODE containers: {type:stack,direction:row|column,gap?,align?,children:[NODE]} | {type:grid,columns:1-6,gap?,children:[NODE]} | {type:free,children:[NODE with at:{x,y,width,height} as 0-1 fractions]}.
NODE leaves: {type:icon,id,icon:STABLE ICON ID from the brand's icon search} | {type:box,id,text?|children?,shape?:rect|ellipse|roundRect|diamond|hexagon|chevron|can,fill?,color?,textRole?,align?} | {type:text,id,text,textRole?,color?,align?} | {type:image,id,src,alt,fit?} | {type:spacer}.
sources name what a slide rests on: a document section, a finding, or one ID such as request or author_knowledge when it comes from the brief or general knowledge.
Any node may set weight (relative share, above 0 up to 10, default 1). A node never goes below the size its content needs, so a small weight can be overridden; check proportions in the render. Containers may set group:true and an id.
gap: none|tight|normal|wide. align: start|center|end|stretch. On a box with children, align (start|center|end) places its content vertically. fill/color: a brand color role name. textRole: a brand typography role name.
EDGE: {id,from:NODE id,to:NODE id,label?,arrow?:boolean,color?}.
DIRECTION, decided once for the deck: {focal:color role that means "look here",neutral:panel color role,meanings?:{color role:what it stands for in this deck},motif?:text}.
With a direction, fills come only from the neutral, the meanings and white; boxes default to the neutral.
BRIEF, per content slide: {relation:order|dependency|hierarchy|membership|contrast|overlap|quantity|none,focal?:NODE id,rhythm?:anchor|dense|breathing}.
The title is the claim. The relation must be drawn: edges, chevrons or a column of steps for order, edges for dependency, edges, nesting or layers for hierarchy, a box holding two or more members for membership, side by side for contrast, intersecting shapes for overlap, the metric text role for quantity.
The focal node is a box or text; the compiler gives it the focal color and no other node, text or edge may use it. Text inside a filled box is given a readable color unless you set one.
A labelled edge needs room: its label must fit the gap between the two nodes, so put a spacer between them.
Generated IDs are reserved: <slide>_title, <slide>_subtitle, <slide>_detail, <box with children>_group, <labelled edge>_label.
A card's align has no effect when it holds a box, grid or image, because those fill the spare space.
IDs match [a-zA-Z_][a-zA-Z0-9_-]{4,40} and are unique across the deck.
Text is measured with the brand font. Content that cannot fit at its role's size fails with the shortfall; rewrite, split or restructure.`;

export function validateComposition(comp,contract) {
  validateBrandContract(contract,{medium:'slides'});
  const d=contract.design,roles=d.slides.typography,colors=d.colors;
  if(comp?.version!==1)throw new Error('Use composition version 1 (run compose contract)');
  if(Object.keys(comp).some(k=>!['version','title','slides','direction'].includes(k)))throw new Error('Unsupported composition field');
  const dir=comp.direction;
  if(dir!==undefined) {
    if(!dir||typeof dir!=='object'||Array.isArray(dir))throw new Error('direction must be an object');
    if(Object.keys(dir).some(k=>!['focal','neutral','meanings','motif'].includes(k)))throw new Error('unsupported direction field');
    if(dir.focal===undefined||dir.neutral===undefined)throw new Error('direction needs focal and neutral color roles');
    for(const key of ['focal','neutral'])if(!Object.hasOwn(colors,dir[key]))throw new Error(`direction.${key} must be a brand color role: ${Object.keys(colors).join(', ')}`);
    if(dir.focal===dir.neutral)throw new Error('direction.focal and direction.neutral must differ');
    if(dir.meanings!==undefined&&(!dir.meanings||typeof dir.meanings!=='object'||Array.isArray(dir.meanings)))throw new Error('direction.meanings maps color roles to what they stand for');
    for(const [role,meaning] of Object.entries(dir.meanings??{})) {
      if(!Object.hasOwn(colors,role))throw new Error(`direction.meanings uses ${role}, which is not a brand color role`);
      if(role===dir.focal)throw new Error('the focal color cannot also carry a meaning');
      if(!str(meaning))throw new Error(`direction.meanings: say what ${role} means`);
      if(colors[role].toUpperCase()===colors[dir.focal].toUpperCase())throw new Error(`direction.meanings.${role} is the same color as the focal; choose a different one`);
    }
    if(colors[dir.neutral].toUpperCase()===colors[dir.focal].toUpperCase())throw new Error('direction.neutral is the same color as the focal; choose a different one');
    if(dir.motif!==undefined&&!str(dir.motif))throw new Error('direction.motif describes one recurring device, or is omitted');
  }
  const allowedFills=dir?[...new Set([dir.neutral,...Object.keys(dir.meanings??{}),...(Object.hasOwn(colors,'canvasPrimary')?['canvasPrimary']:[])])]:null;
  if(!str(comp.title))throw new Error('Provide a deck title');
  if(!Array.isArray(comp.slides)||!comp.slides.length||comp.slides.length>100)throw new Error('Provide 1–100 slides');
  const ids=new Set(),claim=(id,where)=>{if(!idPattern.test(id??'')||ids.has(id))fail(where,`invalid or repeated ID: ${id}`);ids.add(id);};
  const summary=[],invalid=[];
  for(const s of comp.slides) try {
    if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('each slide must be an object');
    if(Object.keys(s).some(k=>!['id','title','sources','canvas','connect','notes','intent','layoutId','layout','subtitle','detail','brief'].includes(k)))fail(s.id,'unsupported slide field');
    claim(s.id,'slide');claim(`${s.id}_title`,s.id);
    if(!str(s.title))fail(s.id,'provide a slide title');
    if(!Array.isArray(s.sources)||!s.sources.length||s.sources.some(x=>!str(x)))fail(s.id,'provide source references');
    const local=new Set(),fills=new Set(),leaves=new Set(),facts={edges:0,chevrons:0,members:false,pair:false,nested:false,layers:false,metric:false},brief=s.brief,focalId=brief?.focal;let nodes=0;
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
      if(dir&&n.color!==undefined){if(n.id===focalId&&n.type==='text')fail(where,'the focal node takes the focal color; remove its color');if(n.color===dir.focal)fail(where,`only the focal node may use the focal color${focalId?'':'; name it in brief.focal'}`);}
      if(n.textRole!==undefined&&!Object.hasOwn(roles,n.textRole))fail(where,`textRole must be one of ${Object.keys(roles).join(', ')}`);
      if(n.type==='stack'&&!['row','column'].includes(n.direction))fail(where,'stack needs direction row|column');
      if(n.type==='grid'&&(!Number.isInteger(n.columns)||n.columns<1||n.columns>6))fail(where,'grid needs 1–6 columns');
      if(n.type==='text'&&!str(n.text))fail(where,'provide text');
      if(n.type==='box') {
        if(n.text!==undefined&&n.children!==undefined)fail(where,'a box holds text or children, not both');
        if(n.text!==undefined&&!str(n.text))fail(where,'provide box text');
        if(!Object.hasOwn(shapeKinds,n.shape??'rect'))fail(where,`shape must be one of ${Object.keys(shapeKinds).join('|')}`);
        if(n.children!==undefined){if(n.align==='stretch')fail(where,'a box with children aligns its content start|center|end');claim(`${n.id}_group`,where);}
        if(n.shape==='chevron')facts.chevrons++;
        // A heading and a body are a card, not a group: membership needs two drawn members, or three or more parts.
        if(n.children!==undefined&&Array.isArray(n.children)){const inside=JSON.stringify(n.children),parts=(inside.match(/"type":"(box|text|icon|image)"/g)??[]).length,solid=(inside.match(/"type":"(box|icon|image)"/g)??[]).length;if(solid>1||parts>2)facts.members=true;if(inside.includes('"type":"box"'))facts.nested=true;}
        if(n.textRole==='metric'&&n.text!==undefined)facts.metric=true;
        // The focal node takes the focal color; every other fill must come from the deck direction.
        if(dir) {
          if(n.id===focalId){if(n.fill!==undefined)fail(where,'the focal node takes the focal color; remove its fill');}
          else if(n.fill===dir.focal)fail(where,`only the focal node may use the focal color${focalId?'':'; name it in brief.focal'}`);
          else if(n.fill!==undefined&&!allowedFills.includes(n.fill))fail(where,`fill ${n.fill} is not in the deck direction (${allowedFills.join(', ')})`);
        }
        fills.add(dir&&n.id===focalId?dir.focal:n.fill??dir?.neutral??'canvasSecondary');
      }
      if(['box','text'].includes(n.type))leaves.add(n.id);
      if(n.type==='text'&&n.textRole==='metric')facts.metric=true;
      // Two or more comparable siblings: side by side they are a pair, in a single column they are layers.
      if(['stack','grid','free'].includes(n.type)&&Array.isArray(n.children)&&n.children.filter(k=>['box','text','stack','grid'].includes(k?.type)).length>1){const column=n.type==='stack'&&n.direction==='column'||n.type==='grid'&&n.columns===1;if(column){if(n.children.filter(k=>k?.type==='box').length>1)facts.layers=true;}else facts.pair=true;}
      if(n.type==='icon'&&(!str(n.icon)||n.icon.length>80||!/^[\w.-]+$/.test(n.icon)))fail(where,'icon needs a stable icon ID from the brand icon search');
      if(n.type==='image'){if(!str(n.src)||!str(n.alt))fail(where,'image needs src and alt');if(!['contain','cover'].includes(n.fit??'contain'))fail(where,'fit must be contain|cover');}
      const kids=n.children;
      if(['stack','grid','free'].includes(n.type)||kids!==undefined) {
        if(!Array.isArray(kids)||!kids.length||kids.length>12)fail(where,'provide 1–12 children');
        for(const k of kids)walk(k,depth+1,n.type==='free');
      }
    };
    if(s.layout!==undefined) {
      // A template layout slide (cover, section break, closing) fills that layout's placeholders and draws nothing else.
      if(!str(s.layout)||s.layout.length>80)fail(s.id,'layout must be a template layout name');
      if(s.canvas!==undefined||s.connect!==undefined)fail(s.id,'a slide with a template layout has no canvas or edges; put content on a standard slide');
      for(const key of ['subtitle','detail'])if(s[key]!==undefined){if(!str(s[key]))fail(s.id,`provide ${key} text or omit it`);claim(`${s.id}_${key}`,s.id);}
      if(s.detail!==undefined&&s.subtitle===undefined)fail(s.id,'detail needs a subtitle before it');
      if(brief!==undefined&&(!brief||typeof brief!=='object'||Object.keys(brief).some(k=>k!=='rhythm')||!rhythms.includes(brief.rhythm)))fail(s.id,'a template layout slide takes only brief.rhythm (anchor|dense|breathing)');
      summary.push({id:s.id,nodes:0,fills:[],edges:0,layout:s.layout});continue;
    }
    if(s.subtitle!==undefined||s.detail!==undefined)fail(s.id,'subtitle and detail belong to a slide with a template layout');
    if(brief!==undefined) {
      if(!brief||typeof brief!=='object'||Array.isArray(brief)||Object.keys(brief).some(k=>!['relation','focal','rhythm'].includes(k)))fail(s.id,'brief takes relation, focal and rhythm');
      if(!relations.includes(brief.relation))fail(s.id,`brief.relation must be one of ${relations.join('|')}`);
      if(brief.rhythm!==undefined&&!rhythms.includes(brief.rhythm))fail(s.id,`brief.rhythm must be one of ${rhythms.join('|')}`);
      if(brief.focal!==undefined&&!dir)fail(s.id,'brief.focal needs a deck direction that names the focal color');
    }
    walk(s.canvas,1,false);
    facts.edges=Array.isArray(s.connect)?s.connect.length:0;
    if(focalId!==undefined&&!leaves.has(focalId))fail(s.id,`brief.focal names ${focalId}, which is not a box or text on this slide`);
    if(brief&&drawn[brief.relation]&&!drawn[brief.relation][0](facts))fail(s.id,`relation "${brief.relation}" is not drawn. ${drawn[brief.relation][1]}, or set the relation to "none" if the words are enough`);
    if(s.connect!==undefined&&(!Array.isArray(s.connect)||s.connect.length>40))fail(s.id,'connect must be a list of at most 40 edges');
    for(const c of s.connect??[]) {
      if(!c||typeof c!=='object')fail(s.id,'each edge must be an object');
      if(Object.keys(c).some(k=>!['id','from','to','label','arrow','color'].includes(k)))fail(s.id,'unsupported edge field');
      claim(c.id,`${s.id}/edge`);
      if(!local.has(c.from)||!local.has(c.to)||c.from===c.to)fail(`${s.id}/${c.id}`,'edges connect two distinct nodes on this slide');
      if(c.label!==undefined){if(!str(c.label))fail(`${s.id}/${c.id}`,'provide an edge label or omit it');claim(`${c.id}_label`,`${s.id}/${c.id}`);}
      if(c.color!==undefined&&!Object.hasOwn(colors,c.color))fail(`${s.id}/${c.id}`,'edge color must be a brand color role');
      if(dir&&c.color===dir.focal)fail(`${s.id}/${c.id}`,'an edge cannot use the focal color; it belongs to the focal node');
      if(c.arrow!==undefined&&typeof c.arrow!=='boolean')fail(`${s.id}/${c.id}`,'arrow must be boolean');
    }
    summary.push({id:s.id,nodes,fills:[...fills],edges:(s.connect??[]).length});
  } catch(error){invalid.push(error.message);}
  // Report every slide that breaks a rule in one pass, so the author fixes them together.
  if(invalid.length)throw new Error(invalid.length===1?invalid[0]:`${invalid.length} problems to fix:\n${invalid.join('\n')}`);
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
  const scene={version:2,title:comp.title,mode:'new',canvas:sl.canvas,theme:brandTheme(contract),slides:[]},structure={groups:[],connectors:[],icons:[],layouts:[],direction:comp.direction??null,briefs:[]},problems=[],dir=comp.direction;

  const style=n=>roles[n.textRole??bodyRole];
  // Text and icons keep their own size; everything else shares the space that is left.
  const flexible=n=>n.type!=='text'&&n.type!=='icon';
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

  for(const s of comp.slides) try {
    const elements=[],rects=new Map(),labels=[],focalId=s.brief?.focal;
    // Text keeps its role color where that is readable on the surface behind it; otherwise it takes the brand's on-color.
    // Plain ink also gives way to the on-color wherever the on-color reads better, so a mid-dark fill gets light text.
    const onColor=colors.onAccent??colors.canvasPrimary,inks=[colors.inkDeep,colors.inkPrimary,colors.inkSecondary].filter(Boolean);
    const ink=(wanted,surface,st)=>{
      if(contrastRatio(wanted,surface)<(st.size>=18||st.bold&&st.size>=14?3:4.5))return [colors.onAccent,colors.canvasPrimary,colors.inkDeep].filter(Boolean).sort((a,b)=>contrastRatio(b,surface)-contrastRatio(a,surface))[0];
      return onColor&&inks.includes(wanted)&&contrastRatio(onColor,surface)>contrastRatio(wanted,surface)?onColor:wanted;
    };
    const fillRole=n=>dir&&n.id===focalId?dir.focal:n.fill??dir?.neutral??'canvasSecondary';
    const put=(element,members)=>{elements.push(element);members?.push(element.id);return element;};
    const short=(n,rect,required)=>!Number.isFinite(required)?fail(`${s.id}/${n.id??n.name??n.type}`,'has no usable room; use fewer siblings, less nesting or larger weights'):fail(`${s.id}/${n.id??n.name??n.type}`,`needs ${round(required)}pt of height but has ${round(rect.height)}pt at ${round(rect.width)}pt wide; shorten the text, split the slide or restructure`);
    const textProps=(n,surface)=>{const st=style(n);return {fontSize:st.size,bold:st.bold,color:n.color?colors[n.color]:dir&&n.id===focalId&&n.type==='text'?colors[dir.focal]:ink(colors[st.colorRole],surface,st),...(n.align&&n.align!=='stretch'?{align:{start:'left',center:'center',end:'right'}[n.align]}:{})};};
    const box=r=>({x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)});

    const place=(n,rect,members,surface=colors.canvasPrimary??'#FFFFFF')=>{
      if(!(rect.width>inset)||!(rect.height>0))fail(`${s.id}/${n.id??n.name??n.type}`,'has no usable room; use fewer siblings, less nesting or larger weights');
      // Leaves and column stacks own the fit check, so the error names the node to fix.
      const checks=!n.children||n.type==='stack'&&n.direction==='column';
      if(checks){const required=need(n,rect.width);if(required>rect.height+.5)short(n,rect,required);}
      if(n.id)rects.set(n.id,rect);
      const own=n.group?[]:members;
      if(n.type==='spacer')return;
      if(n.type==='text'){put({id:n.id,type:'text',...box(rect),text:n.text,...textProps(n,surface)},own);return;}
      if(n.type==='icon') {
        // Icons are copied from the brand library as native geometry at render time, so the scene only reserves a centred square.
        if(rect.width<iconSize-.5)fail(`${s.id}/${n.id}`,`needs ${round(iconSize)}pt of width for an icon but has ${round(rect.width)}pt`);
        if(!sl.icon?.library)fail(`${s.id}/${n.id}`,'uses an icon, but the brand contract names no icon library');
        const side=Math.min(rect.width,rect.height,iconSize*2),slot={x:rect.x+(rect.width-side)/2,y:rect.y+(rect.height-side)/2,width:side,height:side};
        // order is the icon's place in the slide's drawing order, so the emitter can draw and group it with its neighbours.
        rects.set(n.id,slot);structure.icons.push({slide:s.id,id:n.id,icon:n.icon,order:elements.length,...box(slot)});own?.push(n.id);return;
      }
      if(n.type==='image'){put({id:n.id,type:'image',...box(rect),src:n.src,alt:n.alt,fit:n.fit??'contain'},own);return;}
      if(n.type==='box') {
        const base={id:n.id,type:'shape',...box(rect),shape:n.shape??'rect',fill:colors[fillRole(n)]};
        if(n.text!==undefined){put({...base,text:n.text,...textProps(n,base.fill)},own);return;}
        const inner=[];put(base,inner);
        if(n.children)place({type:'stack',direction:'column',gap:n.gap,align:n.align,children:n.children,name:n.id},{x:rect.x+inset,y:rect.y+inset,width:rect.width-inset*2,height:rect.height-inset*2},inner,base.fill);
        if(inner.length>1)structure.groups.push({slide:s.id,id:`${n.id}_group`,members:inner});
        own?.push(...inner);return;
      }
      const g=gapOf(n);
      if(n.type==='free'){for(const k of n.children)place(k,{x:rect.x+k.at.x*rect.width,y:rect.y+k.at.y*rect.height,width:k.at.width*rect.width,height:k.at.height*rect.height},own,surface);}
      else if(n.type==='grid') {
        const rows=Math.ceil(n.children.length/n.columns),w=(rect.width-g*(n.columns-1))/n.columns,h=(rect.height-g*(rows-1))/rows;
        n.children.forEach((k,i)=>place(k,{x:rect.x+(i%n.columns)*(w+g),y:rect.y+Math.floor(i/n.columns)*(h+g),width:w,height:h},own,surface));
      }
      else if(n.direction==='row') {
        const widths=rowWidths(n,rect.width);let x=rect.x;
        n.children.forEach((k,i)=>{
          if(!(widths[i]>inset))fail(`${s.id}/${k.id??k.type}`,'has no usable room; use fewer siblings, less nesting or larger weights');
          const min=need(k,widths[i]);
          if(min>rect.height+.5)short(k,{width:widths[i],height:rect.height},min);
          const h=flexible(k)||(n.align??'stretch')==='stretch'?rect.height:min;
          const y=rect.y+{start:0,stretch:0,center:(rect.height-h)/2,end:rect.height-h}[n.align??'stretch'];
          place(k,{x,y,width:widths[i],height:h},own,surface);x+=widths[i]+g;
        });
      }
      else {
        const kids=n.children,mins=kids.map(k=>need(k,rect.width)),flex=kids.map(flexible),gaps=g*(kids.length-1);
        const fixed=mins.reduce((a,m,i)=>a+(flex[i]?0:m),0),weight=kids.reduce((a,k,i)=>a+(flex[i]?k.weight??1:0),0),pool=rect.height-gaps-fixed;
        let heights=kids.map((k,i)=>flex[i]?pool*(k.weight??1)/weight:mins[i]);
        if(heights.some((h,i)=>h<mins[i]-.5)){const spare=rect.height-gaps-mins.reduce((a,m)=>a+m,0);heights=kids.map((k,i)=>flex[i]?mins[i]+spare*(k.weight??1)/weight:mins[i]);}
        const used=heights.reduce((a,h)=>a+h,0)+gaps;
        let y=rect.y+(weight?0:{start:0,stretch:0,center:(rect.height-used)/2,end:rect.height-used}[n.align??'start']);
        kids.forEach((k,i)=>{place(k,{x:rect.x,y,width:rect.width,height:heights[i]},own,surface);y+=heights[i]+g;});
      }
      if(n.group){if(own.length>1)structure.groups.push({slide:s.id,id:n.id,members:own});members?.push(...own);}
    };

    const title=roles.title,titleNeed=measure.height(s.title,title,sl.titleBox.width);
    if(!s.layout&&titleNeed>sl.titleBox.height+.5)fail(`${s.id}/title`,`needs ${round(titleNeed)}pt of height but has ${round(sl.titleBox.height)}pt; shorten the title`);
    put({id:`${s.id}_title`,type:'text',...sl.titleBox,text:s.title,role:'title',fontSize:title.size,bold:title.bold,color:colors[title.colorRole]});
    if(s.layout) {
      // The native emitter writes these into the layout's subtitle placeholders; the geometry here serves other emitters.
      const placeholders=[],body=roles[bodyRole];let y=sl.contentBox.y;
      for(const key of ['subtitle','detail'])if(s[key]!==undefined){const height=measure.height(s[key],body,sl.contentBox.width);put({id:`${s.id}_${key}`,type:'text',x:sl.contentBox.x,y:round(y),width:sl.contentBox.width,height:round(height),text:s[key],fontSize:body.size,bold:body.bold,color:colors[body.colorRole]});placeholders.push(`${s.id}_${key}`);y+=height+inset;}
      structure.layouts.push({slide:s.id,layout:s.layout,placeholders});
    } else place(s.canvas,sl.contentBox,null);
    if(s.brief?.relation==='overlap') {
      // Overlap is geometric: two shapes must intersect without one simply sitting inside the other.
      const shapes=elements.filter(e=>e.type==='shape'),inside=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height;
      const crossing=shapes.some((a,i)=>shapes.slice(i+1).some(b=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height&&!inside(a,b)&&!inside(b,a)));
      if(!crossing)fail(s.id,'relation "overlap" is not drawn. Make two shapes intersect in a free container, or set the relation to "none" if the words are enough');
    }
    if(s.brief||s.layout)structure.briefs.push({slide:s.id,...(s.brief?.relation?{relation:s.brief.relation}:{}),...(focalId?{focal:focalId}:{}),rhythm:s.brief?.rhythm??(s.layout?'anchor':'dense')});

    for(const c of s.connect??[]) {
      const a=rects.get(c.from),b=rects.get(c.to),ac={x:a.x+a.width/2,y:a.y+a.height/2},bc={x:b.x+b.width/2,y:b.y+b.height/2};
      const horizontal=Math.abs(bc.x-ac.x)>=Math.abs(bc.y-ac.y);
      const p1=horizontal?{x:bc.x>ac.x?a.x+a.width:a.x,y:ac.y}:{x:ac.x,y:bc.y>ac.y?a.y+a.height:a.y};
      const p2=horizontal?{x:bc.x>ac.x?b.x:b.x+b.width,y:bc.y}:{x:bc.x,y:bc.y>ac.y?b.y:b.y+b.height};
      put({id:c.id,type:'line',x:round(Math.min(p1.x,p2.x)),y:round(Math.min(p1.y,p2.y)),width:round(Math.max(1,Math.abs(p2.x-p1.x))),height:round(Math.max(1,Math.abs(p2.y-p1.y))),color:colors[c.color??(dir?(Object.hasOwn(colors,'inkSecondary')?'inkSecondary':'inkDeep'):'headingPrimary')],weight:2,arrow:c.arrow??true,flipH:p2.x<p1.x,flipV:p2.y<p1.y});
      const record={slide:s.id,id:c.id,from:c.from,to:c.to};
      if(c.label) {
        const st=roles.caption,width=measure.width(c.label,st)+1,height=measure.height(c.label,st,width),mid={x:(p1.x+p2.x)/2,y:(p1.y+p2.y)/2},cb=sl.contentBox;
        const dx=p2.x-p1.x,dy=p2.y-p1.y,diagonal=Math.abs(dx)>1&&Math.abs(dy)>1;let x,y,align='center';
        if(!diagonal) {
          // Straight edge: the label lives in the gap the line crosses, above a horizontal line or beside a vertical one.
          const gap=horizontal?Math.abs(dx):Math.abs(dy),required=horizontal?width:height;
          if(required>gap+.5)fail(`${s.id}/${c.id}`,`label needs ${round(required)}pt but the gap between ${c.from} and ${c.to} is ${round(gap)}pt; put a spacer between them, shorten the label or remove it`);
          x=horizontal?mid.x-width/2:Math.min(mid.x+4,cb.x+cb.width-width);y=horizontal?Math.max(cb.y,mid.y-height-2):mid.y-height/2;if(!horizontal)align='left';
        } else {
          // Slanted edge: push the label off the line along its normal, far enough that no corner touches it, on a side clear of every node.
          const length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length,reach=(width*Math.abs(nx)+height*Math.abs(ny))/2+4;
          // A container that holds both ends of the arrow is the surface the label sits on, not an obstacle.
          const holds=(r,n)=>r.x<=n.x+.5&&r.y<=n.y+.5&&r.x+r.width>=n.x+n.width-.5&&r.y+r.height>=n.y+n.height-.5;
          const obstacles=[...[...rects.values()].filter(r=>!(holds(r,a)&&holds(r,b)&&r!==a&&r!==b)),...labels];
          const clear=box=>box.x>=cb.x-.5&&box.y>=cb.y-.5&&box.x+box.width<=cb.x+cb.width+.5&&box.y+box.height<=cb.y+cb.height+.5&&!obstacles.some(r=>box.x<r.x+r.width&&r.x<box.x+box.width&&box.y<r.y+r.height&&r.y<box.y+box.height);
          const spot=[1,-1].map(side=>({x:mid.x+side*nx*reach-width/2,y:mid.y+side*ny*reach-height/2,width,height})).sort((a,b)=>a.y-b.y).find(clear);
          if(!spot)fail(`${s.id}/${c.id}`,'no clear space beside this slanted arrow for its label; shorten the label, move the nodes apart or put the words in a node');
          ({x,y}=spot);
        }
        labels.push({x,y,width,height});
        put({id:`${c.id}_label`,type:'text',x:round(x),y:round(y),width:round(width),height:round(height),text:c.label,fontSize:st.size,bold:st.bold,color:colors[st.colorRole],align});
        record.label=`${c.id}_label`;
      }
      structure.connectors.push(record);
    }

    scene.slides.push({id:s.id,title:s.title,sources:s.sources,elements,...(s.notes!==undefined?{notes:s.notes}:{}),...(s.intent?{intent:s.intent}:{}),...(s.layoutId?{layoutId:s.layoutId}:{})});
  } catch(error){problems.push(error.message.startsWith(`${s.id}`)?error.message:`${s.id}: ${error.message}`);}
  // Report every slide that does not fit in one pass, so the author fixes them together.
  if(problems.length)throw new Error(problems.length===1?problems[0]:`${problems.length} problems to fix:\n${problems.join('\n')}`);
  validateScene(scene);
  return {scene,structure,report:{schema:1,brandRevision:contract.revision,measurement:measure.exact?'exact brand font':'estimated; brand font unavailable',slides:summary.slides}};
}
