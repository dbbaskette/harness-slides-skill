// Records kept inside a project name its files relatively, so the project can be moved, or committed and opened on another
// computer, and every command still finds them. A record written before this kept absolute paths: it still reads, and the next write migrates it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from '../scripts/lib/common.mjs';
import {proposeDesign,respondDesign,presentDesign,designStatus} from '../scripts/lib/design-session.mjs';
import {compileCompositionFile} from '../scripts/lib/compose-file.mjs';
import {prepareReview,markReview,assessReview,verifyReview} from '../scripts/lib/slide-review.mjs';
import {problemsOf} from '../scripts/lib/refusals.mjs';
import {neutralBrandContract} from '../scripts/lib/brand-contract.mjs';
import {compileDeckPlan} from '../scripts/lib/deck-plan.mjs';
import {initWorkspace,buildWorkspace,workspaceStatus,loadWorkspace,saveScene} from '../scripts/lib/workspace.mjs';
import {temporary} from './fixtures.mjs';
import {proposal,approveFixture} from './design-fixtures.mjs';

const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),fixture=fileURLToPath(new URL('fixtures/visual-contract/',import.meta.url));
const read=async name=>JSON.parse(await readFile(join(fixture,name),'utf8'));
const run=args=>new Promise(done=>execFile(process.execPath,[cli,...args],{timeout:120000},(error,stdout,stderr)=>done({code:error?error.code??1:0,stdout,stderr})));
const ok=async args=>{const r=await run(args);assert.equal(r.code,0,r.stderr||r.stdout);return JSON.parse(r.stdout);};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
// Synthetic pixels stand in for LibreOffice: these tests cover where records point, not layout.
const pixels=count=>async({output,selected})=>{for(const n of selected)await writeFile(join(output,`page-${n}.png`),Buffer.concat([png,Buffer.from(`slide ${n}`)]));return {count,image:n=>join(output,`page-${n}.png`)};};
const codeOf=async promise=>{try{await promise;}catch(error){return problemsOf(error)[0].code;}assert.fail('expected a refusal');};
const json=async file=>JSON.parse(await readFile(file,'utf8'));
// A record names no absolute path inside the folder that holds the project.
const relativeOnly=async(file,base)=>assert.ok(!(await readFile(file,'utf8')).includes(base),`${file} names ${base}`);
function assessment(quality){
  return {schema:1,sceneDigest:quality.sceneDigest,qualityRevision:quality.revision,artifactDigest:quality.artifactDigest,slides:quality.prompts.map(p=>({id:p.slide,checks:p.criteria.map(c=>({criterion:c.id,status:'pass',reason:`SCRIPTED FIXTURE ${p.slide}: ${c.id} judged against ${p.title}`,objects:p.objects,sources:p.sources}))}))};
}
// A project with an approved design, a composition compiled against it, and a reviewed render presented to the person.
async function presented(t){
  const base=await temporary(t),project=join(base,'before'),plan=await read('proposal.json');await mkdir(project);
  const composition=join(project,'composition.json');await writeFile(composition,await readFile(join(fixture,'composition.json')));
  const proposed=await proposeDesign({project,plan,mode:'batch'});
  await respondDesign({project,reply:{questionId:proposed.question.id,planRevision:proposed.revision,decision:'approve',feedback:'Approve the whole plan'}});
  const compiled=join(project,'compiled');await compileCompositionFile({file:composition,'design-project':project,output:compiled});
  const output=join(project,'review'),options={compiled,output,designProject:project,signature:async()=>'fixture',render:pixels(plan.slides.length)};
  const prepared=await prepareReview(options);
  await markReview({output,revision:prepared.revision,numbers:[1,2,3],note:'SCRIPTED FIXTURE pixels inspected'});
  await assessReview({output,revision:prepared.revision,assessment:assessment((await json(join(output,'review.json'))).creativeQuality)});
  const shown=await presentDesign({project,review:output,revision:prepared.revision});assert.equal(shown.question.phase,'rendered');
  return {base,project,plan,prepared,options};
}

test('a project moved after approval and a recorded review keeps working, and its records name no absolute path',async t=>{
  const f=await presented(t),after=join(f.base,'moved','after');
  for(const file of ['.harness-slides/design/session.json','review/review.json','compiled/compose-report.json'])await relativeOnly(join(f.project,file),f.base);
  const report=await json(join(f.project,'compiled/compose-report.json'));
  assert.equal(report.inputs.composition.path,'../composition.json');assert.equal(report.inputs.brand.kind,'neutral defaults');
  await mkdir(join(f.base,'moved'));await rename(f.project,after);

  // The design commands, at the new location.
  const status=await ok(['design','status','--project',after]);
  assert.equal(status.project,after);assert.equal(status.question.phase,'rendered');assert.equal(status.renderedReview,join(after,'review'));
  for(const slide of status.slides)assert.ok(slide.image.startsWith(join(after,'review')+'/'),slide.image);
  const reply=join(f.base,'reply.json');await writeFile(reply,JSON.stringify({questionId:status.question.id,planRevision:status.revision,decision:'approve-remaining',feedback:'SCRIPTED FIXTURE the rendered slides are approved'}));
  assert.equal((await ok(['design','respond','--project',after,'--file',reply])).renderedAcceptance,true);
  assert.equal((await ok(['design','check','--project',after])).revision,status.revision);
  // Presenting the same review again keeps the person's approval of it.
  const again=await ok(['design','present','--project',after,'--output',join(after,'review'),'--revision',f.prepared.revision]);
  assert.equal(again.renderedAcceptance,true);assert.equal(again.question,null);

  // Compose against the moved project.
  const compiled=await ok(['compose','compile','--file',join(after,'composition.json'),'--design-project',after,'--output',join(after,'compiled-2'),'--json']);
  assert.equal(compiled.design.revision,status.revision);
  assert.equal((await json(join(after,'compiled-2/compose-report.json'))).inputs.composition.path,'../composition.json');

  // The review finds its deck, build and design where they are now: an unchanged build keeps its receipts.
  const options={...f.options,compiled:join(after,'compiled'),output:join(after,'review'),designProject:after};
  const reviewed=await prepareReview(options);assert.equal(reviewed.revision,f.prepared.revision);assert.equal(reviewed.readyForUserReview,true);
  for(const file of ['.harness-slides/design/session.json','review/review.json','compiled-2/compose-report.json'])await relativeOnly(join(after,file),f.base);
  // Staleness is judged on the moved files.
  const deck=join(after,'review/deck.pptx'),bytes=await readFile(deck);await writeFile(deck,Buffer.concat([bytes,Buffer.from(' ')]));
  assert.equal(await codeOf(verifyReview(options.output)),'review-stale');
  await assert.rejects(()=>designStatus(after),/Deck changed|Rendered review changed/);
  await writeFile(deck,bytes);assert.equal((await designStatus(after)).renderedAcceptance,true);
});

test('a design-bound workspace moved with its project stays reviewed and accepted',async t=>{
  const base=await temporary(t),project=join(base,'before'),p=proposal(1);await mkdir(project);await approveFixture(project,p);
  const deck={schema:2,title:p.title,slides:p.slides.map(s=>({id:s.id,title:s.title,sources:s.sources,intent:s.intent,component:{kind:'architecture',nodes:[{id:'saved_node',label:'Saved state',tier:0},{id:'restore_node',label:'Recovery',tier:1}],edges:[{from:'saved_node',to:'restore_node',label:'restore'}]}}))};
  const {scene,report}=compileDeckPlan(deck,await neutralBrandContract()),root=join(project,'work');report.sceneDigest=digest(scene);
  await initWorkspace({root,scene,format:'pptx',designReport:report,designProject:project});
  const build=await buildWorkspace({root}),output=join(build.build,'review');
  const prepared=await prepareReview({file:join(build.build,'deck.pptx'),output,designProject:project,qualityReport:join(build.build,'quality-report.json'),signature:async()=>'fixture',render:async({output})=>{await writeFile(join(output,'one.png'),png);return {count:1,image:()=>join(output,'one.png')};}});
  await markReview({output,revision:prepared.revision,numbers:[1],note:'SCRIPTED fixture'});
  await assessReview({output,revision:prepared.revision,assessment:assessment((await json(join(output,'review.json'))).creativeQuality)});
  const shown=await presentDesign({project,review:output,revision:prepared.revision});
  await respondDesign({project,reply:{questionId:shown.question.id,planRevision:shown.revision,decision:'approve',feedback:'SCRIPTED fixture final acceptance'}});
  assert.equal((await workspaceStatus(root)).ready,true);
  assert.equal((await json(join(root,'workspace.json'))).designProject,'..');
  for(const file of ['workspace.json',`versions/${build.version}/build/review/review.json`])await relativeOnly(join(root,file),base);
  await relativeOnly(join(project,'.harness-slides/design/session.json'),base);

  const after=join(base,'after');await rename(project,after);
  const status=await workspaceStatus(join(after,'work'));
  assert.equal(status.ready,true,JSON.stringify(status));assert.equal(status.userAccepted,true);assert.equal(status.creativeReviewComplete,true);
});

test('records written with absolute paths still read, and the next write makes them relative',async t=>{
  const f=await presented(t),session=join(f.project,'.harness-slides/design/session.json'),review=join(f.options.output,'review.json');
  // Rewrite the records as an earlier version left them: absolute paths, and the session's own project.
  const s=await json(session),images=Object.fromEntries(Object.entries(s.rendered.images).map(([id,path])=>[id,join(f.project,path)]));
  Object.assign(s,{project:f.project});Object.assign(s.rendered,{review:f.options.output,images,binding:digest([s.rendered.revision,s.rendered.qualityRevision,images])});
  await writeFile(session,JSON.stringify(s,null,2));
  const r=await json(review);r.source.file=join(f.options.output,'deck.pptx');r.designProject=f.project;r.compiled.dir=f.options.compiled;await writeFile(review,JSON.stringify(r,null,2));
  const legacy=await designStatus(f.project);assert.equal(legacy.question.phase,'rendered');assert.equal(legacy.renderedReview,f.options.output);
  assert.equal((await verifyReview(f.options.output)).visualReviewComplete,true);

  // A review write migrates its record.
  await markReview({output:f.options.output,revision:f.prepared.revision,numbers:[1],note:'SCRIPTED FIXTURE inspected again'});
  await relativeOnly(review,f.base);assert.equal((await json(review)).source.file,'deck.pptx');
  // An older session names its project, so it is found after a move even before it is rewritten.
  const after=join(f.base,'after');await rename(f.project,after);
  const moved=await designStatus(after);assert.equal(moved.question.id,legacy.question.id);assert.equal(moved.renderedReview,join(after,'review'));
  // A session write migrates it, and presenting the same review again keeps the approval given before.
  await respondDesign({project:after,reply:{questionId:moved.question.id,planRevision:moved.revision,decision:'approve-remaining',feedback:'SCRIPTED FIXTURE approved'}});
  const migrated=await json(join(after,'.harness-slides/design/session.json'));
  assert.equal(migrated.project,undefined);assert.equal(migrated.rendered.review,'review');await relativeOnly(join(after,'.harness-slides/design/session.json'),f.base);
  assert.equal((await presentDesign({project:after,review:join(after,'review'),revision:f.prepared.revision})).renderedAcceptance,true);
});

test('a workspace manifest with an absolute design project still builds, and its next save makes it relative',async t=>{
  const project=await temporary(t),p=proposal(1);await approveFixture(project,p);
  const deck={schema:2,title:p.title,slides:p.slides.map(s=>({id:s.id,title:s.title,sources:s.sources,intent:s.intent,component:{kind:'architecture',nodes:[{id:'state_node',label:'State',tier:0},{id:'restore_node',label:'Restore',tier:1}],edges:[{from:'state_node',to:'restore_node'}]}}))};
  const {scene}=compileDeckPlan(deck,await neutralBrandContract()),root=join(project,'work');await initWorkspace({root,scene,format:'pptx',designProject:project});
  const manifest=await json(join(root,'workspace.json'));manifest.designProject=project;await writeFile(join(root,'workspace.json'),JSON.stringify(manifest,null,2));
  await buildWorkspace({root});
  const w=await loadWorkspace(root),edited=structuredClone(w.scene);edited.slides[0].notes='SCRIPTED FIXTURE presenter note';
  await saveScene({root,scene:edited,expectedDigest:w.current.sceneDigest});
  assert.equal((await json(join(root,'workspace.json'))).designProject,'..');
  await buildWorkspace({root});
});
