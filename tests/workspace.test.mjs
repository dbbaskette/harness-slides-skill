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
});
test('shared installer links three harnesses to one verified version without replacing unrelated files',async t=>{
  const dir=await temporary(t),home=join(dir,'home'),shared=join(dir,'shared');const plan=await install({home,shared,dryRun:true});assert.equal(plan.targets.length,3);
  const result=await install({home,shared});assert.equal(result.status,'installed');assert.equal((await install({home,shared})).runtime,result.runtime);
  await writeFile(join(result.runtime,'references','authoring.md'),'tampered');await assert.rejects(()=>install({home,shared}),/modified/);
});
