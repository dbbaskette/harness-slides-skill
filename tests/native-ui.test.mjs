import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { initWorkspace, loadWorkspace, buildWorkspace, workspaceStatus,recordWorkspaceCritique } from '../scripts/lib/workspace.mjs';
import { startStudio } from '../scripts/lib/studio.mjs';
import { prepareReview, markReview } from '../scripts/lib/slide-review.mjs';
import { sceneFixture,temporary } from './fixtures.mjs';
import { renderPptxScene } from '../scripts/lib/pptx-render.mjs';
import { pptxTool } from '../scripts/lib/presentation-tools.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
test('PPTX images preserve editable native image objects with alt text and do not mutate the scene',async t=>{
  const dir=await temporary(t),scene=await sceneFixture();await writeFile(join(dir,'sample.png'),png);scene.slides[0].elements.push({id:'sample_image',type:'image',src:'sample.png',alt:'A synthetic image fixture',x:60,y:130,width:40,height:40});const original=structuredClone(scene);
  const report=await renderPptxScene(scene,join(dir,'image.pptx'),{base:dir});assert.deepEqual(scene,original);assert.ok(report.inventory.slides[0].objects.some(o=>o.type==='pic'&&o.alt==='A synthetic image fixture'));
});
test('real browser selects an object, saves a version, previews updated text and restores history', {skip:process.env.HARNESS_BROWSER_TESTS!=='1'},async t=>{
  const dir=await temporary(t),root=join(dir,'workspace');await initWorkspace({root,scene:await sceneFixture(),format:'pptx'});const studio=await startStudio({root});t.after(()=>studio.close());
  const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(studio.url);
  const frame=page.frameLocator('#preview');await frame.locator('[data-object-id="story_title"]').click();await page.locator('#text').fill('A title changed in the browser');await page.getByRole('button',{name:'Save new version'}).click();await page.locator('#version').filter({hasText:'v000002'}).waitFor();
  assert.equal((await loadWorkspace(root)).scene.slides[0].elements[0].text,'A title changed in the browser');
  await frame.getByText('A title changed in the browser',{exact:true}).waitFor();await page.locator('#history').selectOption('v000001');await page.getByRole('button',{name:'Restore as new version'}).click();await page.locator('#version').filter({hasText:'v000003'}).waitFor();assert.equal((await loadWorkspace(root)).versions.length,3);
});
test('real PPTX render produces complete PNG coverage and binds final review to current artifact', {skip:process.env.HARNESS_RENDER_TESTS!=='1'},async t=>{
  const dir=await temporary(t),root=join(dir,'workspace');await initWorkspace({root,scene:await sceneFixture(),format:'pptx'});const build=await buildWorkspace({root}),output=join(build.build,'review'),review=await prepareReview({file:join(build.build,'deck.pptx'),output});assert.equal(review.slides,2);assert.deepEqual(review.pending,[1,2]);
  const record=JSON.parse(await readFile(review.record));for(const slide of record.slides)assert.ok((await readFile(join(output,slide.image))).length>1000);
  // This records test receipt semantics, not a human visual-quality certification.
  await markReview({output,revision:review.revision,numbers:[1,2],note:'Automated receipt test; manual visual acceptance recorded separately'});assert.equal((await workspaceStatus(root)).ready,false);
  const quality=JSON.parse(await readFile(join(build.build,'quality-report.json')));await recordWorkspaceCritique({root,assessment:{schema:1,sceneDigest:quality.sceneDigest,qualityRevision:quality.revision,artifactDigest:quality.artifactDigest,slides:quality.prompts.map(p=>({id:p.slide,checks:p.criteria.map(c=>({criterion:c.id,status:'pass',reason:'Synthetic receipt behavior test; actual pixels require separate human judgment.',objects:p.objects,sources:p.sources}))}))}});assert.equal((await workspaceStatus(root)).ready,true);
  await writeFile(join(build.build,'deck.pptx'),'changed');assert.equal((await workspaceStatus(root)).ready,false);
});

test('native contain sizing uses actual raster proportions instead of the allocated box ratio',async t=>{
 const dir=await temporary(t),scene=await sceneFixture(),path=new URL('../examples/assets/conceptual-greenhouse.png',import.meta.url).pathname;scene.slides=scene.slides.slice(0,1);scene.slides[0].elements.push({id:'wide_image',type:'image',src:path,alt:'Conceptual illustration',fit:'contain',x:40,y:120,width:200,height:200});const out=join(dir,'wide.pptx');await renderPptxScene(scene,out);const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');const {stdout}=await promisify(execFile)('unzip',['-p',out,'ppt/slides/slide1.xml']);assert.match(stdout,/<a:srcRect l="0" r="0" t="-\d+" b="-\d+"/);
});
