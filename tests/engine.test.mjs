import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { json, digest } from '../scripts/lib/common.mjs';
import { validateScene, renderSceneHtml, coverage } from '../scripts/lib/scene.mjs';
import { renderPptxScene, composePptx } from '../scripts/lib/pptx-render.mjs';
import { pptxTool } from '../scripts/lib/presentation-tools.mjs';
import { compileGoogleScene, applyGoogleScene } from '../scripts/lib/google-slides.mjs';
import { chooseTemplate } from '../scripts/lib/template-routing.mjs';
const exec=promisify(execFile), example=new URL('../examples/scene.json',import.meta.url);
import { sceneFixture, temporary } from './fixtures.mjs';
const deckFixture=()=>({presentationId:'deck_id',revisionId:'rev-1',pageSize:{width:{magnitude:960,unit:'PT'},height:{magnitude:540,unit:'PT'}},slides:[{objectId:'source_slide',pageElements:[{objectId:'source_text',shape:{}},{objectId:'source_logo',image:{}}]}],layouts:[{objectId:'layout_one'}]});
test('scene contract validates bounds, evidence and stable IDs without loading a brand',async()=>{
  const scene=await sceneFixture();validateScene(scene);assert.equal(coverage(scene,['brief:scope']).complete,true);assert.equal(coverage(scene,['missing']).complete,false);
  scene.slides[0].elements[0].text='<script>unsafe</script>';assert.match(renderSceneHtml(scene),/&lt;script&gt;/);
  scene.slides[0].elements[0].x=940;assert.throws(()=>validateScene(scene),/bounds/);
  scene.slides[0].elements[0].x=48;scene.theme={font:'</style><script>'};assert.throws(()=>validateScene(scene),/font family/);
});
test('PPTX scene produces native text, shapes, table cells, notes, chart XML and embedded chart workbook',async t=>{
  const dir=await temporary(t),scene=await json(example),output=join(dir,'deck.pptx');
  const result=await renderPptxScene(scene,output);
  assert.equal(result.slides,3);assert.equal(result.status,'unreviewed draft');
  assert.ok(result.inventory.slides[0].objects.find(o=>o.name==='story_title'&&o.text.includes('scattered input')));
  assert.ok(result.inventory.slides[1].objects.find(o=>o.type==='graphicFrame'&&o.text.includes('Polish')));
  const {stdout:tableXml}=await exec('unzip',['-p',output,'ppt/slides/slide2.xml']);assert.doesNotMatch(tableXml,/anchor="mid"/);assert.match(tableXml,/anchor="ctr"/);
  const parts=Object.keys(result.inventory.parts);assert.ok(parts.some(p=>/^ppt\/charts\/chart\d+\.xml$/.test(p)));assert.ok(parts.some(p=>p.endsWith('.xlsx')));assert.ok(parts.some(p=>p.startsWith('ppt/notesSlides/notesSlide')));
  assert.equal(parts.some(p=>/^ppt\/media\/.+/.test(p)),false);
  await assert.rejects(()=>renderPptxScene(scene,output),/EEXIST/);
});
test('guarded PPTX patch retains unselected parts, shape style/geometry, chart data and notes',async t=>{
  const dir=await temporary(t),scene=await json(example),source=join(dir,'source.pptx'),output=join(dir,'edited.pptx');await renderPptxScene(scene,source);
  const before=await pptxTool('inspect',[source]),slide=before.slides[0],object=slide.objects.find(o=>o.name==='story_title'),plan=join(dir,'patch.json');
  await writeFile(plan,JSON.stringify({sourceSha256:before.sha256,operations:[{slide:slide.id,object:object.id,expectedHash:object.contentHash,text:'A more focused story'}]}));
  const report=await pptxTool('patch',[source,plan,output]);assert.equal(report.preservation.preserved,true);assert.deepEqual(report.preservation.changedParts,[slide.part]);
  const after=await pptxTool('inspect',[output]);assert.equal(after.slides[0].objects.find(o=>o.id===object.id).text,'A more focused story');assert.deepEqual(after.parts['ppt/charts/chart1.xml'],before.parts['ppt/charts/chart1.xml']);
  assert.equal((await pptxTool('compare',[source,output])).preserved,false);
  await assert.rejects(()=>pptxTool('patch',[output,plan,join(dir,'stale.pptx')]),/Source changed/);
  await assert.rejects(()=>pptxTool('patch',[source,plan,source]),/source in place/);
  // Namespace declarations and all unedited bytes in the selected slide survive.
  const {stdout:oldXml}=await exec('unzip',['-p',source,slide.part]);const {stdout:newXml}=await exec('unzip',['-p',output,slide.part]);assert.equal(newXml,oldXml.replace('From scattered input to one coherent story','A more focused story'));
});
test('native template composition retains editable charts and native object text',async t=>{
  const dir=await temporary(t),source=join(dir,'source.pptx'),output=join(dir,'composed.pptx');await renderPptxScene(await json(example),source);
  await composePptx({root:source,sources:[{name:'source',file:source}],slides:[{source:'source',number:3},{source:'source',number:1}],output});
  const d=await pptxTool('inspect',[output]);assert.equal(d.slides.length,2);assert.ok(d.slides[0].objects.some(o=>o.text==='Keep chart data editable'));assert.ok(Object.keys(d.parts).some(p=>p.startsWith('ppt/charts/chart')));
});
test('Google compilation retains existing objects and emits editable table/style requests with required revision',async()=>{
  const scene=await sceneFixture(),deck=deckFixture(),plan=compileGoogleScene(scene,deck);assert.equal(plan.writeControl.requiredRevisionId,'rev-1');assert.equal(plan.requests.some(r=>r.createTable),true);assert.equal(plan.requests.some(r=>r.deleteObject),false);
  assert.ok(plan.requests.filter(r=>r.updateTextStyle).every(r=>r.updateTextStyle.style.fontFamily==='Arial'));
  scene.mode='redesign';const s=scene.slides[0];s.id='source_slide';s.replace=['source_text'];s.protect=['source_logo'];scene.slides=[s];assert.deepEqual(compileGoogleScene(scene,deck).requests.filter(r=>r.deleteObject),[{deleteObject:{objectId:'source_text'}}]);
  s.replace.push('source_logo');assert.throws(()=>compileGoogleScene(scene,deck),/protected/);
});
test('Google refuses to turn editable chart data into an image and refuses stale writes',async()=>{
  const scene=await json(example),deck=deckFixture();delete scene.slides[0].notes;
  assert.throws(()=>compileGoogleScene(scene,deck),/linked Sheets|sheetsChart/);
  scene.slides.pop();let posts=0;const deps={tokenProvider:async()=>'test-token',fetcher:async(url,options)=>{if(options.method==='POST')posts++;return {ok:true,json:async()=>({...deck,revisionId:'changed'})};}};
  await assert.rejects(()=>applyGoogleScene(scene,deck,deps),/changed/);assert.equal(posts,0);
});
test('template routing honors explicit choice and reports ambiguity',()=>{
  const entries=[{id:'one',format:'pptx',useWhen:['launch'],priority:1},{id:'two',format:'pptx',useWhen:['launch'],priority:1}];assert.equal(chooseTemplate(entries,{id:'two',format:'pptx'}).selected.id,'two');assert.equal(chooseTemplate(entries,{query:'launch',format:'pptx'}).selected,null);assert.equal(chooseTemplate(entries,{query:'launch',format:'google-slides'}).candidates.length,0);
});
