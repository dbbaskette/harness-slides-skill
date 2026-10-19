// Design-bound creative review of a composition: review renders the compiled build itself, so the receipts bind the
// reviewed deck, the approved design revision and the asset copies, and the existing criteria judge whether each visual teaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeDesign,respondDesign,presentDesign,designStatus} from '../scripts/lib/design-session.mjs';
import {compileCompositionFile} from '../scripts/lib/compose-file.mjs';
import {prepareReview,markReview,assessReview,inspectReview,verifyReview} from '../scripts/lib/slide-review.mjs';
import * as reviewLib from '../scripts/lib/slide-review.mjs';
import {problemsOf} from '../scripts/lib/refusals.mjs';
import {temporary} from './fixtures.mjs';

const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),fixture=fileURLToPath(new URL('fixtures/visual-contract/',import.meta.url));
const read=async name=>JSON.parse(await readFile(join(fixture,name),'utf8'));
const run=(args,env)=>new Promise(done=>execFile(process.execPath,[cli,...args],{timeout:120000,...(env?{env:{...process.env,...env}}:{})},(error,stdout,stderr)=>done({code:error?error.code??1:0,stdout,stderr})));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
// Synthetic pixels stand in for LibreOffice: these tests cover state and judgement, not layout.
const pixels=(count)=>async({output,selected})=>{for(const n of selected)await writeFile(join(output,`page-${n}.png`),Buffer.concat([png,Buffer.from(`slide ${n}`)]));return {count,image:n=>join(output,`page-${n}.png`)};};
const codeOf=async promise=>{try{await promise;}catch(error){return problemsOf(error)[0].code;}assert.fail('expected a refusal');};

async function approve(project,plan,reply={}){
  const proposed=await proposeDesign({project,plan,mode:'batch'});
  return respondDesign({project,reply:{questionId:proposed.question.id,planRevision:proposed.revision,decision:'approve',feedback:'Approve the whole plan',...reply}});
}
// The contract proposal, approved, and one composition of it compiled against that approval.
async function built(t,composition='composition.json',reply){
  const project=await temporary(t),plan=await read('proposal.json');await approve(project,plan,reply);
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

test('an icon placed by asset ID counts as its approved candidate, and the prompt names the asset',async()=>{
  const {auditCompositionReview}=await import('../scripts/lib/native-quality.mjs'),plan={slides:[(await read('proposal.json')).slides[0]]},slide=plan.slides[0];
  const scene={slides:[{id:slide.id,title:slide.title,elements:[{id:'arch_title',type:'text',role:'title',text:slide.title,x:0,y:0,width:900,height:60}]}]};
  const structure={connectors:[],layouts:[],icons:[{slide:slide.id,id:'arch_icon',icon:'fi-0000aaaa-s001-l001'}]};
  const audit=assets=>auditCompositionReview({scene,structure,report:{inputs:{assets}},plan,designRevision:'r',binding:{},builtArtifactDigest:'b',artifactDigest:'a'});
  const missing=q=>q.findings.filter(f=>f.code==='approved-candidate-missing').map(f=>f.slide);
  // The library ID is not the candidate's free-name ref, so without the asset record the icon is not recognised.
  assert.deepEqual(missing(audit([])),[slide.id]);
  const placed=audit([{object:'arch_icon',slide:slide.id,asset:'icon_kubernetes',kind:'icon',ref:'fi-0000aaaa-s001-l001',sha256:'e'.repeat(64)}]);
  assert.deepEqual(missing(placed),[]);
  assert.deepEqual(placed.prompts[0].assetObjects,[{object:'arch_icon',icon:'fi-0000aaaa-s001-l001',asset:'icon_kubernetes'}]);
});

// Stand-ins for Drive and Poppler: they record each call and write what the real tools would. No test reaches Google.
const sha=data=>createHash('sha256').update(data).digest('hex');
function googleRoute(pages,{importFails,exportFails,noPoppler}={}){
  const calls=[],uploads=[];
  const drive={
    importDeck:async({file,name})=>{calls.push(['import',name]);if(importFails)throw new Error('Google API request failed (403): the Drive upload was refused');uploads.push(sha(await readFile(file)));return {id:'drive_review_1',url:'https://docs.google.com/presentation/d/drive_review_1/edit'};},
    updateDeck:async({fileId,file})=>{calls.push(['update',fileId]);uploads.push(sha(await readFile(file)));return {id:fileId,url:`https://docs.google.com/presentation/d/${fileId}/edit`};},
    exportPdf:async({fileId,output})=>{calls.push(['pdf',fileId]);if(exportFails)throw new Error('Drive did not return a PDF; no output was saved.');await writeFile(output,'%PDF-1.7 stand-in');return {output};}};
  const run=async(command,args)=>{
    calls.push([command,args[0]]);
    if(noPoppler&&/pdf/.test(command))throw Object.assign(new Error(`spawn ${command} ENOENT`),{code:'ENOENT'});
    if(args[0]==='-v')return {stdout:'',stderr:`${command} version 24.02.0`};
    if(command==='pdfinfo')return {stdout:`Title: deck\nPages:          ${pages}\n`};
    if(command==='pdftoppm'){await writeFile(`${args.at(-1)}.png`,Buffer.concat([png,Buffer.from(`google page ${args[1]}`)]));return {stdout:''};}
    throw Object.assign(new Error(`spawn ${command} ENOENT`),{code:'ENOENT'});
  };
  return {calls,uploads,deps:{drive,run}};
}
const googleOptions=(f,route,more={})=>({...f.options,render:undefined,signature:undefined,renderer:'google',...route.deps,...more});
const problemOf=async promise=>{try{await promise;}catch(error){return problemsOf(error)[0];}assert.fail('expected a refusal');};

test('composition preview and design review share the exact native bundle without transferring critique',async t=>{
  const f=await built(t),route=googleRoute(f.plan.slides.length),{previewComposition}=await import('../scripts/lib/compose-preview.mjs');
  const preview=await previewComposition({file:f.compiled,output:join(f.project,'preview'),'design-project':f.project},route.deps);
  const reviewed=await prepareReview(googleOptions(f,route)),recorded=await record(f);
  assert.equal(recorded.source.sha256,preview.deckSha256);assert.equal(route.uploads.length,1);
  assert.equal(reviewed.visualReviewComplete,false);assert.equal(reviewed.creativeReviewComplete,false);
  await markReview({output:f.options.output,revision:reviewed.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE inspected native pixels'});await assessReview({output:f.options.output,revision:reviewed.revision,assessment:assessment(recorded.creativeQuality)});
  const {compositionStatus}=await import('../scripts/lib/composition-project.mjs');assert.equal((await compositionStatus(f.compiled)).readyForUserReview,false);
  const answers=join(f.project,'critique-answers.json');await writeFile(answers,JSON.stringify({deckSha256:preview.deckSha256,reviewer:'author',slides:preview.slides.map(s=>({id:s.id,answers:Array(8).fill(true),note:'SCRIPTED FIXTURE inspected '+s.id})),findings:[]}));await (await import('../scripts/lib/compose-preview.mjs')).recordCritique({file:preview.output,assessment:answers});assert.equal((await compositionStatus(f.compiled)).readyForUserReview,true);
});

test('review --compiled renders through Google Drive, binding the receipts to the exact deck it uploaded',async t=>{
  const f=await built(t),route=googleRoute(f.plan.slides.length),first=await prepareReview(googleOptions(f,route));
  const r=await record(f),deck=await readFile(join(f.options.output,'deck.pptx'));
  // The bytes Google drew are the bytes the review hashes; Poppler was checked before anything was uploaded.
  assert.deepEqual(route.uploads,[r.source.sha256]);assert.equal(sha(deck),r.source.sha256);
  assert.ok(route.calls.findIndex(c=>c[0]==='import')>route.calls.findIndex(c=>c[0]==='pdftoppm'&&c[1]==='-v'));
  assert.deepEqual(route.calls.find(c=>c[0]==='import'),['import',`Preview: ${f.plan.title}`]);
  assert.match(r.renderer,/Google Slides/);assert.match(first.renderer,/Google Slides/);
  assert.deepEqual([first.fileId,r.remote.fileId,r.remote.provider],['drive_review_1','drive_review_1','google']);assert.match(first.next,/--file-id drive_review_1/);
  for(const s of r.slides)assert.equal(sha(await readFile(join(f.options.output,s.image))),s.imageSha256);
  assert.ok(r.creativeQuality.limitations.some(l=>/Google Slides/.test(l)));
  await markReview({output:f.options.output,revision:first.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE Google pixels inspected'});
  const done=await assessReview({output:f.options.output,revision:first.revision,assessment:assessment(r.creativeQuality)});assert.equal(done.readyForUserReview,true);
  assert.equal((await presentDesign({project:f.project,review:f.options.output,revision:first.revision})).question.phase,'rendered');
  // An unchanged build keeps its deck, pictures and receipts: nothing is uploaded again.
  const again=await prepareReview(googleOptions(f,route));assert.equal(again.revision,first.revision);assert.equal(again.readyForUserReview,true);
  assert.equal(route.calls.filter(c=>['import','update'].includes(c[0])).length,1);
  // A refresh with --file-id replaces that Drive file's content instead of creating another.
  const refreshed=googleRoute(f.plan.slides.length);await prepareReview(googleOptions(f,refreshed,{refresh:true,fileId:'drive_review_1'}));
  assert.deepEqual(refreshed.calls.filter(c=>['import','update'].includes(c[0])),[['update','drive_review_1']]);
});

test('a Google review names a missing Poppler before uploading, and a Drive failure as provider-failed with the file to reuse',async t=>{
  const f=await built(t);
  const missing=googleRoute(3,{noPoppler:true}),problem=await problemOf(prepareReview(googleOptions(f,missing)));
  assert.deepEqual([problem.code,problem.provider],['renderer-unavailable','poppler']);assert.ok(!missing.calls.some(c=>c[0]==='import'));
  const refused=await problemOf(prepareReview(googleOptions(f,googleRoute(3,{importFails:true}),{output:join(f.project,'review-2')})));
  assert.deepEqual([refused.code,refused.provider],['provider-failed','google']);
  const stranded=await problemOf(prepareReview(googleOptions(f,googleRoute(3,{exportFails:true}),{output:join(f.project,'review-3')})));
  assert.deepEqual([stranded.code,stranded.provider],['provider-failed','google']);assert.match(stranded.detail,/--file-id drive_review_1/);
  // On the command line: --renderer is checked, and Poppler is checked before Google is reached.
  const bad=await run(['review','--compiled',f.compiled,'--output',join(f.project,'cli-1'),'--design-project',f.project,'--renderer','paper','--json']);
  assert.equal(JSON.parse(bad.stdout).problems[0].code,'input-invalid');
  const orphan=await run(['review','--compiled',f.compiled,'--output',join(f.project,'cli-2'),'--design-project',f.project,'--file-id','drive_review_1','--json']);
  assert.equal(JSON.parse(orphan.stdout).problems[0].code,'input-invalid');
  const cli=await run(['review','--compiled',f.compiled,'--output',join(f.project,'cli-3'),'--design-project',f.project,'--renderer','google','--json'],{HARNESS_PDFINFO:join(f.project,'no-pdfinfo'),HARNESS_PDFTOPPM:join(f.project,'no-pdftoppm')});
  assert.deepEqual([JSON.parse(cli.stdout).problems[0].code,JSON.parse(cli.stdout).problems[0].provider],['renderer-unavailable','poppler']);
  // Without LibreOffice the local render names the Google route as the other way.
  const local=await run(['review','--compiled',f.compiled,'--output',join(f.project,'cli-4'),'--design-project',f.project,'--soffice',join(f.project,'no-soffice'),'--json']);
  assert.match(JSON.parse(local.stdout).problems[0].next,/--renderer google/);
});

test('one call returns every slide\'s packet: its picture, plan ID, criteria, prompts and findings',async t=>{
  const f=await built(t,'composition-prose-cards.json'),prepared=await prepareReview(f.options),r=await record(f);
  assert.equal(typeof reviewLib.reviewPackets,'function');
  const packets=await reviewLib.reviewPackets({output:f.options.output});
  assert.equal(packets.revision,prepared.revision);assert.deepEqual(packets.assessmentBinding,prepared.assessmentBinding);assert.equal(packets.designRevision,r.designRevision);
  assert.deepEqual(packets.designReview,prepared.designReview);assert.equal(packets.contactSheet,join(f.options.output,'contact-sheet.html'));
  assert.deepEqual(packets.slides.map(s=>s.planId),f.plan.slides.map(s=>s.id));
  for(const [i,s] of packets.slides.entries()){
    assert.deepEqual([s.number,s.id,s.image,s.imageSha256,s.mark],[i+1,r.designBinding[i].nativeId,join(f.options.output,r.slides[i].image),r.slides[i].imageSha256,null]);
    const one=await inspectReview({output:f.options.output,slide:s.planId});assert.deepEqual(s.packet,one.slide);assert.deepEqual(s.findings,one.findings);
  }
  assert.ok(packets.slides.find(s=>s.planId==='reconcile_loop').packet.criteria.some(c=>c.id==='teaching-treatment'));
  await markReview({output:f.options.output,revision:prepared.revision,numbers:[2],note:'SCRIPTED FIXTURE pixels inspected'});
  assert.equal((await reviewLib.reviewPackets({output:f.options.output})).slides[1].mark.status,'reviewed');
  const cli=await run(['review','--output',f.options.output,'--packets','--json']);assert.equal(cli.code,0,cli.stdout);
  assert.deepEqual(JSON.parse(cli.stdout).slides.map(s=>s.planId),f.plan.slides.map(s=>s.id));
  const both=await run(['review','--output',f.options.output,'--packets','--slide','reconcile_loop','--json']);assert.equal(JSON.parse(both.stdout).problems[0].code,'input-invalid');
});

test('asking for a review that was never prepared, or mixing prepare with another operation, is input-invalid with the next step',async t=>{
  const project=await temporary(t),empty=join(project,'empty');await mkdir(empty);
  for(const args of [['review','--output',empty,'--slide','reconcile_loop','--json'],['review','--output',empty,'--mark','1','--revision','r','--note','n','--compiled',project,'--json']]){
    const value=JSON.parse((await run(args)).stdout),[p]=value.problems;
    assert.equal(p.code,'input-invalid',p.detail);assert.equal(p.recoverable,true);
  }
  const [never]=JSON.parse((await run(['review','--output',empty,'--slide','reconcile_loop','--json'])).stdout).problems;
  assert.match(never.detail,/Prepare native review first/);assert.match(never.next,/review --compiled/);
  const [mixed]=JSON.parse((await run(['review','--output',empty,'--mark','1','--revision','r','--note','n','--compiled',project,'--json'])).stdout).problems;
  assert.match(mixed.detail,/Prepare and mark are separate operations/);assert.match(mixed.next,/separate/);
  assert.equal(await codeOf(inspectReview({output:empty,slide:'x'})),'input-invalid');
});

test('an assessment may leave out sources and takes each slide\'s own; sources that are not the slide\'s are refused',async t=>{
  const f=await built(t),prepared=await prepareReview(f.options),q=(await record(f)).creativeQuality;
  const bare=assessment(q);for(const s of bare.slides)for(const c of s.checks)delete c.sources;
  const stray=assessment(q,(p,c)=>p.slide==='reconcile_loop'&&c.id==='explanatory-value'?{criterion:c.id,status:'pass',reason:'SCRIPTED FIXTURE the loop is drawn',objects:p.objects,sources:['brief:elsewhere']}:null);
  const refused=await problemOf(assessReview({output:f.options.output,revision:prepared.revision,assessment:stray}));
  assert.equal(refused.code,'input-invalid');for(const words of [/reconcile_loop/,/explanatory-value/,/brief:elsewhere/])assert.match(refused.detail,words);
  await markReview({output:f.options.output,revision:prepared.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE pixels inspected'});
  const done=await assessReview({output:f.options.output,revision:prepared.revision,assessment:bare});assert.equal(done.readyForUserReview,true);
  const kept=(await record(f)).creativeAssessment;
  for(const s of kept.slides)for(const c of s.checks)assert.deepEqual(c.sources,q.prompts.find(p=>p.slide===s.id).sources);
  await verifyReview(f.options.output);
});

test('design present --accept-findings puts the deck to the person with its findings listed, and only their answer records it',async t=>{
  const f=await built(t),prepared=await prepareReview(f.options),q=(await record(f)).creativeQuality,output=f.options.output;
  await markReview({output,revision:prepared.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE pixels inspected'});
  // Before an assessment there is nothing to accept.
  assert.equal(await codeOf(presentDesign({project:f.project,review:output,revision:prepared.revision,acceptFindings:true})),'rendered-review-stale');
  const issue=(p,c)=>p.slide==='operator_architecture'&&c.id==='explanatory-value'?{criterion:c.id,status:'issue',reason:'SCRIPTED FIXTURE the operator is not set apart from the cluster it watches',objects:p.objects,sources:p.sources}:null;
  const judged=await assessReview({output,revision:prepared.revision,assessment:assessment(q,issue)});assert.equal(judged.readyForUserReview,false);
  const plain=await problemOf(presentDesign({project:f.project,review:output,revision:prepared.revision}));
  assert.equal(plain.code,'rendered-review-stale');assert.match(plain.next,/--accept-findings/);
  const shown=await presentDesign({project:f.project,review:output,revision:prepared.revision,acceptFindings:true});
  assert.equal(shown.question.phase,'rendered');assert.equal(shown.renderedAcceptance,false);assert.equal(shown.status,'awaiting rendered user review');
  const listed=[['operator_architecture','explanatory-value','issue','visual-teaching']];
  assert.deepEqual(shown.renderedFindings.map(x=>[x.slide,x.criterion,x.status,x.category]),listed);
  assert.deepEqual(shown.question.findings.map(x=>[x.slide,x.criterion,x.status,x.category]),listed);
  assert.match(shown.question.prompt,/1 unresolved finding/);assert.match(shown.question.findings[0].detail,/not set apart/);
  // Presented again unchanged: the same question.
  assert.equal((await presentDesign({project:f.project,review:output,revision:prepared.revision,acceptFindings:true})).question.id,shown.question.id);
  const answered=await respondDesign({project:f.project,reply:{questionId:shown.question.id,planRevision:shown.revision,decision:'approve',feedback:'Ship it as it is; the operator slide can wait for the next run.'}});
  assert.equal(answered.renderedAcceptance,true);assert.equal(answered.status,'rendered user review approved');assert.deepEqual(answered.renderedFindings.map(x=>x.criterion),['explanatory-value']);
  const session=JSON.parse(await readFile(join(f.project,'.harness-slides/design/session.json'),'utf8')),response=session.responses.at(-1);
  assert.equal(response.phase,'rendered');assert.match(response.feedback,/Ship it/);assert.deepEqual(response.acceptedFindings.map(x=>x.criterion),['explanatory-value']);
  assert.equal((await designStatus(f.project)).renderedAcceptance,true);
  // The accepted findings are bound: a changed assessment makes the presentation stale.
  await assessReview({output,revision:prepared.revision,assessment:assessment(q)});
  assert.equal(await codeOf(designStatus(f.project)),'rendered-review-stale');
  // On the command line.
  await assessReview({output,revision:prepared.revision,assessment:assessment(q,issue)});
  const cli=await run(['design','present','--project',f.project,'--output',output,'--revision',prepared.revision,'--accept-findings','--json']);assert.equal(cli.code,0,cli.stdout);
  assert.deepEqual(JSON.parse(cli.stdout).renderedFindings.map(x=>x.criterion),['explanatory-value']);
});

test('a waived rendered checkpoint does not cover findings: a person still answers',async t=>{
  const f=await built(t,'composition.json',{decision:'autonomous',waiveRendered:true,feedback:'Build it all; I do not need to see the render.'}),prepared=await prepareReview(f.options),q=(await record(f)).creativeQuality,output=f.options.output;
  await markReview({output,revision:prepared.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE pixels inspected'});
  await assessReview({output,revision:prepared.revision,assessment:assessment(q)});
  assert.equal((await presentDesign({project:f.project,review:output,revision:prepared.revision})).renderedAcceptance,true);
  await assessReview({output,revision:prepared.revision,assessment:assessment(q,(p,c)=>p.slide==='reconcile_loop'&&c.id==='approved-design'?{criterion:c.id,status:'uncertain',reason:'SCRIPTED FIXTURE the loop arrow may not read as returning',objects:p.objects,sources:p.sources}:null)});
  const shown=await presentDesign({project:f.project,review:output,revision:prepared.revision,acceptFindings:true});
  assert.equal(shown.renderedAcceptance,false);assert.equal(shown.question.phase,'rendered');assert.deepEqual(shown.renderedFindings.map(x=>x.category),['design-deviation']);
  // Asked one slide at a time, approving the rest would accept a finding the person was not shown.
  const guided=await proposeDesign({project:f.project,plan:f.plan,expected:shown.revision,mode:'guided'});
  assert.deepEqual([guided.question.slides,guided.question.findings],[['operator_architecture'],undefined]);
  const skipped=await problemOf(respondDesign({project:f.project,reply:{questionId:guided.question.id,planRevision:guided.revision,decision:'approve-remaining',feedback:'Approve the rest too.'}}));
  assert.equal(skipped.code,'invalid-response');assert.match(skipped.detail,/reconcile_loop/);
});
