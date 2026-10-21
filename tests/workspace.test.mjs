import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { initWorkspace, loadWorkspace, saveScene, restoreVersion, buildWorkspace, workspaceStatus, verifiedBuild } from '../scripts/lib/workspace.mjs';
import { install } from '../scripts/install.mjs';
import { startStudio } from '../scripts/lib/studio.mjs';
import { sceneFixture,temporary } from './fixtures.mjs';
test('workspace versions are immutable, restore creates a new version, stale edits fail and builds remain drafts',async t=>{
  const dir=await temporary(t),root=join(dir,'workspace'),scene=await sceneFixture();await initWorkspace({root,scene,format:'pptx',requiredSources:['brief:workflow']});
  const first=await loadWorkspace(root),next=structuredClone(scene);next.slides[0].elements[0].text='A revised title';const second=await saveScene({root,scene:next,expectedDigest:first.current.sceneDigest});assert.equal(second.id,'v000002');
  await assert.rejects(()=>saveScene({root,scene,expectedDigest:first.current.sceneDigest}),/changed/);await restoreVersion({root,id:first.current.id,expectedDigest:second.sceneDigest});assert.equal((await loadWorkspace(root)).current.id,'v000003');
  const result=await buildWorkspace({root});assert.equal(result.status,'unreviewed draft');assert.equal((await workspaceStatus(root)).ready,false);
  await writeFile(join(result.build,'deck.pptx'),'tampered');await assert.rejects(()=>verifiedBuild(root),/changed/);
  assert.equal((await loadWorkspace(root)).versions.length,3);
});
test('redesign retains text and slide structure, while geometry edits are allowed',async t=>{
  const dir=await temporary(t),root=join(dir,'workspace'),scene=await sceneFixture();scene.mode='redesign';await initWorkspace({root,scene,format:'pptx'});const w=await loadWorkspace(root),next=structuredClone(scene);next.slides[0].elements[0].x=55;await saveScene({root,scene:next,expectedDigest:w.current.sceneDigest});
  const current=await loadWorkspace(root);next.slides[0].elements[0].text='Changed content';await assert.rejects(()=>saveScene({root,scene:next,expectedDigest:current.current.sceneDigest}),/retain content/);
});
test('evidence omissions block builds',async t=>{
  const dir=await temporary(t),root=join(dir,'workspace');await initWorkspace({root,scene:await sceneFixture(),format:'pptx',requiredSources:['required:evidence']});await assert.rejects(()=>buildWorkspace({root}),/Missing required evidence/);
});
test('local images become immutable copied inputs and render through the studio',async t=>{
  const dir=await temporary(t),root=join(dir,'workspace'),scene=await sceneFixture(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');await writeFile(join(dir,'asset.png'),png);scene.slides[0].elements.push({id:'input_image',type:'image',src:'asset.png',alt:'Synthetic image',x:80,y:130,width:40,height:40});await initWorkspace({root,scene,format:'pptx',base:dir});const w=await loadWorkspace(root),image=w.scene.slides[0].elements.at(-1);assert.ok(image.src.startsWith('inputs/images/'));assert.equal(scene.slides[0].elements.at(-1).src,'asset.png');const studio=await startStudio({root});t.after(()=>studio.close());const response=await fetch(studio.url+image.src);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
});
test('studio supports object edits and rejects cross-origin, out-of-bounds and stale saves',async t=>{
  const dir=await temporary(t),root=join(dir,'workspace');await initWorkspace({root,scene:await sceneFixture(),format:'pptx'});const studio=await startStudio({root});t.after(()=>studio.close());const base=studio.url.slice(0,-1),origin=new URL(base).origin;
  const state=await(await fetch(base+'/state')).json(),request={id:'story_title',fields:{x:52},expectedDigest:state.current.sceneDigest};
  const post=body=>fetch(base+'/edit',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post(request)).status,200);assert.equal((await post(request)).status,400);
  assert.equal((await fetch(base+'/edit',{method:'POST',headers:{Origin:'https://untrusted.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(origin+'/state')).status,404);
  // Edited words take code spans in backticks, as an author writes them, and lose them when the backticks go.
  const save=async(id,fields)=>{const current=await(await fetch(base+'/state')).json();return post({id,fields,expectedDigest:current.current.sceneDigest});};
  const element=async id=>(await(await fetch(base+'/state')).json()).scene.slides[0].elements.find(e=>e.id===id);
  assert.equal((await save('story_caption',{text:'Set `highAvailability` first'})).status,200);
  const coded=await element('story_caption');assert.equal(coded.text,'Set highAvailability first');assert.deepEqual(coded.code,[[4,20]]);
  assert.equal((await save('story_caption',{text:'Set high availability first'})).status,200);assert.equal((await element('story_caption')).code,undefined);
  // A title is a plain-English claim: a code span in one is refused, as compose and outline refuse it.
  const titled=await save('story_title',{text:'Set `highAvailability` first'});assert.equal(titled.status,400);assert.match((await titled.json()).error,/title is a plain-English claim/);
  // Words the person did not change are left as they are: a legacy scene's literal backticks survive a geometry save.
  assert.equal((await save('story_input',{text:'Press `q` to quit'})).status,200);
  const {saveScene}=await import('../scripts/lib/workspace.mjs'),legacy=structuredClone((await(await fetch(base+'/state')).json()).scene);
  legacy.slides[0].elements.find(e=>e.id==='story_input').text='Press `q` to quit';delete legacy.slides[0].elements.find(e=>e.id==='story_input').code;
  await saveScene({root,scene:legacy,expectedDigest:(await(await fetch(base+'/state')).json()).current.sceneDigest,note:'Legacy words'});
  // The studio shows them escaped (as withCodeTicks writes them) and sends that back with the new geometry.
  assert.equal((await save('story_input',{x:61,text:'Press \\`q\\` to quit'})).status,200);
  const kept=await element('story_input');assert.equal(kept.text,'Press `q` to quit');assert.equal(kept.code,undefined);assert.equal(kept.x,61);
});
test('shared installer links three harnesses to one verified version without replacing unrelated files',async t=>{
  const dir=await temporary(t),home=join(dir,'home'),shared=join(dir,'shared');const plan=await install({home,shared,dryRun:true});assert.equal(plan.targets.length,3);
  const result=await install({home,shared});assert.equal(result.status,'installed');assert.equal((await install({home,shared})).runtime,result.runtime);
  await writeFile(join(result.runtime,'references','authoring.md'),'tampered');await assert.rejects(()=>install({home,shared}),/modified/);
});

test('the installer installs engine packages on request and reports the outcome',async t=>{
  const {mkdir}=await import('node:fs/promises'),dir=await temporary(t),home=join(dir,'home'),shared=join(dir,'shared'),calls=[];
  const run=async(command,args,options)=>{calls.push({command,args,cwd:options.cwd});await mkdir(join(options.cwd,'node_modules'));await writeFile(join(options.cwd,'node_modules','.package-lock.json'),'{}');};
  assert.equal((await install({home,shared})).dependencies,'skipped');
  const first=await install({home,shared,dependencies:true,run});
  assert.equal(first.dependencies,'installed');assert.deepEqual(calls,[{command:'npm',args:['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd:first.runtime}]);
  assert.equal((await install({home,shared,dependencies:true,run})).dependencies,'present');assert.equal(calls.length,1);
  const other=join(dir,'other'),failed=await install({home:join(dir,'home2'),shared:other,dependencies:true,run:async()=>{throw new Error('registry unreachable');}});
  assert.equal(failed.status,'installed');assert.match(failed.dependencies,/^failed: registry unreachable/);assert.match(failed.next,/npm ci --omit=dev --ignore-scripts/);
});
