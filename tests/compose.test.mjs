import test from 'node:test';
import assert from 'node:assert/strict';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {validateComposition,compileComposition,composeContract} from '../scripts/lib/compose.mjs';

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
  assert.throws(bad({type:'grid',columns:2,children:['canvasPrimary','canvasSecondary','headingPrimary','accentAqua'].map((fill,i)=>({type:'box',id:`fill_box${i}`,text:'x',fill}))}),/uses 4 fill colors; the brand allows 3/);
  const edge=deck({type:'box',id:'only_node',text:'x'});edge.slides[0].connect=[{id:'edge_bad',from:'only_node',to:'missing_node'}];
  assert.throws(()=>validateComposition(edge,c),/two distinct nodes/);
});

test('the brand can raise the fill limit through constraints',()=>{
  const canvas={type:'grid',columns:2,children:['canvasPrimary','canvasSecondary','headingPrimary','accentAqua'].map((fill,i)=>({type:'box',id:`fill_box${i}`,text:'x',fill}))};
  assert.equal(validateComposition(deck(canvas),brand({constraints:{maxFills:4}})).slides[0].fills.length,4);
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

test('validation counts default fills and rejects malformed structure with a located message',()=>{
  const c=brand(),bad=canvas=>()=>validateComposition(deck(canvas),c);
  assert.throws(bad({type:'grid',columns:2,children:[{type:'box',id:'plain_box',text:'x'},...['canvasPrimary','headingPrimary','accentAqua'].map((fill,i)=>({type:'box',id:`fill_box${i}`,text:'x',fill}))]}),/uses 4 fill colors/);
  assert.throws(bad({type:'box',id:'card_align',align:'center',children:[{type:'text',id:'card_text',text:'x'}]}),/align applies to box text/);
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
