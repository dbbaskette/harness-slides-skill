import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import pptxgen from 'pptxgenjs';
import { pptxTool } from '../scripts/lib/presentation-tools.mjs';
import { temporary } from './fixtures.mjs';

// Three cards that almost line up: the middle one sits 2 pt high and 2 pt tall, and the gaps are 12 and 15 pt.
async function deck(dir,name='deck.pptx'){
  const pptx=new pptxgen();pptx.defineLayout({name:'wide',width:960/72,height:540/72});pptx.layout='wide';
  const slide=pptx.addSlide(),inch=v=>v/72;
  slide.addText('A title for the slide',{x:inch(36),y:inch(36),w:inch(888),h:inch(35),fontSize:32,margin:0});
  [[36,140,250],[298,138,252],[563,140,250]].forEach(([x,y,h],i)=>{
    slide.addShape(pptx.ShapeType.rect,{x:inch(x),y:inch(y),w:inch(250),h:inch(h),fill:{color:'EEEEEE'}});
    slide.addText('Card '+(i+1),{x:inch(x+12),y:inch(y+12),w:inch(200),h:inch(24),fontSize:14,margin:0,valign:'top'});
  });
  // A small badge pair that must not be treated as peers of anything.
  slide.addShape(pptx.ShapeType.ellipse,{x:inch(40),y:inch(420),w:inch(20),h:inch(20),fill:{color:'005C8A'}});
  slide.addShape(pptx.ShapeType.ellipse,{x:inch(80),y:inch(421),w:inch(20),h:inch(20),fill:{color:'005C8A'}});
  const file=join(dir,name);await pptx.writeFile({fileName:file});return file;
}
const boxes=async file=>(await pptxTool('inspect',[file])).slides[0].objects.map(o=>({text:o.text,box:o.box.map(v=>Math.round(v/1270)/10)}));

test('alignment audit reports near-misses without writing, then settles them and keeps content',async t=>{
  const dir=await temporary(t),source=await deck(dir),output=join(dir,'settled.pptx');
  const audit=await pptxTool('align',[source,JSON.stringify({})]);
  assert.equal(audit.applied,false);assert.equal(audit.slides.length,1);
  const kinds=audit.slides[0].fixes.map(f=>f.change);
  assert.ok(kinds.includes('top edge matched to its row'));assert.ok(kinds.includes('height matched to its row'));assert.ok(kinds.includes('spacing along its row made even'));
  const result=await pptxTool('align',[source,JSON.stringify({output})]);
  assert.equal(result.applied,true);assert.deepEqual(result.changedParts,['ppt/slides/slide1.xml']);
  const before=await boxes(source),after=await boxes(output);
  assert.deepEqual(after.map(o=>o.text),before.map(o=>o.text));
  const cards=after.filter(o=>!o.text&&o.box[2]===250);
  assert.deepEqual(cards.map(c=>c.box[1]),[140,140,140]);assert.deepEqual(cards.map(c=>c.box[3]),[250,250,250]);
  assert.deepEqual(cards.map(c=>c.box[0]),[36,299.5,563]);
  // The label drawn inside the moved card moved with it; the badges and the title did not move.
  const label=o=>after.find(x=>x.text===o).box,was=o=>before.find(x=>x.text===o).box;
  assert.deepEqual(label('Card 2'),[was('Card 2')[0]+1.5,was('Card 2')[1]+2,200,24]);
  assert.deepEqual(label('A title for the slide'),was('A title for the slide'));
  assert.deepEqual(after.filter(o=>o.box[2]===20).map(o=>o.box[1]),[420,421]);
  // Settled decks have nothing left to settle, and the source is never overwritten.
  assert.equal((await pptxTool('align',[output,JSON.stringify({})])).fixes,0);
  await assert.rejects(()=>pptxTool('align',[source,JSON.stringify({output:source})]),/in place/);
  await assert.rejects(()=>pptxTool('align',[source,JSON.stringify({output})]),/Output exists/);
});

test('change summary lists what moved on each slide and what did not change',async t=>{
  const dir=await temporary(t),source=await deck(dir),output=join(dir,'settled.pptx'),summary=join(dir,'changes.md');
  await pptxTool('align',[source,JSON.stringify({output})]);
  const result=await pptxTool('changes',[source,output,summary]);
  assert.equal(result.slides.length,1);assert.equal(result.slides[0].number,1);
  assert.equal(result.slides[0].counts.moved,2);assert.equal(result.slides[0].counts.resized,1);
  assert.equal(result.slides[0].counts.reworded,undefined);assert.equal(result.slides[0].counts.restyled,undefined);
  const text=await readFile(summary,'utf8');assert.match(text,/\| 1 \| 2 moved, by up to 2\.0 pt/);assert.match(text,/'Card 2'/);
  const same=await pptxTool('changes',[source,source]);assert.deepEqual(same.slides,[]);assert.deepEqual(same.unchanged,[1]);
});
