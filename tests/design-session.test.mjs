import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {proposeDesign,respondDesign,designStatus,getApprovedDesign,requireSceneDesign} from '../scripts/lib/design-session.mjs';
import {compileDeckFile} from '../scripts/lib/deck-plan.mjs';
import {temporary} from './fixtures.mjs';
import {proposal,approveFixture} from './design-fixtures.mjs';
const reply=(state,decision,feedback='SCRIPTED TEST FIXTURE choice')=>({questionId:state.question.id,planRevision:state.revision,decision,feedback});
test('guided questions block construction until actual responses approve every slide',async t=>{
 const project=await temporary(t),plan=proposal(),first=await proposeDesign({project,plan});
 assert.equal(first.buildAllowed,false);assert.equal(first.question.wait,true);assert.deepEqual(first.question.slides,[plan.slides[0].id]);assert.equal(first.slides.length,1);
 await assert.rejects(()=>getApprovedDesign(project),/Awaiting design approval/);
 assert.equal((await designStatus(project)).question.id,first.question.id); // returning from an async question is not a response
 const second=await respondDesign({project,reply:reply(first,'approve')});assert.equal(second.buildAllowed,false);assert.deepEqual(second.question.slides,[plan.slides[1].id]);
 await assert.rejects(()=>respondDesign({project,reply:reply(first,'approve')}),/stale/);
 const approved=await respondDesign({project,reply:reply(second,'approve')});assert.equal(approved.buildAllowed,true);assert.equal(approved.renderedAcceptance,false);assert.equal((await getApprovedDesign(project)).revision,approved.revision);
});
test('batch review is a presentation choice, not approval; missing/default responses cannot advance',async t=>{
 const project=await temporary(t),s=await proposeDesign({project,plan:proposal()});
 const batch=await respondDesign({project,reply:reply(s,'batch')});assert.equal(batch.buildAllowed,false);assert.equal(batch.question.slides.length,2);
 await assert.rejects(()=>respondDesign({project,reply:{...reply(batch,'approve'),feedback:''}}),/actual user response/);
 assert.equal((await respondDesign({project,reply:reply(batch,'approve')})).buildAllowed,true);
});
test('feedback survives revisions; only changed designs lose approval, order/title changes invalidate all',async t=>{
 const project=await temporary(t),plan=proposal();let s=await proposeDesign({project,plan});s=await respondDesign({project,reply:reply(s,'approve')});
 s=await respondDesign({project,reply:reply(s,'revise','SCRIPTED FIXTURE: use a labeled boundary around the replica.')});assert.equal(s.status,'revision requested');assert.equal(s.question,null);assert.equal(s.feedback.length,1);
 await proposeDesign({project,plan,expected:s.revision});await assert.rejects(()=>getApprovedDesign(project),/Awaiting/);
 plan.slides[1].composition+=' Add a labeled serving boundary.';s=await proposeDesign({project,plan,expected:s.revision});assert.deepEqual(s.pending,[plan.slides[1].id]);
 await assert.rejects(()=>proposeDesign({project,plan,expected:'stale'}),/revision changed/);
 s=await respondDesign({project,reply:reply(s,'approve')});assert.equal(s.buildAllowed,true);plan.slides.reverse();s=await proposeDesign({project,plan,expected:s.revision});assert.equal(s.pending.length,2);
});
test('explicit autonomy permits builds while retaining final review unless separately waived',async t=>{
 const project=await temporary(t),s=await approveFixture(project);assert.equal(s.buildAllowed,true);assert.equal(s.mode,'autonomous');assert.equal(s.renderedAcceptance,false);
 const scene={slides:proposal().slides.map(s=>({id:s.id,title:s.title,intent:s.intent}))};await requireSceneDesign(scene,project,s.revision);scene.slides[0].intent.visual.family='text';await assert.rejects(()=>requireSceneDesign(scene,project),/differs/);
});
test('creative compile and scene gates fail before artifact construction; legacy plain scenes remain supported',async t=>{
 const project=await temporary(t);await requireSceneDesign({slides:[{id:'legacy_slide'}]});await assert.rejects(()=>requireSceneDesign({slides:[{intent:{}}]}),/design-project/);
 const plan=proposal(1),file=join(project,'compile.json'),component={kind:'architecture',nodes:[{id:'node_saved',label:'Saved state',tier:0},{id:'node_recover',label:'Recovery',tier:1}],edges:[{from:'node_saved',to:'node_recover',label:'restore'}]};
 await writeFile(file,JSON.stringify({schema:2,title:plan.title,slides:plan.slides.map(s=>({id:s.id,title:s.title,sources:s.sources,intent:s.intent,component}))}));const output=join(project,'compiled');
 await assert.rejects(()=>compileDeckFile({file,output}),/design-project/);await proposeDesign({project,plan});await assert.rejects(()=>compileDeckFile({file,output,'design-project':project}),/Awaiting/);
 const state=await designStatus(project);await respondDesign({project,reply:reply(state,'approve')});await compileDeckFile({file,output,'design-project':project});assert.ok(JSON.parse(await readFile(join(output,'scene.json'))).slides.length);
});
test('design state refuses symlinked storage',async t=>{
 const project=await temporary(t),other=join(project,'other');await mkdir(other);await symlink(other,join(project,'.harness-slides'));await assert.rejects(()=>proposeDesign({project,plan:proposal()}),/real directories/);
});
