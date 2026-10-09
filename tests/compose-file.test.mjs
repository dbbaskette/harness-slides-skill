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
