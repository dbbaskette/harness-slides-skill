// Design-bound creative review of a composition: review renders the compiled build itself, so the receipts bind the
// reviewed deck, the approved design revision and the asset copies, and the existing criteria judge whether each visual teaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeDesign,respondDesign,presentDesign,designStatus} from '../scripts/lib/design-session.mjs';
import {compileCompositionFile} from '../scripts/lib/compose-file.mjs';
import {prepareReview,markReview,assessReview,inspectReview,verifyReview} from '../scripts/lib/slide-review.mjs';
import {problemsOf} from '../scripts/lib/refusals.mjs';
import {temporary} from './fixtures.mjs';

const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),fixture=fileURLToPath(new URL('fixtures/visual-contract/',import.meta.url));
const read=async name=>JSON.parse(await readFile(join(fixture,name),'utf8'));
const run=args=>new Promise(done=>execFile(process.execPath,[cli,...args],{timeout:120000},(error,stdout,stderr)=>done({code:error?error.code??1:0,stdout,stderr})));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
// Synthetic pixels stand in for LibreOffice: these tests cover state and judgement, not layout.
const pixels=(count)=>async({output,selected})=>{for(const n of selected)await writeFile(join(output,`page-${n}.png`),Buffer.concat([png,Buffer.from(`slide ${n}`)]));return {count,image:n=>join(output,`page-${n}.png`)};};
const codeOf=async promise=>{try{await promise;}catch(error){return problemsOf(error)[0].code;}assert.fail('expected a refusal');};

async function approve(project,plan){
  const proposed=await proposeDesign({project,plan,mode:'batch'});
  return respondDesign({project,reply:{questionId:proposed.question.id,planRevision:proposed.revision,decision:'approve',feedback:'Approve the whole plan'}});
}
// The contract proposal, approved, and one composition of it compiled against that approval.
async function built(t,composition='composition.json'){
  const project=await temporary(t),plan=await read('proposal.json');await approve(project,plan);
  const compiled=join(project,'compiled');await compileCompositionFile({file:join(fixture,composition),'design-project':project,output:compiled});
  const options={compiled,output:join(project,'review'),designProject:project,signature:async()=>'fixture',render:pixels(plan.slides.length)};
  return {project,plan,compiled,options};
}
const record=async f=>JSON.parse(await readFile(join(f.options.output,'review.json'),'utf8'));
// A complete assessment that passes every criterion with slide-specific reasons; override picks out checks to change.
function assessment(quality,override=()=>null){
  return {schema:1,sceneDigest:quality.sceneDigest,qualityRevision:quality.revision,artifactDigest:quality.artifactDigest,slides:quality.prompts.map(p=>({id:p.slide,checks:p.criteria.map(c=>override(p,c)??{criterion:c.id,status:'pass',reason:`SCRIPTED FIXTURE ${p.slide}: ${c.id} judged against ${p.title}`,objects:p.objects,sources:p.sources})}))};
}

test('a reconciliation mechanism built as prose cards gets a specific teaching finding the reviewer must answer',async t=>{
  const f=await built(t,'composition-prose-cards.json'),prepared=await prepareReview(f.options),q=(await record(f)).creativeQuality;
  const finding=q.findings.find(x=>x.slide==='reconcile_loop'&&x.code==='prose-cards');
  assert.ok(finding,JSON.stringify(q.findings.map(x=>[x.slide,x.code])));
  assert.equal(finding.category,'visual-teaching');assert.notEqual(finding.severity,'error');
  assert.deepEqual(finding.objects,['loop_desired','loop_observe','loop_act']);
  // Specific: it names the relationship the design approved and the cards that only describe it.
  for(const words of [/cycle/,/Desired state, Observe and Act/,/nothing drawn between them/,/closes the loop/])assert.match(finding.detail,words);
  const deviation=q.findings.find(x=>x.slide==='reconcile_loop'&&x.code==='approved-diagram-not-drawn');
  assert.equal(deviation.category,'design-deviation');assert.notEqual(deviation.severity,'error');
  const prompt=q.prompts.find(p=>p.slide==='reconcile_loop');
  assert.ok(prompt.criteria.some(c=>c.id==='teaching-treatment'));assert.deepEqual(prompt.proseCards,['loop_desired','loop_observe','loop_act']);
  // Boxes alone are not a defect: the other slides have boxes and get no such prompt.
  assert.ok(!q.findings.some(x=>x.slide!=='reconcile_loop'&&x.code==='prose-cards'));
  assert.ok(prepared.designReview.categories['visual-teaching'].some(x=>x.slide==='reconcile_loop'&&x.code==='prose-cards'&&x.kind==='prompt'));

  // The assessment must address the prompt: it cannot be skipped, nor passed without looking at the cards.
  await assert.rejects(()=>assessReview({output:f.options.output,revision:prepared.revision,assessment:assessment(q,(p,c)=>c.id==='teaching-treatment'?{criterion:'visual-relationship',status:'pass',reason:'dup',objects:p.objects,sources:p.sources}:null)}),/each required criterion/);
  await assert.rejects(()=>assessReview({output:f.options.output,revision:prepared.revision,assessment:assessment(q,(p,c)=>c.id==='teaching-treatment'?{criterion:c.id,status:'pass',reason:'SCRIPTED FIXTURE cards are fine',objects:['reconcile_loop_title'],sources:p.sources}:null)}),/teaching-treatment.*cards/);
  const judged=await assessReview({output:f.options.output,revision:prepared.revision,assessment:assessment(q,(p,c)=>c.id==='teaching-treatment'?{criterion:c.id,status:'issue',reason:'The three cards describe a loop in sentences; nothing shows that acting leads back to observing, so the learner reads a one-time list.',objects:['loop_act','loop_observe'],sources:p.sources}:null)});
  assert.equal(judged.creativeReviewComplete,false);
  assert.deepEqual(judged.unresolved.map(u=>[u.slide,u.criterion,u.category]),[['reconcile_loop','teaching-treatment','visual-teaching']]);
  const teaching=judged.designReview.categories['visual-teaching'].find(x=>x.kind==='judgement');
  assert.equal(teaching.slide,'reconcile_loop');assert.match(teaching.detail,/acting leads back to observing/);
});

test('a drawn reconciliation loop passes, and a justified direct-text knowledge check is accepted without graphics',async t=>{
  const f=await built(t),prepared=await prepareReview(f.options),q=(await record(f)).creativeQuality;
  assert.equal(prepared.creativeReviewRequired,true);assert.equal(prepared.creativeReviewComplete,false);
  assert.ok(!q.findings.some(x=>['prose-cards','approved-diagram-not-drawn','approved-asset-missing'].includes(x.code)),JSON.stringify(q.findings.map(x=>[x.slide,x.code])));
  assert.ok(!q.prompts.some(p=>p.criteria.some(c=>c.id==='teaching-treatment')));
  // The design-bound criteria come from the native critique, not a second scorer.
  for(const id of ['visual-relationship','explanatory-value','asset-purpose','approved-design','rendered-text-completeness'])assert.ok(q.prompts.every(p=>p.criteria.some(c=>c.id===id)),id);
  const check=q.prompts.find(p=>p.slide==='knowledge_check');assert.equal(check.treatment,'direct-text');assert.equal(check.approvedComposition,f.plan.slides[2].composition);
  const direct=prepared.designReview.categories['direct-text'];
  assert.deepEqual(direct.map(x=>[x.slide,x.kind,x.accepted]),[['knowledge_check','treatment',null]]);assert.match(direct[0].reason,/Direct text is the treatment/);
  // An approved icon candidate that the build does not place is an asset prompt, never a teaching failure on its own.
  assert.deepEqual(q.findings.filter(x=>x.category==='asset-failure').map(x=>[x.slide,x.code,x.severity]),[['operator_architecture','approved-candidate-missing','warn']]);

  const inspected=await inspectReview({output:f.options.output,slide:'reconcile_loop'});assert.equal(inspected.slide.intent.relationship,'cycle');assert.ok(inspected.slide.objects.includes('loop_three'));
  await markReview({output:f.options.output,revision:prepared.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE pixels inspected'});
  const done=await assessReview({output:f.options.output,revision:prepared.revision,assessment:assessment(q)});
  assert.equal(done.creativeReviewComplete,true);assert.equal(done.readyForUserReview,true);assert.deepEqual(done.unresolved,[]);
  assert.deepEqual(done.designReview.categories['direct-text'].map(x=>[x.slide,x.accepted]),[['knowledge_check',true]]);
  assert.ok(!done.designReview.categories['visual-teaching'].some(x=>x.kind==='judgement'));
  // design present takes a composition review: it is bound to the approved design.
  const shown=await presentDesign({project:f.project,review:f.options.output,revision:prepared.revision});assert.equal(shown.question.phase,'rendered');
});

test('receipts are bound to the reviewed deck, the design revision and the build; changed inputs are refused as stale',async t=>{
  const f=await built(t),first=await prepareReview(f.options),deck=join(f.options.output,'deck.pptx');
  const r=await record(f);assert.equal(r.source.file,'deck.pptx');assert.equal(r.compiled.dir,'../compiled');assert.equal(r.designProject,'..');assert.equal(r.creativeQuality.designRevision,(await designStatus(f.project)).revision);
  assert.equal(r.creativeQuality.builtArtifactDigest.length,64);
  await markReview({output:f.options.output,revision:first.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE pixels inspected'});
  await assessReview({output:f.options.output,revision:first.revision,assessment:assessment(r.creativeQuality)});
  // Unchanged inputs: the same deck is reused, so the receipts carry over.
  const again=await prepareReview(f.options);assert.equal(again.revision,first.revision);assert.equal(again.readyForUserReview,true);

  // The reviewed deck changed.
  const bytes=await readFile(deck);await writeFile(deck,Buffer.concat([bytes,Buffer.from(' ')]));
  assert.equal(await codeOf(verifyReview(f.options.output)),'review-stale');await writeFile(deck,bytes);
  // The compiled build changed after the review.
  const scene=join(f.compiled,'scene.json'),original=await readFile(scene);await writeFile(scene,original.toString().replace('"Cluster"','"Kluster"'));
  assert.equal(await codeOf(verifyReview(f.options.output)),'review-stale');
  await assert.rejects(()=>markReview({output:f.options.output,revision:first.revision,numbers:[1],note:'SCRIPTED FIXTURE'}),/build changed/);await writeFile(scene,original);
  // The approved design changed after the review.
  const plan=await read('proposal.json');plan.slides[2].notes='Answer: B. Ask who has seen this happen.';plan.slides[1].copy.caveat='Reconciliation repeats; it never stops after install.';
  await proposeDesign({project:f.project,plan,expected:(await designStatus(f.project)).revision});
  assert.equal(await codeOf(verifyReview(f.options.output)),'review-stale');
  // A fresh prepare refuses a build compiled against the older design.
  const pending=await designStatus(f.project);await respondDesign({project:f.project,reply:{questionId:pending.question.id,planRevision:pending.revision,decision:'approve',feedback:'Approve the whole plan'}});
  assert.equal(await codeOf(prepareReview(f.options)),'review-stale');
});

test('the asset copies a slide places are bound, and a missing approved asset is an asset failure',async t=>{
  const project=await temporary(t),shot=join(project,'shot.png');await writeFile(shot,png);
  const added=await run(['assets','add-supplied',shot,'--project',project,'--id','console_screenshot','--kind','screenshot','--alt','Cluster console listing the operator pod','--source','Course author']);assert.equal(added.code,0,added.stderr);
  const slide={id:'console_view',title:'The operator pod runs like any other workload',sources:['brief:operators-101'],visibleText:'The console lists the operator pod with the other workloads.',
    composition:'The console screenshot beside one line of text naming the operator pod.',
    intent:{takeaway:'The operator pod is an ordinary workload.',audienceQuestion:'Where do I see the operator?',relationship:'evidence',rationale:'The real console shows it among the workloads.',evidence:['brief:operators-101'],alternative:{treatment:'A sentence alone',reason:'Seeing the console makes it concrete.'},visual:{family:'sourced-image',purpose:'Show the operator pod in the real console.'}},
    asset:{description:'The course author console screenshot.',disposition:'selected',reason:'It is the evidence.',candidates:[{assetId:'console_screenshot',kind:'screenshot',ref:'assets/supplied/console_screenshot.png',concept:'Console listing the operator pod',status:'resolved'}]}};
  await approve(project,{schema:2,title:'Operators in the console',scope:'new',slides:[slide]});
  const composition=image=>({version:1,title:'Operators in the console',slides:[{id:'console_view',title:slide.title,sources:slide.sources,canvas:{type:'stack',direction:'row',children:[...(image?[{type:'image',id:'console_shot',asset:'console_screenshot'}]:[]),{type:'text',id:'console_text',text:slide.visibleText}]}}]});
  const file=join(project,'composition.json');await writeFile(file,JSON.stringify(composition(true)));
  const compiled=join(project,'compiled');await compileCompositionFile({file,'design-project':project,output:compiled});
  const options={compiled,output:join(project,'review'),designProject:project,signature:async()=>'fixture',render:pixels(1)};
  await prepareReview(options);
  const q=JSON.parse(await readFile(join(options.output,'review.json'),'utf8')).creativeQuality;
  assert.deepEqual(q.assets.map(a=>[a.slide,a.asset,a.sha256.length]),[['console_view','console_screenshot',64]]);
  assert.ok(!q.findings.some(x=>x.category==='asset-failure'));
  const copy=join(compiled,'assets/console_screenshot.png');await writeFile(copy,Buffer.concat([png,Buffer.from('changed')]));
  assert.equal(await codeOf(verifyReview(options.output)),'asset-hash-changed');

  // Without the image the approved sourced-image slide has an asset failure that blocks the creative review.
  await writeFile(file,JSON.stringify(composition(false)));const bare=join(project,'bare');await compileCompositionFile({file,'design-project':project,output:bare});
  const missing=await prepareReview({...options,compiled:bare,output:join(project,'review-bare')});
  const failure=missing.designReview.categories['asset-failure'].find(x=>x.code==='approved-asset-missing');assert.equal(failure.slide,'console_view');assert.equal(failure.severity,'error');
  const mq=JSON.parse(await readFile(join(project,'review-bare','review.json'),'utf8')).creativeQuality;
  const result=await assessReview({output:join(project,'review-bare'),revision:missing.revision,assessment:assessment(mq)});
  assert.equal(result.creativeReviewComplete,false);assert.deepEqual(result.unresolved.map(u=>[u.criterion,u.category]),[['asset-purpose','asset-failure']]);
});

test('a composition review refuses a section build, an unbound build and a missing design, as JSON with --json',async t=>{
  const f=await built(t);
  assert.equal(await codeOf(prepareReview({...f.options,designProject:undefined})),'input-invalid');
  const section=join(f.project,'section'),part=await read('composition.json');part.slides=part.slides.slice(0,2);const partFile=join(f.project,'part.json');await writeFile(partFile,JSON.stringify(part));
  await compileCompositionFile({file:partFile,'design-project':f.project,section:true,output:section});
  assert.equal(await codeOf(prepareReview({...f.options,compiled:section})),'input-invalid');
  // A build compiled without --design-project is not bound to any design.
  const unbound=join(f.project,'unbound');await compileCompositionFile({file:join(fixture,'composition.json'),output:unbound});
  assert.equal(await codeOf(prepareReview({...f.options,compiled:unbound,output:join(f.project,'review-unbound')})),'design-missing');
  const r=await run(['review','--compiled',section,'--output',join(f.project,'cli-review'),'--design-project',f.project,'--json']);
  assert.equal(r.code,1);assert.equal(r.stderr,'');const value=JSON.parse(r.stdout);
  assert.equal(value.status,'blocked');assert.equal(value.designRevision,(await designStatus(f.project)).revision);
  for(const key of ['code','slide','asset','provider','detail','recoverable','next'])assert.ok(Object.hasOwn(value.problems[0],key),key);
  assert.equal(value.problems[0].code,'input-invalid');assert.match(value.problems[0].detail,/section/);
  const plain=await run(['review','--compiled',section,'--output',join(f.project,'cli-review-2'),'--design-project',f.project]);
  assert.equal(plain.code,1);assert.equal(plain.stdout,'');assert.match(plain.stderr,/section/);
  // Without LibreOffice the review names the missing renderer instead of a bare spawn error.
  const missing=await run(['review','--compiled',f.compiled,'--output',join(f.project,'cli-review-4'),'--design-project',f.project,'--soffice',join(f.project,'no-soffice'),'--json']);
  assert.deepEqual([JSON.parse(missing.stdout).problems[0].code,JSON.parse(missing.stdout).problems[0].provider],['renderer-unavailable','libreoffice']);
  const both=await run(['review','--compiled',f.compiled,'--file',join(f.project,'x.pptx'),'--output',join(f.project,'cli-review-3'),'--design-project',f.project,'--json']);
  assert.equal(JSON.parse(both.stdout).problems[0].code,'input-invalid');
});
