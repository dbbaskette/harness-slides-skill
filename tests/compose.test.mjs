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
  const comp=deck({type:'stack',direction:'row',gap:'wide',children:[{type:'box',id:'node_from',text:'A'},{type:'box',id:'node_to',text:'B'}]});
  comp.slides[0].connect=[{id:'edge_ab',from:'node_from',to:'node_to',label:'sends'}];
  const {scene,structure}=await compileComposition(comp,brand()),line=byId(scene,'edge_ab'),a=byId(scene,'node_from'),b=byId(scene,'node_to');
  assert.equal(line.type,'line');assert.equal(line.x,round(a.x+a.width));assert.equal(round(line.x+line.width),b.x);assert.equal(line.arrow,true);assert.equal(line.flipH,false);
  assert.equal(byId(scene,'edge_ab_label').text,'sends');
  assert.deepEqual(structure.connectors,[{slide:'slide_one',id:'edge_ab',from:'node_from',to:'node_to',label:'edge_ab_label'}]);
});
