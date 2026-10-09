import test from 'node:test';
import assert from 'node:assert/strict';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {validateComposition,composeContract} from '../scripts/lib/compose.mjs';

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
