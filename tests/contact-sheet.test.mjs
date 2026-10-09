import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {temporary} from './fixtures.mjs';
import {decodePng,encodePng,tile,writeContactSheet} from '../scripts/lib/contact-sheet.mjs';

const solid=(width,height,[r,g,b])=>{const rgb=Buffer.alloc(width*height*3);for(let i=0;i<width*height;i++){rgb[i*3]=r;rgb[i*3+1]=g;rgb[i*3+2]=b;}return {width,height,rgb};};
const pixel=(image,x,y)=>[...image.rgb.subarray((y*image.width+x)*3,(y*image.width+x)*3+3)];

test('a PNG written by the encoder reads back unchanged',()=>{
  const image=solid(7,5,[10,200,30]);image.rgb[3]=99;
  const back=decodePng(encodePng(image));
  assert.deepEqual([back.width,back.height],[7,5]);assert.ok(back.rgb.equals(image.rgb));
  assert.throws(()=>decodePng(Buffer.from('not a png at all')),/Not a PNG/);
});

test('a contact sheet tiles every slide in order and numbers each one',async t=>{
  const dir=await temporary(t),colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,0],[0,255,255]],files=[];
  for(const [n,color] of colors.entries()){const file=join(dir,`thumb-${n}.png`);await writeFile(file,encodePng(solid(80,45,color)));files.push(file);}
  const result=await writeContactSheet(files,join(dir,'sheet.png')),sheet=decodePng(await readFile(result.path));
  // Five slides go three across: two rows, with a gap around each.
  assert.deepEqual([sheet.width,sheet.height,result.slides],[3*80+4*12,2*45+3*12,5]);
  assert.deepEqual(pixel(sheet,12+70,12+40),[255,0,0]);assert.deepEqual(pixel(sheet,12+80+12+70,12+40),[0,255,0]);assert.deepEqual(pixel(sheet,12+70,12+45+12+40),[255,255,0]);
  assert.deepEqual(pixel(sheet,2,2),[136,136,136]);
  // The number stamp is a dark box with light dots in the corner of each slide.
  assert.deepEqual(pixel(sheet,12+1,12+1),[34,34,34]);
  const corner=[];for(let y=0;y<32;y++)for(let x=0;x<24;x++)corner.push(pixel(sheet,12+x,12+y).join());
  assert.ok(corner.includes('255,255,255'));
  assert.throws(()=>tile([solid(4,4,[0,0,0]),solid(5,4,[0,0,0])]),/one size/);assert.throws(()=>tile([]),/No slides/);
  await assert.rejects(()=>writeContactSheet(files,join(dir,'sheet.png')),/EEXIST/);
});
