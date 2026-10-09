import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {temporary} from './fixtures.mjs';
import {validateScene} from '../scripts/lib/scene.mjs';
import {renderPptxScene} from '../scripts/lib/pptx-render.mjs';

const exec=promisify(execFile),cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),example=fileURLToPath(new URL('../examples/composition.json',import.meta.url));

test('compose contract prints the composition format',async()=>{
  const {stdout}=await exec('node',[cli,'compose','contract']);
  assert.match(stdout,/Composition v1/);
});

test('compose compile writes a scene, structure, report and brand contract into a new folder',async t=>{
  const dir=await temporary(t),output=join(dir,'compiled');
  const {stdout}=await exec('node',[cli,'compose','compile','--file',example,'--output',output]);
  const result=JSON.parse(stdout);
  assert.equal(result.slides,1);assert.equal(result.groups,1);assert.equal(result.connectors,2);
  assert.deepEqual((await readdir(output)).sort(),['brand-contract.json','compose-report.json','scene.json','structure.json']);
  const scene=JSON.parse(await readFile(join(output,'scene.json')));
  validateScene(scene);
  const rendered=await renderPptxScene(scene,join(dir,'deck.pptx'));
  assert.equal(rendered.slides,1);assert.equal(rendered.editable,true);
  await assert.rejects(()=>exec('node',[cli,'compose','compile','--file',example,'--output',output]),/EEXIST/);
});

test('compose compile refuses flags that belong to other commands',async()=>{
  await assert.rejects(()=>exec('node',[cli,'compose','compile','--file',example,'--slide','1']),/not valid for this command/);
});

test('compose compile without an output checks the file and writes nothing',async t=>{
  const dir=await temporary(t),{stdout}=await exec('node',[cli,'compose','compile','--file',example],{cwd:dir});
  const result=JSON.parse(stdout);
  assert.match(result.status,/^fits; nothing written/);assert.equal(result.slides,1);assert.equal(result.output,undefined);assert.match(Object.values(result.room)[0],/^[\d.]+ of [\d.]+$/);
  assert.deepEqual(await readdir(dir),[]);
});

test('compose merge joins section files in order and refuses a part that disagrees',async t=>{
  const dir=await temporary(t),{writeFile}=await import('node:fs/promises'),direction={focal:'accent',neutral:'muted'};
  const part=(id,prefix,extra={})=>({version:1,title:'Section',direction,slides:[{id,title:'T',sources:['s1'],canvas:{type:'box',id:`${prefix}_box`,text:'x'}}],...extra});
  const save=(name,value)=>writeFile(join(dir,name),JSON.stringify(value));
  await save('a.json',part('slide_a','sec_a'));await save('b.json',part('slide_b','sec_b'));await save('parts.json',{title:'Whole deck',direction,parts:['a.json','b.json']});
  const {stdout}=await exec('node',[cli,'compose','merge','--file',join(dir,'parts.json'),'--output',join(dir,'composition.json')]);
  assert.deepEqual(JSON.parse(stdout).parts,[{part:'a.json',slides:1},{part:'b.json',slides:1}]);
  const merged=JSON.parse(await readFile(join(dir,'composition.json')));
  assert.equal(merged.title,'Whole deck');assert.deepEqual(merged.direction,direction);assert.deepEqual(merged.slides.map(s=>s.id),['slide_a','slide_b']);
  await save('c.json',part('slide_c','sec_a',{direction:{focal:'muted',neutral:'accent'}}));await save('bad.json',{title:'Whole deck',direction,parts:['a.json','c.json','missing.json']});
  await assert.rejects(()=>exec('node',[cli,'compose','merge','--file',join(dir,'bad.json'),'--output',join(dir,'other.json')]),e=>/3 problems to fix:/.test(e.stderr)&&/c\.json: its direction differs/.test(e.stderr)&&/c\.json: ID sec_a_box is already used in a\.json/.test(e.stderr)&&/missing\.json: cannot be read/.test(e.stderr));
  await assert.rejects(()=>exec('node',[cli,'compose','merge','--file',join(dir,'parts.json'),'--output',join(dir,'composition.json')]),/EEXIST/);
});

test('every gallery example compiles on the neutral brand and draws the relation it is filed under',async()=>{
  const dir=fileURLToPath(new URL('../references/gallery/',import.meta.url)),names=(await readdir(dir)).filter(n=>n.endsWith('.json')).sort(),index=await readFile(fileURLToPath(new URL('../references/gallery.md',import.meta.url)),'utf8');
  assert.deepEqual(names,['contrast','dependency','hierarchy','membership','none','order','overlap','parallel','quantity'].map(n=>`${n}.json`));
  for(const name of names) {
    const {stdout}=await exec('node',[cli,'compose','compile','--file',join(dir,name)]),result=JSON.parse(stdout),comp=JSON.parse(await readFile(join(dir,name)));
    assert.match(result.status,/^fits/,name);assert.equal(result.weightOverridden,undefined,name);
    assert.equal(comp.slides.length,1);assert.equal(comp.slides[0].brief.relation,name.replace('.json',''));assert.ok(comp.slides[0].notes,name);
    assert.ok(index.includes(`(gallery/${name})`),name);
  }
});
