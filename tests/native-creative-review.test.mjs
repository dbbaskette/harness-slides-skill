import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {prepareReview,markReview,assessReview} from '../scripts/lib/slide-review.mjs';
import {presentDesign,respondDesign,designStatus} from '../scripts/lib/design-session.mjs';
import {auditNativeReview,assessNativeCritique} from '../scripts/lib/native-quality.mjs';
import {temporary} from './fixtures.mjs';
import {proposal,approveFixture} from './design-fixtures.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
const snapshot=count=>({presentationId:'synthetic_native',revisionId:'r1',pageSize:{width:{magnitude:720,unit:'PT'},height:{magnitude:405,unit:'PT'}},slides:Array.from({length:count},(_,i)=>({objectId:`native_slide_${i}`,pageElements:[{objectId:`native_title_${i}`,size:{width:{magnitude:600,unit:'PT'},height:{magnitude:50,unit:'PT'}},transform:{translateX:30,translateY:20,scaleX:1,scaleY:1,unit:'PT'},shape:{placeholder:{type:'TITLE'},text:{textElements:[{textRun:{content:i===0?'Persistence protects recovery':'Availability protects serving'}}]}}},{objectId:`native_body_${i}`,size:{width:{magnitude:600,unit:'PT'},height:{magnitude:100,unit:'PT'}},transform:{translateX:30,translateY:100,scaleX:1,scaleY:1,unit:'PT'},shape:{text:{textElements:[{textRun:{content:i===0?'Saved state → recovery. Replica is not backup.':'Primary → replica. Failover preserves serving.'}}]}}}]}))});
async function fixture(t,count=2){
 const project=await temporary(t),plan=proposal(count),approved=await approveFixture(project,plan),deck=snapshot(count),image=join(project,'one.png');await writeFile(image,png);
 const manifest={presentationId:deck.presentationId,revision:deck.revisionId,renderer:'Synthetic fixture pixels, not live Google QA',expectedSlideCount:count,slides:deck.slides.map(s=>({id:s.objectId,title:'Fixture',hidden:false,image:'one.png'}))};
 const mapping={schema:1,planRevision:approved.revision,slides:deck.slides.map((s,i)=>({id:s.objectId,planId:plan.slides[i].id}))};
 const paths={previews:join(project,'native.json'),nativeSnapshot:join(project,'snapshot.json'),decisions:join(project,'mapping.json')};for(const [key,value] of [['previews',manifest],['nativeSnapshot',deck],['decisions',mapping]])await writeFile(paths[key],JSON.stringify(value));
 const options={...paths,output:join(project,'review'),designProject:project};return {project,plan,approved,deck,manifest,mapping,options};
}
const assessment=record=>({schema:1,sceneDigest:record.creativeQuality.sceneDigest,qualityRevision:record.creativeQuality.revision,artifactDigest:record.creativeQuality.artifactDigest,slides:record.creativeQuality.prompts.map(s=>({id:s.slide,checks:s.criteria.map(c=>({criterion:c.id,status:'pass',reason:`SCRIPTED FIXTURE: ${s.title}; ${c.id}; objects ${s.objects.join(',')}. Not a pixel/comprehension certification.`,objects:s.objects,sources:s.sources}))}))});
async function readRecord(f){return JSON.parse(await readFile(join(f.options.output,'review.json')));}
test('bulk pixel notes cannot certify native creative review or satisfy the final user checkpoint',async t=>{
 const f=await fixture(t),review=await prepareReview(f.options);const marked=await markReview({output:f.options.output,revision:review.revision,numbers:[1,2],note:'SCRIPTED FIXTURE bulk inspection'});
 assert.equal(marked.visualReviewComplete,true);assert.equal(marked.creativeReviewComplete,false);assert.equal(marked.readyForUserReview,false);
 await assert.rejects(()=>presentDesign({project:f.project,review:f.options.output,revision:review.revision}),/structured creative review/);
 const record=await readRecord(f),a=assessment(record);const checked=await assessReview({output:f.options.output,revision:review.revision,assessment:a});assert.equal(checked.creativeReviewComplete,true);
 let shown=await presentDesign({project:f.project,review:f.options.output,revision:review.revision});assert.equal(shown.renderedAcceptance,false);assert.equal(shown.question.phase,'rendered');
 shown=await respondDesign({project:f.project,reply:{questionId:shown.question.id,planRevision:shown.revision,decision:'approve',feedback:'SCRIPTED FIXTURE rendered acceptance'}});assert.equal(shown.renderedAcceptance,true);
 await writeFile(join(f.options.output,record.slides[0].image),'changed');await assert.rejects(()=>designStatus(f.project),/Preview changed/);
});
test('creative judgments require actual objects, source IDs and distinct slide-specific evidence',async t=>{
 const f=await fixture(t);await prepareReview(f.options);const record=await readRecord(f),a=assessment(record);
 a.slides[1].checks.find(c=>c.criterion==='explanatory-value').reason=a.slides[0].checks.find(c=>c.criterion==='explanatory-value').reason;assert.throws(()=>assessNativeCritique(record.creativeQuality,a),/duplicated bulk/);
 const invalid=assessment(record);invalid.slides[0].checks[0].objects=['invented_object'];assert.throws(()=>assessNativeCritique(record.creativeQuality,invalid),/actual object/);
 const stale=assessment(record);stale.artifactDigest='old';assert.throws(()=>assessNativeCritique(record.creativeQuality,stale),/current quality/);
});
test('complete native text is exposed for pixel comparison; missing rendered heading words remain unresolved',async t=>{
 const f=await fixture(t);await prepareReview(f.options);const record=await readRecord(f),a=assessment(record);assert.ok(record.creativeQuality.prompts[0].expectedText.some(t=>t.text==='Persistence protects recovery'));
 const check=a.slides[0].checks.find(c=>c.criterion==='rendered-text-completeness');check.status='issue';check.reason='SCRIPTED missing-prefix case: image shows only recovery; native_title_0 still contains the whole heading.';
 const result=await assessReview({output:f.options.output,revision:record.revision,assessment:a});assert.equal(result.creativeReviewComplete,false);assert.ok(result.unresolved.some(x=>x.criterion==='rendered-text-completeness'));
});
test('snapshot/revision/order changes and attempts to downgrade creative review are rejected',async t=>{
 const f=await fixture(t);await prepareReview(f.options);await assert.rejects(()=>prepareReview({previews:f.options.previews,output:f.options.output}),/downgraded/);
 f.deck.revisionId='r2';await writeFile(f.options.nativeSnapshot,JSON.stringify(f.deck));const record=await readRecord(f);await assert.rejects(()=>markReview({output:f.options.output,revision:record.revision,numbers:[1],note:'fixture'}),/snapshot changed/);
 await assert.rejects(()=>prepareReview(f.options),/rendered revision/);
 f.deck.revisionId='r1';f.deck.slides.reverse();await writeFile(f.options.nativeSnapshot,JSON.stringify(f.deck));await assert.rejects(()=>prepareReview(f.options),/order differs/);
});
test('selected generated art cannot pass when the actual native image/provenance is absent',async t=>{
 const f=await fixture(t);await prepareReview(f.options);const record=await readRecord(f);f.plan.slides[0].intent.visual.family='generated-art';
 const {digest}=await import('../scripts/lib/common.mjs');f.mapping.planRevision=digest(f.plan);const quality=auditNativeReview({snapshot:f.deck,record,plan:f.plan,mapping:f.mapping});record.creativeQuality=quality;
 const receipt=assessNativeCritique(quality,assessment(record));assert.equal(receipt.complete,false);assert.ok(receipt.unresolved.some(x=>x.detail.includes('Selected asset family')));
});
test('equivalent native geometry across nonadjacent slides asks for explicit repetition judgment',async t=>{
 const f=await fixture(t,3);await prepareReview(f.options);const record=await readRecord(f);assert.equal(record.creativeQuality.deckReview.groups[0].length,3);assert.ok(record.creativeQuality.prompts.every(p=>p.criteria.some(c=>c.id==='repetition-justification')));
});
test('explicit final-review waiver is separate from build autonomy and still requires creative/pixel review',async t=>{
 const project=await temporary(t),plan=proposal(1),approved=await approveFixture(project,plan,{waiveRendered:true}),deck=snapshot(1),output=join(project,'review');await writeFile(join(project,'one.png'),png);
 const manifest={presentationId:deck.presentationId,revision:'r1',renderer:'Synthetic waiver fixture',expectedSlideCount:1,slides:[{id:deck.slides[0].objectId,hidden:false,image:'one.png'}]},mapping={schema:1,planRevision:approved.revision,slides:[{id:deck.slides[0].objectId,planId:plan.slides[0].id}]};
 for(const [name,value] of [['native.json',manifest],['snapshot.json',deck],['mapping.json',mapping]])await writeFile(join(project,name),JSON.stringify(value));
 const review=await prepareReview({output,designProject:project,previews:join(project,'native.json'),nativeSnapshot:join(project,'snapshot.json'),decisions:join(project,'mapping.json')});
 await assert.rejects(()=>presentDesign({project,review:output,revision:review.revision}),/pixel inspection/);
 await markReview({output,revision:review.revision,numbers:[1],note:'SCRIPTED fixture pixel coverage'});const record=JSON.parse(await readFile(join(output,'review.json')));await assessReview({output,revision:review.revision,assessment:assessment(record)});
 const accepted=await presentDesign({project,review:output,revision:review.revision});assert.equal(accepted.renderedAcceptance,true);assert.equal(accepted.status,'rendered user review explicitly waived');
});
test('complete groups expose child labels and field-filtered snapshots cannot silently pass',async t=>{
 const f=await fixture(t,1);await prepareReview(f.options);const record=await readRecord(f);
 f.deck.slides[0].pageElements.push({objectId:'native_group',elementGroup:{children:[{objectId:'native_child',shape:{text:{textElements:[{textRun:{content:'Full nested label'}}]}}}]}});
 let quality=auditNativeReview({snapshot:f.deck,record,plan:f.plan,mapping:f.mapping});assert.ok(quality.prompts[0].expectedText.some(t=>t.object==='native_child'));
 f.deck.slides[0].pageElements.push({objectId:'filtered_table'});assert.throws(()=>auditNativeReview({snapshot:f.deck,record,plan:f.plan,mapping:f.mapping}),/complete native snapshot/);
});
test('stored readiness flags cannot replace missing bound inspection and critique receipts',async t=>{
 const f=await fixture(t,1),review=await prepareReview(f.options),record=await readRecord(f);
 record.visualReviewComplete=true;record.creativeReviewComplete=true;await writeFile(join(f.options.output,'review.json'),JSON.stringify(record));
 await assert.rejects(()=>presentDesign({project:f.project,review:f.options.output,revision:review.revision}),/verified pixel and creative receipts/);
});
