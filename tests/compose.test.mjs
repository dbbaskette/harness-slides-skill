import test from 'node:test';
import assert from 'node:assert/strict';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {validateComposition,compileComposition,composeContract,composeSizes} from '../scripts/lib/compose.mjs';

function brand(extra={}) {
  const colors={canvasPrimary:'#FFFFFF',canvasSecondary:'#F0F2F5',inkDeep:'#202124',inkSecondary:'#555555',headingPrimary:'#2867B2',accentAqua:'#0091DA'};
  const role=(size,bold=false,colorRole='inkDeep')=>({size,bold,colorRole});
  const c={schema:1,identity:{id:'acme',variant:'light'},medium:{kind:'slides',delivery:'reading'},sources:[{path:'/synthetic/source',sha256:'a'.repeat(64)}],
    design:{fontFamily:'Arial',colors,slides:{canvas:{width:960,height:540},titleBox:{x:48,y:32,width:864,height:66},contentBox:{x:48,y:126,width:864,height:360},reservedBottom:486,
      spacing:{column:30,inset:18},typography:{title:role(28,true,'headingPrimary'),body:role(24),bodyReference:role(20),label:role(20,true),caption:role(14,false,'inkSecondary'),metric:role(64,true,'accentAqua'),quote:role(30)},
      chart:{seriesRoles:['headingPrimary','accentAqua'],axisFontPt:18},table:{headerFillRole:'headingPrimary',headerTextRole:'canvasPrimary',fontPt:20,paddingPt:12},...extra}},
    language:{organization:{toneStatus:'unspecified'},authorVoice:{status:'unselected'}}};
  c.revision=contractRevision(c);return c;
}
const deck=canvas=>({version:1,title:'Test deck',slides:[{id:'slide_one',title:'A title',sources:['brief:test'],canvas}]});

const byId=(scene,id)=>scene.slides[0].elements.find(e=>e.id===id);
const round=n=>Math.round(n*100)/100;

test('contract text names every node type',()=>{for(const word of ['stack','grid','free','box','text','image','spacer'])assert.match(composeContract,new RegExp(word));});

test('validation rejects raw colors, unknown fields, bad edges and too many fills',()=>{
  const c=brand(),bad=canvas=>()=>validateComposition(deck(canvas),c);
  assert.throws(bad({type:'box',id:'raw_color',text:'x',fill:'#FF0000'}),/brand color role/);
  assert.throws(bad({type:'box',id:'extra_key',text:'x',fontSize:9}),/unsupported node field/);
  assert.throws(bad({type:'text',id:'tiny_role',text:'x',textRole:'footnote'}),/textRole must be one of/);
  assert.throws(bad({type:'stack',direction:'row',children:[{type:'box',id:'same_name',text:'a'},{type:'box',id:'same_name',text:'b'}]}),/repeated ID/);
  assert.throws(bad({type:'stack',direction:'row',children:[{type:'box',id:'placed_abs',text:'a',at:{x:0,y:0,width:1,height:1}}]}),/only valid inside a free/);
  const edge=deck({type:'box',id:'only_node',text:'x'});edge.slides[0].connect=[{id:'edge_bad',from:'only_node',to:'missing_node'}];
  assert.throws(()=>validateComposition(edge,c),/two distinct nodes/);
});

test('a slide may use as many fill colors as its content needs',()=>{
  const canvas={type:'grid',columns:3,children:['canvasPrimary','canvasSecondary','headingPrimary','accentAqua','inkDeep'].map((fill,i)=>({type:'box',id:`fill_box${i}`,text:'x',fill}))};
  assert.equal(validateComposition(deck(canvas),brand()).slides[0].fills.length,5);
});

test('row stack divides the content box by weight with the normal gap',async()=>{
  const {scene}=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'left_box',text:'Left',weight:2},{type:'box',id:'right_box',text:'Right'}]}),brand());
  const a=byId(scene,'left_box'),b=byId(scene,'right_box');
  assert.equal(a.x,48);assert.equal(a.width,564);assert.equal(b.x,630);assert.equal(b.width,282);
  assert.equal(a.y,126);assert.equal(a.height,360);assert.equal(a.fill,'#F0F2F5');assert.equal(a.fontSize,20);
});

test('column stack gives text its measured height and boxes the remainder',async()=>{
  const {scene}=await compileComposition(deck({type:'stack',direction:'column',children:[{type:'text',id:'lead_text',text:'One line'},{type:'box',id:'body_box',text:'Body'}]}),brand());
  const t=byId(scene,'lead_text'),b=byId(scene,'body_box');
  assert.ok(t.height>20&&t.height<45);assert.equal(b.y,round(t.y+t.height+18));assert.equal(round(b.y+b.height),486);
});

test('grid places children in equal cells, wrapping rows',async()=>{
  const kids=['alpha','bravo','charl','delta'].map(n=>({type:'box',id:`cell_${n}`,text:n}));
  const {scene}=await compileComposition(deck({type:'grid',columns:2,gap:'tight',children:kids}),brand());
  const [a,b,c,d]=kids.map(k=>byId(scene,k.id));
  assert.equal(a.width,427.5);assert.equal(b.x,484.5);assert.equal(c.y,310.5);assert.equal(d.x,b.x);assert.equal(a.height,175.5);
});

test('free places children by fraction of the parent',async()=>{
  const {scene}=await compileComposition(deck({type:'free',children:[{type:'box',id:'hub_node',text:'Hub',shape:'ellipse',at:{x:.4,y:.3,width:.2,height:.4}}]}),brand());
  assert.deepEqual((({x,y,width,height,shape})=>({x,y,width,height,shape}))(byId(scene,'hub_node')),{x:393.6,y:234,width:172.8,height:144,shape:'ellipse'});
});

test('a box with children becomes a background shape, inset children and a group',async()=>{
  const {scene,structure}=await compileComposition(deck({type:'box',id:'card_main',fill:'canvasSecondary',children:[{type:'text',id:'card_head',text:'Heading',textRole:'label'},{type:'text',id:'card_body',text:'Body'}]}),brand());
  assert.equal(byId(scene,'card_main').type,'shape');assert.equal(byId(scene,'card_head').x,66);assert.equal(byId(scene,'card_head').bold,true);
  assert.deepEqual(structure.groups,[{slide:'slide_one',id:'card_main_group',members:['card_main','card_head','card_body']}]);
});

test('content that cannot fit fails with the shortfall instead of shrinking',async()=>{
  const long='This sentence repeats to overflow its box. '.repeat(40);
  await assert.rejects(()=>compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'long_box',text:long},{type:'box',id:'tiny_box',text:'ok'}]}),brand()),/slide_one\/long_box: needs [\d.]+pt of height but has 360pt/);
});

test('edges become arrow lines between facing sides, with an optional label',async()=>{
  const comp=deck({type:'stack',direction:'row',gap:'none',children:[{type:'box',id:'node_from',text:'A'},{type:'spacer',weight:.5},{type:'box',id:'node_to',text:'B'}]});
  comp.slides[0].connect=[{id:'edge_ab',from:'node_from',to:'node_to',label:'sends'}];
  const {scene,structure}=await compileComposition(comp,brand()),line=byId(scene,'edge_ab'),a=byId(scene,'node_from'),b=byId(scene,'node_to');
  assert.equal(line.type,'line');assert.equal(line.x,round(a.x+a.width));assert.equal(round(line.x+line.width),b.x);assert.equal(line.arrow,true);assert.equal(line.flipH,false);
  assert.equal(byId(scene,'edge_ab_label').text,'sends');
  assert.deepEqual(structure.connectors,[{slide:'slide_one',id:'edge_ab',from:'node_from',to:'node_to',label:'edge_ab_label'}]);
});

const sentence='This sentence repeats to overflow its slot. ';
test('aligned rows still fit-check their text children',async()=>{
  for(const align of ['start','center','end'])await assert.rejects(()=>compileComposition(deck({type:'stack',direction:'row',align,children:[{type:'text',id:'tall_text',text:sentence.repeat(16)},{type:'box',id:'side_box',text:'x'}]}),brand()),/slide_one\/tall_text: needs [\d.]+pt of height but has 360pt/);
});

test('every emitted element stays inside the content box, or the title box for the title',async()=>{
  const comp=deck({type:'stack',direction:'column',children:[{type:'text',id:'lead_text',text:'Lead'},{type:'stack',direction:'row',align:'center',children:[{type:'text',id:'side_text',text:'Short'},{type:'box',id:'main_box',children:[{type:'text',id:'main_head',text:'Head',textRole:'label'},{type:'image',id:'main_art',src:'https://example.com/a.png',alt:'Art'}]}]}]});
  const c=brand(),b=c.design.slides.contentBox,{scene}=await compileComposition(comp,c);
  for(const e of scene.slides[0].elements.filter(e=>e.id!=='slide_one_title')){assert.ok(e.x>=b.x-.01&&e.y>=b.y-.01&&e.x+e.width<=b.x+b.width+.01&&e.y+e.height<=b.y+b.height+.01,`${e.id} leaves the content box`);}
  assert.ok(byId(scene,'main_art').height>=72);
});

test('role names must be own keys of the brand contract',()=>{
  const c=brand(),bad=canvas=>()=>validateComposition(deck(canvas),c);
  assert.throws(bad({type:'box',id:'proto_role',text:'x',textRole:'toString'}),/textRole must be one of/);
  assert.throws(bad({type:'box',id:'proto_fill',text:'x',fill:'constructor'}),/brand color role/);
});

test('a title that cannot fit its box fails',async()=>{
  const comp=deck({type:'box',id:'only_box',text:'x'});comp.slides[0].title='A very long title that keeps going. '.repeat(12);
  await assert.rejects(()=>compileComposition(comp,brand()),/slide_one\/title: needs [\d.]+pt of height but has 66pt/);
});

test('edge labels sit in the gap between nodes and fail when the gap is too small',async()=>{
  const row=gapNode=>{const comp=deck({type:'stack',direction:'row',gap:'none',children:[{type:'box',id:'node_from',text:'A'},...gapNode,{type:'box',id:'node_to',text:'B'}]});comp.slides[0].connect=[{id:'edge_ab',from:'node_from',to:'node_to',label:'sends tokens'}];return comp;};
  const {scene}=await compileComposition(row([{type:'spacer',weight:.5}]),brand()),a=byId(scene,'node_from'),b=byId(scene,'node_to'),label=byId(scene,'edge_ab_label'),line=byId(scene,'edge_ab');
  assert.ok(label.x>=a.x+a.width-.01&&label.x+label.width<=b.x+.01,'label stays between the nodes');
  assert.ok(label.y+label.height<=line.y+.01,'label sits above the line');
  await assert.rejects(()=>compileComposition(row([]),brand()),/slide_one\/edge_ab: label needs [\d.]+pt but the gap between node_from and node_to is 0pt/);
});

test('vertical edges put the label beside the line',async()=>{
  const comp=deck({type:'stack',direction:'column',gap:'none',children:[{type:'box',id:'node_top',text:'A'},{type:'spacer',weight:.6},{type:'box',id:'node_low',text:'B'}]});
  comp.slides[0].connect=[{id:'edge_down',from:'node_top',to:'node_low',label:'then'}];
  const {scene}=await compileComposition(comp,brand()),top=byId(scene,'node_top'),low=byId(scene,'node_low'),label=byId(scene,'edge_down_label'),line=byId(scene,'edge_down');
  assert.equal(line.y,round(top.y+top.height));assert.ok(label.x>=line.x);assert.ok(label.y>=top.y+top.height-.01&&label.y+label.height<=low.y+.01);
});

test('generated IDs are reserved and reported with their node',()=>{
  const c=brand();
  assert.throws(()=>validateComposition(deck({type:'text',id:'slide_one_title',text:'x'}),c),/repeated ID: slide_one_title/);
  assert.throws(()=>validateComposition(deck({type:'stack',direction:'row',id:'card_main_group',group:true,children:[{type:'box',id:'card_main',children:[{type:'text',id:'card_text',text:'x'}]}]}),c),/repeated ID: card_main_group/);
  const edge=deck({type:'stack',direction:'row',children:[{type:'box',id:'node_from',text:'a'},{type:'box',id:'edge_ab_label',text:'b'}]});edge.slides[0].connect=[{id:'edge_ab',from:'node_from',to:'edge_ab_label',label:'x'}];
  assert.throws(()=>validateComposition(edge,c),/repeated ID: edge_ab_label/);
});

test('validation rejects malformed structure with a located message',()=>{
  const c=brand(),bad=canvas=>()=>validateComposition(deck(canvas),c);
  assert.throws(bad({type:'box',id:'card_align',align:'stretch',children:[{type:'text',id:'card_text',text:'x'}]}),/aligns its content start\|center\|end/);
  assert.throws(bad({type:'stack',direction:'row',id:'group_flag',group:'yes',children:[{type:'spacer'}]}),/group must be boolean/);
  const shaped=deck({type:'box',id:'only_box',text:'x'});shaped.slides[0].connect={};assert.throws(()=>validateComposition(shaped,c),/connect must be a list/);
  assert.throws(()=>validateComposition({version:1,title:'t',slides:[null]},c),/each slide must be an object/);
});

test('fit errors name the box, and nesting that leaves no room fails clearly',async()=>{
  await assert.rejects(()=>compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'card_main',children:[{type:'text',id:'card_text',text:sentence.repeat(40)}]},{type:'box',id:'side_box',text:'x'}]}),brand()),/slide_one\/card_text|slide_one\/card_main/);
  const many=(count,n)=>Array.from({length:count},(_,i)=>n(i));
  await assert.rejects(()=>compileComposition(deck({type:'stack',direction:'row',gap:'wide',children:many(12,i=>({type:'stack',direction:'row',gap:'wide',children:many(5,j=>({type:'box',id:`tiny_${i}_${j}`,text:'x'}))}))}),brand()),/has no usable room/);
});

test('fonts use the regular/bold {path,sha256} records the quality audit uses',async()=>{
  const comp=deck({type:'box',id:'only_box',text:'x'});
  await assert.rejects(()=>compileComposition(comp,brand(),{fonts:{regular:{path:'/nonexistent/font.ttf'}}}),/ENOENT|font/i);
  await assert.rejects(()=>compileComposition(comp,brand(),{fonts:{regular:{file:'/x.ttf'}}}),/Fonts use regular\/bold/);
});

test('a group with one member is not recorded',async()=>{
  const {structure}=await compileComposition(deck({type:'stack',direction:'row',id:'lone_group',group:true,children:[{type:'box',id:'only_box',text:'x'}]}),brand());
  assert.deepEqual(structure.groups,[]);
});

test('the wider native shape set compiles and reaches every emitter',async t=>{
  const {shapeKinds}=await import('../scripts/lib/scene.mjs'),{compileGoogleScene}=await import('../scripts/lib/google-slides.mjs'),{renderPptxScene}=await import('../scripts/lib/pptx-render.mjs');
  const {temporary}=await import('./fixtures.mjs'),{join}=await import('node:path'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');
  const names=Object.keys(shapeKinds);assert.deepEqual(names,['rect','ellipse','roundRect','diamond','hexagon','chevron','can']);
  const {scene}=await compileComposition(deck({type:'grid',columns:4,children:names.map(shape=>({type:'box',id:`shape_${shape}`,shape,text:shape}))}),brand());
  assert.deepEqual(scene.slides[0].elements.filter(e=>e.type==='shape').map(e=>e.shape),names);
  const built=compileGoogleScene(scene,{presentationId:'test_deck',revisionId:'r1',pageSize:{width:{magnitude:960,unit:'PT'},height:{magnitude:540,unit:'PT'}},slides:[]});
  assert.deepEqual(built.requests.filter(r=>r.createShape&&r.createShape.shapeType!=='TEXT_BOX').map(r=>r.createShape.shapeType).filter(v=>v!=='RECTANGLE'||true).slice(0,7).sort(),names.map(n=>shapeKinds[n][1]).sort());
  const out=join(await temporary(t),'shapes.pptx');await renderPptxScene(scene,out);
  const {stdout}=await promisify(execFile)('unzip',['-p',out,'ppt/slides/slide1.xml']);
  for(const n of names)assert.match(stdout,new RegExp(`prst="${shapeKinds[n][0]}"`));
  assert.throws(()=>validateComposition(deck({type:'box',id:'star_shape',shape:'star5',text:'x'}),brand()),/shape must be one of/);
});

test('non-rectangular shapes measure text against their smaller inner text area',async()=>{
  const cell=(shape,text)=>deck({type:'grid',columns:4,children:[{type:'box',id:'shape_box',shape,text},{type:'spacer'},{type:'spacer'},{type:'spacer'}]});
  // A 202pt-wide cell: one long word fits a rectangle's 166pt text width but not a diamond's 101pt.
  const word='Observability';
  await compileComposition(cell('rect',word),brand());
  const tall=(await compileComposition(cell('diamond','A diamond holds only a few short words of text'),brand()).catch(e=>e));
  assert.match(String(tall.message??''),/slide_one\/shape_box: needs [\d.]+pt of height but has 360pt/);
  await assert.rejects(()=>compileComposition(deck({type:'grid',columns:6,gap:'wide',children:Array.from({length:6},(_,i)=>({type:'box',id:`tiny_box${i}`,shape:'diamond',text:'Observability and tracing for every service in the fleet'}))}),brand()),/needs [\d.]+pt of height/);
});

test('a card places its content at the top, middle or bottom',async()=>{
  const card=align=>deck({type:'box',id:'card_main',...(align?{align}:{}),children:[{type:'text',id:'card_text',text:'One line'}]});
  const at=async align=>byId((await compileComposition(card(align),brand())).scene,'card_text');
  const [top,middle,bottom]=[await at(),await at('center'),await at('end')];
  // The card fills the 126–486pt content box with an 18pt inset.
  assert.equal(top.y,144);assert.ok(middle.y>top.y+100&&bottom.y>middle.y+100);assert.equal(Math.round(bottom.y+bottom.height+18),486);
});

test('every slide that does not fit is reported in one pass',async()=>{
  const long='This sentence repeats to overflow its box. '.repeat(40),comp={version:1,title:'Deck',slides:['slide_aa','slide_bb','slide_cc'].map((id,i)=>({id,title:'T',sources:['brief:test'],canvas:{type:'box',id:`box_${id}`,text:i===1?'fits':long}}))};
  const error=await compileComposition(comp,brand()).catch(e=>e);
  assert.match(error.message,/^2 problems to fix:/);assert.match(error.message,/slide_aa\/box_slide_aa: needs/);assert.match(error.message,/slide_cc\/box_slide_cc: needs/);assert.doesNotMatch(error.message,/slide_bb/);
});

test('a label on a slanted arrow sits clear of the line and of every node',async()=>{
  const comp=deck({type:'free',children:[{type:'box',id:'node_low',text:'A',at:{x:0,y:.6,width:.25,height:.4}},{type:'box',id:'node_high',text:'B',at:{x:.6,y:0,width:.4,height:.3}}]});
  comp.slides[0].connect=[{id:'edge_up',from:'node_low',to:'node_high',label:'promotes'}];
  const {scene}=await compileComposition(comp,brand()),line=byId(scene,'edge_up'),label=byId(scene,'edge_up_label'),a=byId(scene,'node_low'),b=byId(scene,'node_high');
  const p1={x:line.x,y:line.y+line.height},p2={x:line.x+line.width,y:line.y};assert.equal(line.flipV,true);
  // Distance from each label corner to the line must be positive on one side: all four corners on the same side.
  const side=p=>Math.sign((p2.x-p1.x)*(p.y-p1.y)-(p2.y-p1.y)*(p.x-p1.x)),corners=[[0,0],[1,0],[0,1],[1,1]].map(([u,v])=>side({x:label.x+u*label.width,y:label.y+v*label.height}));
  assert.equal(new Set(corners).size,1);
  for(const n of [a,b])assert.ok(label.x>=n.x+n.width||label.x+label.width<=n.x||label.y>=n.y+n.height||label.y+label.height<=n.y);
});

test('a template layout slide carries a title and subtitle lines and no canvas',async()=>{
  const comp={version:1,title:'Deck',slides:[{id:'cover_slide',title:'A long opening title that would not fit one content title line at all',layout:'Title 1 - dark',subtitle:'For solutions architects',detail:'October 2026',sources:['brief:test']},
    {id:'body_slide',title:'Body',sources:['brief:test'],canvas:{type:'box',id:'body_box',text:'x'}}]};
  const {scene,structure}=await compileComposition(comp,brand());
  assert.deepEqual(structure.layouts,[{slide:'cover_slide',layout:'Title 1 - dark',placeholders:['cover_slide_subtitle','cover_slide_detail']}]);
  assert.deepEqual(scene.slides[0].elements.map(e=>e.id),['cover_slide_title','cover_slide_subtitle','cover_slide_detail']);
  const bad=extra=>()=>validateComposition({version:1,title:'D',slides:[{id:'cover_slide',title:'T',sources:['brief:test'],...extra}]},brand());
  assert.throws(bad({layout:'Cover',canvas:{type:'spacer'}}),/has no canvas, edges, caveat or source/);assert.throws(bad({layout:'Cover',detail:'x'}),/detail needs a subtitle/);
  assert.throws(bad({canvas:{type:'box',id:'only_box',text:'x'},subtitle:'x',detail:'y'}),/detail belongs to a slide with a template layout/);
  assert.throws(bad({layout:'Cover',caveat:'x'}),/has no canvas, edges, caveat or source/);
});

test('a slanted label is placed when its nodes sit inside a named or grouped container, and two labels do not share a spot',async()=>{
  const nodes=[{type:'box',id:'node_low',text:'A',at:{x:0,y:.6,width:.25,height:.4}},{type:'box',id:'node_high',text:'B',at:{x:.6,y:0,width:.4,height:.3}}];
  for(const extra of [{id:'named_area'},{id:'group_area',group:true}]) {
    const comp=deck({type:'free',...extra,children:structuredClone(nodes)});comp.slides[0].connect=[{id:'edge_up',from:'node_low',to:'node_high',label:'promotes'},{id:'edge_back',from:'node_high',to:'node_low',label:'reports'}];
    const {scene}=await compileComposition(comp,brand()),one=byId(scene,'edge_up_label'),two=byId(scene,'edge_back_label');
    assert.ok(one&&two);assert.ok(one.x>=two.x+two.width||two.x>=one.x+one.width||one.y>=two.y+two.height||two.y>=one.y+one.height,'labels overlap');
  }
});

// Deck direction and per-slide brief.
const direction={focal:'headingPrimary',neutral:'canvasSecondary',meanings:{accentAqua:'Valkey'}};
const directed=(canvas,brief,extra={})=>({version:1,title:'Directed deck',direction,slides:[{id:'slide_one',title:'A claim that reads as a sentence',sources:['brief:test'],canvas,...(brief?{brief}:{}),...extra}]});
const pair=(a={},b={})=>({type:'stack',direction:'row',children:[{type:'box',id:'node_a',text:'A',...a},{type:'box',id:'node_b',text:'B',...b}]});

test('a deck direction names its focal, neutral and meaning colors by brand role',()=>{
  const c=brand(),bad=d=>()=>validateComposition({...directed(pair()),direction:d},c);
  validateComposition(directed(pair()),c);
  assert.throws(bad({...direction,focal:'#FF0000'}),/direction\.focal must be a brand color role/);
  assert.throws(bad({...direction,meanings:{notARole:'x'}}),/direction\.meanings uses notARole, which is not a brand color role/);
  assert.throws(bad({...direction,meanings:{accentAqua:''}}),/say what accentAqua means/);
  assert.throws(bad({...direction,meanings:{headingPrimary:'x'}}),/the focal color cannot also carry a meaning/);
  assert.throws(bad({...direction,mood:'bold'}),/unsupported direction field/);
  assert.throws(bad({focal:'headingPrimary'}),/direction needs focal and neutral/);
});

test('with a direction, fills come only from the neutral, the meanings and white, and boxes default to the neutral',async()=>{
  const c=brand(),stray=directed(pair({fill:'inkSecondary'}));
  assert.throws(()=>validateComposition(stray,c),/slide_one\/node_a: fill inkSecondary is not in the deck direction \(canvasSecondary, accentAqua, canvasPrimary\)/);
  const {scene}=await compileComposition(directed(pair({fill:'accentAqua'},{fill:'canvasPrimary'})),c);
  assert.equal(byId(scene,'node_a').fill,'#0091DA');assert.equal(byId(scene,'node_b').fill,'#FFFFFF');
  const other={...directed(pair()),direction:{...direction,neutral:'canvasPrimary'}};
  assert.equal(byId((await compileComposition(other,c)).scene,'node_a').fill,'#FFFFFF');
});

test('the compiler colors the one focal node and refuses a second emphasis',async()=>{
  const c=brand(),{scene,structure}=await compileComposition(directed(pair(),{relation:'contrast',focal:'node_b'}),c);
  assert.equal(byId(scene,'node_b').fill,'#2867B2');assert.equal(byId(scene,'node_b').color,'#FFFFFF');assert.equal(byId(scene,'node_a').fill,'#F0F2F5');assert.equal(byId(scene,'node_a').color,'#202124');
  assert.deepEqual(structure.briefs,[{slide:'slide_one',relation:'contrast',focal:'node_b',rhythm:'dense'}]);assert.deepEqual(structure.direction,direction);
  const bad=(canvas,brief)=>()=>validateComposition(directed(canvas,brief),c);
  assert.throws(bad(pair({fill:'headingPrimary'}),{relation:'contrast',focal:'node_b'}),/slide_one\/node_a: only the focal node may use the focal color/);
  assert.throws(bad(pair({fill:'headingPrimary'})),/slide_one\/node_a: only the focal node may use the focal color; name it in brief\.focal/);
  assert.throws(bad(pair({},{fill:'accentAqua'}),{relation:'contrast',focal:'node_b'}),/slide_one\/node_b: the focal node takes the focal color; remove its fill/);
  assert.throws(bad(pair(),{relation:'contrast',focal:'missing_node'}),/brief\.focal names missing_node, which is not a box or text on this slide/);
});

test('text on a dark fill gets a readable color unless the author chose one',async()=>{
  const c=brand(),{scene}=await compileComposition(deck(pair({fill:'headingPrimary'},{fill:'headingPrimary',color:'inkDeep'})),c);
  assert.equal(byId(scene,'node_a').color,'#FFFFFF');assert.equal(byId(scene,'node_b').color,'#202124');
  const card=deck({type:'box',id:'dark_card',fill:'headingPrimary',children:[{type:'text',id:'card_text',text:'Inside'}]});
  assert.equal(byId((await compileComposition(card,c)).scene,'card_text').color,'#FFFFFF');
});

test('ink gives way to the on-color wherever the on-color reads better',async()=>{
  const c=brand();Object.assign(c.design.colors,{accentPurple:'#6C4B94',accentAzure:'#0098C7',onAccent:'#FFFFFF'});c.revision=contractRevision(c);
  const {scene}=await compileComposition(deck(pair({fill:'accentPurple',textRole:'label'},{fill:'accentAzure',textRole:'label'})),c);
  assert.equal(byId(scene,'node_a').color,'#FFFFFF');assert.equal(byId(scene,'node_b').color,'#202124');
  const plain=(await compileComposition(deck({type:'box',id:'grey_card',children:[{type:'text',id:'grey_note',text:'Note',textRole:'caption'}]}),c)).scene;
  assert.equal(byId(plain,'grey_note').color,'#555555');
});

test('a relation other than none must be drawn',async()=>{
  const c=brand(),ok=(canvas,relation,extra)=>validateComposition(directed(canvas,{relation},extra),c),no=(canvas,relation,pattern,extra)=>assert.throws(()=>ok(canvas,relation,extra),pattern);
  const edge={connect:[{id:'edge_ab',from:'node_a',to:'node_b'}]},column={type:'stack',direction:'column',children:[{type:'box',id:'node_a',text:'A'},{type:'box',id:'node_b',text:'B'}]};
  const words={type:'text',id:'only_text',text:'First this, then that.'},card={type:'box',id:'card_main',children:[{type:'box',id:'member_a',text:'A'},{type:'box',id:'member_b',text:'B'}]};
  no(words,'order',/slide_one: relation "order" is not drawn\. Join nodes with edges, use chevrons in sequence or stack the steps in a column/);ok(pair(),'order',edge);ok(pair({shape:'chevron'},{shape:'chevron'}),'order');
  no(pair(),'dependency',/relation "dependency" is not drawn\. Join the nodes with edges/);ok(pair(),'dependency',edge);
  no(words,'hierarchy',/relation "hierarchy" is not drawn/);ok(column,'hierarchy');ok({type:'box',id:'outer_box',children:[{type:'box',id:'inner_box',text:'x'}]},'hierarchy');
  no(pair(),'membership',/relation "membership" is not drawn\. Put the members inside a box/);ok(card,'membership');
  ok({type:'box',id:'pack_box',children:[{type:'text',id:'pack_name',text:'Bundle'},{type:'grid',columns:2,children:[{type:'box',id:'pack_one',text:'JSON'},{type:'box',id:'pack_two',text:'Search'}]}]},'membership');
  no(column,'contrast',/relation "contrast" is not drawn\. Place the things compared side by side/);ok(pair(),'contrast');
  no(pair(),'quantity',/relation "quantity" is not drawn\. Show the number with the metric text role/);ok({type:'text',id:'big_number',text:'42%',textRole:'metric'},'quantity');
  no(words,'parallel',/relation "parallel" is not drawn\. Place the peers in a grid, a row or a column of like nodes/);ok(pair(),'parallel');ok(column,'parallel');
  ok({type:'stack',direction:'column',children:[0,1,2].map(i=>({type:'stack',direction:'row',children:[{type:'text',id:`peer_name${i}`,text:'Name'},{type:'text',id:`peer_note${i}`,text:'Note'}]}))},'parallel');
  ok(words,'none');assert.throws(()=>ok(words,'sequence'),/brief\.relation must be one of order\|dependency\|hierarchy\|membership\|contrast\|parallel\|overlap\|quantity\|none/);
  assert.throws(()=>validateComposition(directed(words,{relation:'none',rhythm:'busy'}),c),/brief\.rhythm must be one of anchor\|dense\|breathing/);
  const apart={type:'free',children:[{type:'box',id:'node_a',text:'A',shape:'ellipse',at:{x:0,y:0,width:.4,height:.6}},{type:'box',id:'node_b',text:'B',shape:'ellipse',at:{x:.5,y:0,width:.4,height:.6}}]};
  await assert.rejects(()=>compileComposition(directed(apart,{relation:'overlap'}),c),/relation "overlap" is not drawn\. Make two shapes intersect/);
  apart.children[1].at.x=.3;await compileComposition(directed(apart,{relation:'overlap'}),c);
});

test('compositions without a direction or briefs still compile unchanged',async()=>{
  const {scene,structure}=await compileComposition(deck(pair({fill:'inkSecondary'})),brand());
  assert.equal(byId(scene,'node_a').fill,'#555555');assert.equal(structure.direction,null);assert.deepEqual(structure.briefs,[]);
});

test('large accent text keeps its color; only unreadable text is changed',async()=>{
  const c=brand(),{scene}=await compileComposition(deck({type:'stack',direction:'column',children:[{type:'text',id:'big_number',text:'42%',textRole:'metric'},{type:'box',id:'dark_box',fill:'headingPrimary',text:'On blue'}]}),c);
  assert.equal(byId(scene,'big_number').color,'#0091DA');assert.equal(byId(scene,'dark_box').color,'#FFFFFF');
});

test('the focal color cannot leak through text, edges or a color alias',async()=>{
  const c=brand(),bad=(canvas,brief,extra)=>()=>validateComposition(directed(canvas,brief,extra),c);
  assert.throws(bad(pair({color:'headingPrimary'})),/slide_one\/node_a: only the focal node may use the focal color/);
  assert.throws(bad(pair(),undefined,{connect:[{id:'edge_ab',from:'node_a',to:'node_b',color:'headingPrimary'}]}),/slide_one\/edge_ab: an edge cannot use the focal color/);
  const {scene}=await compileComposition(directed(pair(),{relation:'dependency'},{connect:[{id:'edge_ab',from:'node_a',to:'node_b'}]}),c);
  assert.equal(byId(scene,'edge_ab').color,'#555555');
  const alias=brand();alias.design.colors.brandBlue=alias.design.colors.headingPrimary;alias.revision=contractRevision(alias);
  assert.throws(()=>validateComposition({...directed(pair()),direction:{...direction,meanings:{brandBlue:'Us'}}},alias),/direction\.meanings\.brandBlue is the same color as the focal/);
  const image={type:'stack',direction:'row',children:[{type:'image',id:'side_image',src:'a.png',alt:'x'},{type:'box',id:'node_b',text:'B'}]};
  assert.throws(bad(image,{relation:'none',focal:'side_image'}),/brief\.focal names side_image, which is not a box or text on this slide/);
  assert.throws(bad({type:'text',id:'only_text',text:'Words',color:'inkSecondary'},{relation:'none',focal:'only_text'}),/slide_one\/only_text: the focal node takes the focal color; remove its color/);
  const {scene:focalText}=await compileComposition(directed({type:'text',id:'only_text',text:'Words'},{relation:'none',focal:'only_text'}),c);
  assert.equal(byId(focalText,'only_text').color,'#2867B2');
});

test('relations accept the ordinary ways of drawing them and reject look-alikes',()=>{
  const c=brand(),ok=(canvas,relation)=>validateComposition(directed(canvas,{relation}),c),no=(canvas,relation)=>assert.throws(()=>ok(canvas,relation),/is not drawn/);
  const boxes=n=>Array.from({length:n},(_,i)=>({type:'box',id:`item_${i}x`,text:`${i+1}. Step`}));
  ok({type:'stack',direction:'column',children:boxes(3)},'order');
  ok({type:'stack',direction:'row',children:[{type:'text',id:'left_text',text:'Before'},{type:'text',id:'right_text',text:'After'}]},'contrast');
  ok({type:'free',children:boxes(2).map((b,i)=>({...b,at:{x:i*.5,y:0,width:.4,height:.5}}))},'contrast');
  no({type:'grid',columns:1,children:boxes(2)},'contrast');
  ok({type:'box',id:'big_box',text:'42%',textRole:'metric'},'quantity');
  no({type:'box',id:'plain_card',children:[{type:'text',id:'card_head',text:'Heading',textRole:'label'},{type:'text',id:'card_body',text:'Body'}]},'membership');
  ok({type:'box',id:'full_card',children:[{type:'text',id:'card_head',text:'Group'},{type:'text',id:'member_a',text:'A'},{type:'text',id:'member_b',text:'B'}]},'membership');
});

test('the focal color does not count against the fill limit, and a null brief is located',()=>{
  const c=brand(),four={type:'grid',columns:2,children:[{type:'box',id:'node_a',text:'A'},{type:'box',id:'node_b',text:'B',fill:'accentAqua'},{type:'box',id:'node_c',text:'C',fill:'canvasPrimary'},{type:'box',id:'node_d',text:'D'}]};
  validateComposition(directed(four,{relation:'contrast',focal:'node_d'}),c);
  assert.throws(()=>validateComposition({version:1,title:'D',slides:[{id:'cover_slide',title:'T',layout:'Cover',sources:['brief:test'],brief:null}]},c),/cover_slide: a template layout slide takes only brief\.rhythm/);
});

test('the contract can report the brand sizes that decide fit',async()=>{
  const sizes=await composeSizes(brand());
  assert.match(sizes,/Gaps: tight 9, normal 18, wide 30\. A box pads its content by 18 on each side/);
  assert.match(sizes,/The title holds \d line/);assert.match(sizes,/caption [\d.]+/);
});

test('empty boxes take exactly their share, and an overridden weight is reported',async()=>{
  const bars=deck({type:'stack',direction:'column',gap:'none',children:[{type:'box',id:'bar_small',weight:1},{type:'box',id:'bar_large',weight:9}]});
  const exact=await compileComposition(bars,brand());
  assert.equal(byId(exact.scene,'bar_small').height,36);assert.equal(byId(exact.scene,'bar_large').height,324);assert.deepEqual(exact.structure.adjusted,[]);
  bars.slides[0].canvas.children[0].text='A label that needs room';
  const forced=await compileComposition(bars,brand());
  assert.ok(byId(forced.scene,'bar_small').height>36);assert.deepEqual(forced.structure.adjusted.map(a=>[a.slide,a.id,a.asked]),[['slide_one','bar_small',36],['slide_one','bar_large',324]]);
  // Default weights promise nothing, so sharing unequal content is not reported.
  const plain=await compileComposition(deck({type:'stack',direction:'column',children:[{type:'box',id:'tall_box',text:'Line. '.repeat(60)},{type:'box',id:'short_box',text:'x'}]}),brand());
  assert.deepEqual(plain.structure.adjusted,[]);
});

test('a card shaped as a diamond keeps its content inside the diamond text area',async()=>{
  const {scene}=await compileComposition(deck({type:'box',id:'choice_card',shape:'diamond',children:[{type:'text',id:'choice_text',text:'Yes?'}]}),brand());
  const card=byId(scene,'choice_card'),text=byId(scene,'choice_text');
  assert.equal(text.width,round(card.width*.5));assert.equal(text.x,round(card.x+card.width*.25));assert.ok(text.y>=card.y+card.height*.25-.01);
  await assert.rejects(()=>compileComposition(deck({type:'stack',direction:'row',children:[{type:'spacer',weight:6},{type:'box',id:'tiny_choice',shape:'diamond',children:[{type:'text',id:'long_choice',text:'A question that is far too long to sit inside a small diamond shape. '.repeat(3)}]}]}),brand()),/needs [\d.]+pt of height/);
});

test('a column that cannot fit lists what each part needs',async()=>{
  const tall=deck({type:'stack',direction:'column',children:[{type:'text',id:'intro_text',text:'Intro'},{type:'box',id:'main_box',text:'Body line. '.repeat(120)},{type:'text',id:'foot_text',text:'Foot'}]});
  await assert.rejects(()=>compileComposition(tall,brand()),/slide_one\/stack: needs [\d.]+pt of height but has 360pt at 864pt wide \(intro_text [\d.]+ \+ main_box [\d.]+ \+ foot_text [\d.]+, plus 2 gaps of 18\)/);
});

test('a row aligned start, center or end gives boxes the height their content needs',async()=>{
  const row=align=>deck({type:'stack',direction:'row',align,children:[{type:'box',id:'short_box',text:'Short'},{type:'box',id:'tall_box',text:'Line. '.repeat(30)}]});
  const stretched=(await compileComposition(row(),brand())).scene,centred=(await compileComposition(row('center'),brand())).scene;
  assert.equal(byId(stretched,'short_box').height,360);
  const short=byId(centred,'short_box');assert.ok(short.height<100);assert.equal(Math.round(short.y+short.height/2),306);
});

test('an icon carries its color, style and the surface it sits on',async()=>{
  const c=brand({icon:{size:54,library:{path:'/synthetic/icons.pptx',index:'/synthetic/index.json'}}});
  const comp=deck({type:'box',id:'dark_card',fill:'headingPrimary',children:[{type:'icon',id:'card_icon',icon:'fi-x',color:'canvasPrimary',style:'plain'},{type:'icon',id:'disc_icon',icon:'fi-y',color:'accentAqua'}]});
  const {structure}=await compileComposition(comp,c),[plain,disc]=structure.icons;
  assert.deepEqual([plain.color,plain.style,plain.surface],['#FFFFFF','plain','#2867B2']);assert.deepEqual([disc.color,disc.style,disc.glyph],['#0091DA',undefined,'#202124']);
  assert.throws(()=>validateComposition(deck({type:'icon',id:'bad_icon',icon:'fi-x',style:'neon'}),c),/style must be one of solid\|outline\|plain/);
});

test('one compile reports every structure and fit problem on every slide',async()=>{
  const long='This sentence repeats to overflow its box. '.repeat(40);
  const comp={version:1,title:'Deck',slides:[
    {id:'slide_one',title:'T',sources:[],canvas:{type:'stack',direction:'row',children:[{type:'box',id:'heavy_box',text:'a',weight:95},{type:'box',id:'tinted_box',text:'b',fill:'nope'}]}},
    {id:'slide_two',title:'T',sources:['s1'],canvas:{type:'stack',direction:'row',children:[{type:'box',id:'long_left',text:long},{type:'box',id:'long_right',text:long}]}},
    {id:'slide_three',title:'A very long title that keeps going. '.repeat(12),sources:['s1'],canvas:{type:'box',id:'only_box',text:'x',textRole:'missing'}}]};
  const message=await compileComposition(comp,brand()).then(()=>'',e=>e.message),found=message.split('\n');
  assert.equal(found[0],'7 problems to fix:');
  for(const part of [/slide_one: provide source references/,/slide_one\/heavy_box: weight must be above 0 and at most 10/,/slide_one\/tinted_box: fill must be a brand color role/,/slide_three\/only_box: textRole must be one of/,/slide_two\/long_left: needs [\d.]+pt of height but has 360pt at [\d.]+pt wide: the text runs to \d+ lines of 20pt and \d+ fit;/,/slide_two\/long_right: needs/,/slide_three\/title: needs [\d.]+pt of height but has 66pt: it runs to \d+ lines of 28pt and 1 fits; shorten the title/])assert.ok(found.some(line=>part.test(line)),String(part));
});

test('in a row an icon takes its own width and the rest share what is left',async()=>{
  const c=brand({icon:{size:54,library:{path:'/synthetic/icons.pptx',index:'/synthetic/index.json'}}});
  const row=extra=>deck({type:'stack',direction:'row',children:[{type:'icon',id:'lead_icon',icon:'fi-x',...extra},{type:'box',id:'wide_box',text:'Words'},{type:'box',id:'other_box',text:'More'}]});
  const own=await compileComposition(row({}),c);
  assert.equal(own.structure.icons[0].width,54);assert.equal(byId(own.scene,'wide_box').width,round((864-36-54)/2));assert.equal(byId(own.scene,'wide_box').x,round(48+54+18));
  // A weight on the icon opts back into sharing, so it can be drawn larger.
  const shared=await compileComposition(row({weight:1}),c);assert.equal(shared.structure.icons[0].width,108);
  // A row of icons alone still spreads them evenly.
  const alone=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'icon',id:'icon_a',icon:'fi-x'},{type:'icon',id:'icon_b',icon:'fi-y'}]}),c);
  assert.ok(alone.structure.icons[1].x>alone.structure.icons[0].x+200);
});

test('a live deck reports slides whose text was shrunk to the reading size',async()=>{
  const live=brand();live.medium.delivery='live';live.revision=contractRevision(live);
  const slide=role=>deck({type:'stack',direction:'column',children:[{type:'text',id:'line_one',text:'One',textRole:role},{type:'text',id:'line_two',text:'Two',textRole:role},{type:'text',id:'line_cap',text:'Source',textRole:'caption'}]});
  assert.deepEqual((await compileComposition(slide('bodyReference'),live)).structure.reading,[{slide:'slide_one',nodes:['line_one','line_two'],size:20,live:24}]);
  assert.deepEqual((await compileComposition(slide(undefined),live)).structure.reading,[]);
  // A reading deck is meant to be set at that size.
  assert.deepEqual((await compileComposition(slide('bodyReference'),brand())).structure.reading,[]);
});

test('a live deck reports content slides with no speaker notes',async()=>{
  const live=brand();live.medium.delivery='live';live.revision=contractRevision(live);
  const comp={version:1,title:'Deck',slides:[{id:'said_slide',title:'T',sources:['s1'],notes:'Say this.',canvas:{type:'box',id:'said_box',text:'x'}},{id:'mute_slide',title:'T',sources:['s1'],canvas:{type:'box',id:'mute_box',text:'x'}}]};
  assert.deepEqual((await compileComposition(comp,live)).structure.unspoken,['mute_slide']);
  assert.deepEqual((await compileComposition(comp,brand())).structure.unspoken,[]);
});

test('a content slide carries its furniture: a subtitle line, a ruled caveat strip and a source line',async()=>{
  const c=brand(),plain=await compileComposition(deck({type:'box',id:'only_box',text:'x'}),c);
  const comp=deck({type:'box',id:'only_box',text:'x'});Object.assign(comp.slides[0],{subtitle:'Part two of four',caveat:{label:'Limit',text:'No drop-in claim.'},source:'Source: migration guide'});
  const {scene,structure,report}=await compileComposition(comp,c),e=id=>byId(scene,id);
  assert.deepEqual(structure.layouts,[{slide:'slide_one',layout:'@subtitled',placeholders:['slide_one_subtitle']}]);
  // The title keeps one line, the subtitle sits under it, and the content starts below both.
  assert.ok(e('slide_one_title').height<66);assert.equal(e('slide_one_subtitle').y,round(e('slide_one_title').y+e('slide_one_title').height));
  const box=e('only_box'),full=byId(plain.scene,'only_box');
  assert.ok(box.y>=e('slide_one_subtitle').y+e('slide_one_subtitle').height);assert.ok(box.height<full.height);
  // From the foot up: source, caveat with its label, then the rule, then the content.
  const source=e('slide_one_source'),caveat=e('slide_one_caveat'),label=e('slide_one_caveat_label'),rule=e('slide_one_caveat_rule');
  const near=(x,y)=>assert.ok(Math.abs(x-y)<.05,`${x} is not ${y}`);
  near(source.y+source.height,486);near(caveat.y+caveat.height,source.y);assert.equal(label.y,caveat.y);assert.equal(label.bold,true);near(label.x+label.width,caveat.x);
  assert.equal(rule.type,'line');assert.equal(rule.arrow,false);assert.ok(rule.y<caveat.y&&rule.y>=box.y+box.height);
  near(report.room[0].has,box.height);
  // A plain caveat has no label, and the names are reserved.
  const bare=deck({type:'box',id:'only_box',text:'x'});bare.slides[0].caveat='Just a line.';
  assert.ok(!(await compileComposition(bare,c)).scene.slides[0].elements.some(x=>x.id==='slide_one_caveat_label'));
  const clash=deck({type:'box',id:'slide_one_source',text:'x'});clash.slides[0].source='A source';
  assert.throws(()=>validateComposition(clash,c),/invalid or repeated ID: slide_one_source/);
  const bad=extra=>()=>validateComposition((d=>{Object.assign(d.slides[0],extra);return d;})(deck({type:'box',id:'only_box',text:'x'})),c);
  assert.throws(bad({caveat:{label:'A label that is much too long to be a label',text:'x'}}),/caveat is a line of text, or \{label,text\}/);assert.throws(bad({caveat:{note:'x'}}),/caveat is a line of text/);assert.throws(bad({source:''}),/provide source text/);
  await assert.rejects(()=>compileComposition((d=>{d.slides[0].subtitle='This subtitle line keeps going. '.repeat(8);return d;})(deck({type:'box',id:'only_box',text:'x'})),c),/slide_one\/subtitle: runs past one line/);
});

test('a role color the direction has given a job does not leak onto ordinary text',async()=>{
  // The metric role is drawn in accentAqua, which this deck uses to mean one product.
  const c=brand(),dir={focal:'headingPrimary',neutral:'canvasSecondary',meanings:{accentAqua:'the product'}};
  const comp=brief=>({version:1,title:'D',direction:dir,slides:[{id:'slide_one',title:'T',sources:['s1'],brief,canvas:{type:'stack',direction:'row',children:[{type:'text',id:'big_number',text:'42%',textRole:'metric'},{type:'text',id:'its_context',text:'of something'}]}}]});
  assert.equal(byId((await compileComposition(comp({relation:'quantity'}),c)).scene,'big_number').color,'#202124');
  assert.equal(byId((await compileComposition(comp({relation:'quantity',focal:'big_number'}),c)).scene,'big_number').color,'#2867B2');
  // Without a direction the role keeps its own color.
  const free={version:1,title:'D',slides:[{id:'slide_one',title:'T',sources:['s1'],canvas:{type:'text',id:'big_number',text:'42%',textRole:'metric'}}]};
  assert.equal(byId((await compileComposition(free,c)).scene,'big_number').color,'#0091DA');
});

test('a box can be drawn as an outline or as a card with a bar of its color',async()=>{
  const c=brand(),dir={focal:'headingPrimary',neutral:'canvasSecondary',meanings:{accentAqua:'the product'}};
  const slide=(children,brief)=>({version:1,title:'D',direction:dir,slides:[{id:'slide_one',title:'T',sources:['s1'],...(brief?{brief}:{}),canvas:{type:'stack',direction:'row',children}}]});
  const {scene,structure}=await compileComposition(slide([{type:'box',id:'line_box',text:'Outlined',style:'outline'},{type:'box',id:'meaning_box',text:'Product',style:'outline',fill:'accentAqua'},{type:'box',id:'point_box',text:'The point',style:'outline'},{type:'box',id:'bar_box',text:'Barred',style:'bar',fill:'accentAqua'},{type:'box',id:'bar_card',style:'bar',children:[{type:'text',id:'bar_text',text:'Inside'}]}],{relation:'parallel',focal:'point_box'}),c),e=id=>byId(scene,id);
  // An outline has a line and no fill; its text is read against what is behind it.
  assert.deepEqual([e('line_box').fill,e('line_box').stroke,e('line_box').strokeWeight,e('line_box').color],[undefined,'#555555',1.5,'#202124']);
  assert.equal(e('meaning_box').stroke,'#0091DA');assert.deepEqual([e('point_box').stroke,e('point_box').strokeWeight],['#2867B2',3]);
  // A bar card stays neutral and carries its color in a strip, grouped with it.
  assert.equal(e('bar_box').fill,'#F0F2F5');assert.deepEqual([e('bar_box_bar').fill,e('bar_box_bar').width,e('bar_box_bar').x,e('bar_box_bar').height],['#0091DA',6,e('bar_box').x,e('bar_box').height]);
  assert.ok(structure.groups.some(g=>g.id==='bar_box_group'&&g.members.join()==='bar_box,bar_box_bar'));assert.ok(structure.groups.some(g=>g.id==='bar_card_group'&&g.members.join()==='bar_card,bar_card_bar,bar_text'));
  const bad=node=>()=>validateComposition(slide([node,{type:'box',id:'other_box',text:'x'}]),c);
  assert.throws(bad({type:'box',id:'odd_box',text:'x',style:'dotted'}),/style must be one of solid\|outline\|bar/);assert.throws(bad({type:'box',id:'round_bar',text:'x',style:'bar',shape:'ellipse'}),/a bar card is a rectangle/);
  assert.throws(()=>validateComposition(slide([{type:'box',id:'bar_box',text:'x',style:'bar'},{type:'box',id:'bar_box_bar',text:'y'}]),c),/invalid or repeated ID: bar_box_bar/);
});

test('badges, rules and metrics are small fixed parts with their own size',async()=>{
  const c=brand({icon:{size:50}}),col=children=>deck({type:'stack',direction:'column',children});
  const {scene}=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'badge',id:'step_one',text:'1'},{type:'box',id:'step_text',text:'First'},{type:'rule'},{type:'box',id:'more_text',text:'Second'}]}),c),e=id=>byId(scene,id);
  // A badge is a disc 0.6 of the icon size; a rule is a hairline taking half an inset; the boxes share the rest.
  assert.deepEqual([e('step_one').shape,e('step_one').width,e('step_one').height,e('step_one').text,e('step_one').bold,e('step_one').color],['ellipse',30,30,'1',true,'#FFFFFF']);
  const rule=e('slide_one_rule1');assert.deepEqual([rule.type,rule.width,rule.arrow],['line',1,false]);assert.equal(rule.height,360);
  assert.equal(e('step_text').width,e('more_text').width);assert.equal(round(e('step_text').width*2+30+9+18*3),864);
  const stacked=(await compileComposition(col([{type:'text',id:'top_text',text:'Above'},{type:'rule',id:'named_rule'},{type:'text',id:'low_text',text:'Below'}]),c)).scene,across=byId(stacked,'named_rule');
  assert.deepEqual([across.width,across.height],[864,1]);
  // A metric is a number over its label, and can be the point of the slide.
  const dir={focal:'headingPrimary',neutral:'canvasSecondary'},m={version:1,title:'D',direction:dir,slides:[{id:'slide_one',title:'T',sources:['s1'],brief:{relation:'quantity',focal:'big_share'},canvas:{type:'stack',direction:'row',children:[{type:'metric',id:'big_share',value:'42%',label:'of teams'},{type:'box',id:'side_box',text:'x'}]}}]};
  const built=(await compileComposition(m,c)).scene;
  assert.deepEqual([byId(built,'big_share').text,byId(built,'big_share').fontSize,byId(built,'big_share').color,byId(built,'big_share_label').text],['42%',64,'#2867B2','of teams']);
  assert.ok(byId(built,'big_share_label').y>=byId(built,'big_share').y+byId(built,'big_share').height);
  const bad=node=>()=>validateComposition(deck({type:'stack',direction:'row',children:[node,{type:'box',id:'other_box',text:'x'}]}),c);
  assert.throws(bad({type:'badge',id:'long_badge',text:'1234'}),/a badge holds one to three characters/);assert.throws(bad({type:'metric',id:'half_metric',value:'42%'}),/a metric needs an id, a value and a label/);
  assert.throws(()=>validateComposition({version:1,title:'D',direction:dir,slides:[{id:'slide_one',title:'T',sources:['s1'],canvas:{type:'badge',id:'loud_badge',text:'1',fill:'accentAqua'}}]},c),/fill accentAqua is not in the deck direction/);
});
