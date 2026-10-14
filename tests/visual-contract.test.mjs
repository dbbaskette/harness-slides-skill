import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {proposeDesign,respondDesign,designStatus,getApprovedDesign,validateDesignProposal,renderCopy} from '../scripts/lib/design-session.mjs';
import {previewComposition} from '../scripts/lib/compose-preview.mjs';
import {encodePng} from '../scripts/lib/contact-sheet.mjs';
import {temporary} from './fixtures.mjs';
import {proposal as schema1} from './design-fixtures.mjs';
const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),fixture=fileURLToPath(new URL('fixtures/visual-contract/',import.meta.url)).replace(/\/$/,'');
const read=async name=>JSON.parse(await readFile(join(fixture,name),'utf8'));
// Runs the public CLI and keeps the exit code, so refusals can be inspected rather than thrown.
const run=(args,env={})=>new Promise(done=>execFile(process.execPath,[cli,...args],{env:{...process.env,...env},timeout:120000},(error,stdout,stderr)=>done({code:error?error.code??1:0,stdout,stderr})));
const ok=async args=>{const r=await run(args);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout);};
const fill=(args,place)=>args.map(a=>a.replaceAll('{project}',place.project).replaceAll('{fixture}',fixture).replaceAll('{output}',place.output));
async function given(state,project){
  if(state==='empty')return;
  const contract=await read('cases.json'),proposed=await ok(['design','propose','--project',project,'--file',join(fixture,contract.proposal),'--mode','batch']);
  if(state==='proposed')return proposed;
  const reply=join(project,'reply.json');await writeFile(reply,JSON.stringify({questionId:proposed.question.id,planRevision:proposed.revision,...contract.approval}));
  return ok(['design','respond','--project',project,'--file',reply]);
}
const blocked=(r)=>{assert.notEqual(r.code,0);assert.equal(r.stderr,'');const value=JSON.parse(r.stdout);assert.equal(value.schema,1);assert.equal(value.status,'blocked');assert.ok(Object.hasOwn(value,'designRevision'));
  for(const p of value.problems){for(const key of ['code','slide','asset','provider','detail','recoverable','next'])assert.ok(Object.hasOwn(p,key),`problem lacks ${key}`);assert.equal(typeof p.detail,'string');assert.equal(typeof p.recoverable,'boolean');assert.equal(typeof p.next,'string');if(p.fallback)assert.equal(p.fallback.needsApproval,true);}
  return value;};

test('the contract fixture proposes three schema-2 slides, takes one whole-plan answer and binds a composition',async t=>{
  const project=await temporary(t),plan=await read('proposal.json');
  const proposed=await given('proposed',project);
  assert.equal(proposed.mode,'batch');assert.equal(proposed.buildAllowed,false);
  assert.deepEqual(proposed.question.slides,plan.slides.map(s=>s.id));assert.equal(proposed.slides.length,3);
  assert.ok(proposed.question.options.includes('Approve the whole plan'));
  for(const [i,s] of proposed.slides.entries())assert.equal(s.visibleText,renderCopy(plan.slides[i].copy));
  assert.equal(proposed.slides[2].intent.visual.family,'text');assert.equal(proposed.slides[2].asset.disposition,'not-needed');
  const approved=await given('approved',await temporary(t));assert.equal(approved.buildAllowed,true);assert.deepEqual(approved.pending,[]);
  const second=await temporary(t),output=join(second,'compiled');await given('approved',second);
  const compiled=await ok(['compose','compile','--file',join(fixture,'composition.json'),'--design-project',second,'--output',output,'--json']);
  assert.equal(compiled.slides,3);
  const report=JSON.parse(await readFile(join(output,'compose-report.json'),'utf8'));assert.equal(report.designRevision,(await designStatus(second)).revision);
});

test('every refusal case in the contract fixture returns the JSON refusal shape and a non-zero exit',async t=>{
  const contract=await read('cases.json');
  for(const c of contract.cases){
    const project=await temporary(t),place={project,output:join(project,'compiled')};await given(c.given,project);
    const value=blocked(await run(fill(c.run,place)));
    assert.equal(value.problems.length,c.problems.length,`${c.id}: ${JSON.stringify(value.problems)}`);
    for(const [i,want] of c.problems.entries())for(const [key,expected] of Object.entries(want)){
      if(key==='fallback')assert.equal(value.problems[i].fallback?.needsApproval,true,c.id);else assert.equal(value.problems[i][key],expected,`${c.id}: ${key}`);
    }
    if(c.given!=='empty')assert.equal(value.designRevision,(await designStatus(project)).revision,c.id);
  }
});

test('without --json a refusal stays a human sentence on stderr',async t=>{
  const project=await temporary(t),r=await run(['design','propose','--project',project,'--file',join(fixture,'refusals/qualification-missing.json')]);
  assert.equal(r.code,1);assert.equal(r.stdout,'');assert.match(r.stderr,/reconcile_loop: the qualification "Reconciliation never stops" does not appear in the slide copy/);
  const bad=await run(['compose','compile','--file',join(fixture,'refusals/composition-reordered.json'),'--design-project',project,'--output',join(project,'out')]);
  assert.equal(bad.code,1);assert.doesNotMatch(bad.stderr,/"schema"/);
});

test('compose compile reports each composition problem with its slide, and an unknown option is still refused',async t=>{
  const project=await temporary(t),file=join(project,'composition.json'),comp=await read('composition.json');
  delete comp.direction;comp.slides[2].title='Check: a pod the operator manages is deleted by hand while the controller keeps running. What happens?';
  await writeFile(file,JSON.stringify(comp));
  const value=blocked(await run(['compose','compile','--file',file,'--json']));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide]),[['composition-invalid','operator_architecture'],['composition-invalid','reconcile_loop'],['composition-invalid','knowledge_check']]);
  assert.match(value.problems[2].detail,/title/);assert.equal(value.designRevision,null);
  const r=await run(['compose','merge','--file',file,'--output',join(project,'merged.json'),'--json']);assert.equal(r.code,1);assert.match(r.stderr,/--json is not valid/);
});

test('compose preview refuses a missing renderer as JSON, naming the provider and the compiled design revision',async t=>{
  const project=await temporary(t),compiled=join(project,'compiled');await given('approved',project);
  await ok(['compose','compile','--file',join(fixture,'composition.json'),'--design-project',project,'--output',compiled]);
  const r=await run(['compose','preview','--file',compiled,'--output',join(project,'preview'),'--renderer','local','--json'],{HARNESS_PDFINFO:join(project,'no-such-pdfinfo')});
  const value=blocked(r);assert.equal(value.problems[0].code,'renderer-unavailable');assert.equal(value.problems[0].provider,'poppler');assert.equal(value.designRevision,(await designStatus(project)).revision);
});

test('a lock left by a killed process is reported as recoverable, with the way out',async t=>{
  const project=await temporary(t);await given('proposed',project);await writeFile(join(project,'.harness-slides/design/.lock'),'');
  const value=blocked(await run(['design','propose','--project',project,'--file',join(fixture,'proposal.json'),'--expected',(await designStatus(project)).revision,'--json']));
  assert.equal(value.problems[0].code,'design-busy');assert.equal(value.problems[0].recoverable,true);assert.match(value.problems[0].next,/\.lock/);
  const missing=blocked(await run(['design','status','--project',await temporary(t),'--json']));assert.equal(missing.problems[0].code,'design-missing');assert.equal(missing.designRevision,null);
});

test('schema 2 renders visible text from copy, keeps notes out of approval and checks qualifications',async t=>{
  const plan=await read('proposal.json'),project=await temporary(t);
  assert.equal(renderCopy(plan.slides[0].copy),'Custom resource: Declares the state you want\nController: Runs in a pod and watches the resource\nAPI server: Stores both and tells watchers what changed\nAn operator manages only the resources it was written for.\nSource: Kubernetes documentation, Operator pattern');
  assert.equal(renderCopy({points:[{label:'Only a label'},{text:'Only text'}],focal:'A statement of its own'}),'A statement of its own\nOnly a label\nOnly text');
  let s=await proposeDesign({project,plan,mode:'batch'});
  // The stored plan carries the rendered text, so a caller resubmitting what it read back changes nothing.
  const stored=(await designStatus(project)).slides.map(x=>x.visibleText);
  const echoed=structuredClone(plan);echoed.slides.forEach((x,i)=>{x.visibleText=stored[i];});
  assert.equal((await proposeDesign({project,plan:echoed,expected:s.revision})).revision,s.revision);
  s=await respondDesign({project,reply:{questionId:s.question.id,planRevision:s.revision,decision:'approve',feedback:'Approve the whole plan'}});assert.equal(s.buildAllowed,true);
  plan.slides[1].notes='Different speaker notes.';s=await proposeDesign({project,plan,expected:s.revision});assert.equal(s.buildAllowed,true);assert.deepEqual(s.pending,[]);
  plan.slides[1].copy.points[1].text='Read the live state';s=await proposeDesign({project,plan,expected:s.revision});assert.deepEqual(s.pending,['reconcile_loop']);
  const copyless=structuredClone(plan);delete copyless.slides[1].copy;copyless.slides[1].visibleText='Desired state, observe, act.';
  assert.throws(()=>validateDesignProposal(copyless),/qualification "Reconciliation repeats" does not appear/);
  copyless.slides[1].visibleText+=' Reconciliation  REPEATS forever.';validateDesignProposal(copyless);
});

test('schema 2 fields are checked, and schema 1 stays exactly as it was',async t=>{
  const base=await read('proposal.json'),bad=(edit,pattern)=>{const p=structuredClone(base);edit(p);assert.throws(()=>validateDesignProposal(p),pattern);};
  bad(p=>{p.slides[0].asset.candidates[0].kind='photo';},/candidate/);
  bad(p=>{p.slides[0].asset.candidates[1].assetId=p.slides[0].asset.candidates[0].assetId;},/candidate/);
  bad(p=>{p.slides[0].asset.candidates[0].status='maybe';},/candidate/);
  bad(p=>{p.slides[0].copy={points:[]};},/copy/);
  bad(p=>{p.slides[0].copy.points.push({});},/copy/);
  bad(p=>{p.slides[0].objectives=[];},/objectives/);
  bad(p=>{p.slides[0].notes='';},/notes/);
  bad(p=>{delete p.slides[0].copy;},/visible copy/);
  bad(p=>{p.schema=3;},/schema/);
  const old=schema1(1);validateDesignProposal(old);
  for(const [key,value] of [['notes','Speaker notes'],['objectives',['objective_one']],['copy',{points:[{text:'x'}]}],['qualifications',['x']]]){const p=schema1(1);p.slides[0][key]=value;assert.throws(()=>validateDesignProposal(p),/Each design slide/);}
  const p=schema1(1);p.slides[0].asset.candidates=[];assert.throws(()=>validateDesignProposal(p),/asset/);
  // A schema-1 plan is stored and digested exactly as before: no rendered text is added.
  const project=await temporary(t),s=await proposeDesign({project,plan:old});await assert.rejects(()=>getApprovedDesign(project),/Awaiting/);
  assert.equal(s.slides[0].visibleText,old.slides[0].visibleText);assert.equal(Object.keys(s.slides[0]).includes('copy'),false);
});

test('batch mode asks one question for the whole plan; changing mode moves the question and stale answers are refused',async t=>{
  const project=await temporary(t),plan=schema1(3);
  let s=await proposeDesign({project,plan});assert.equal(s.mode,'guided');assert.deepEqual(s.question.slides,[plan.slides[0].id]);const guided=s.question.id;
  await assert.rejects(()=>proposeDesign({project,plan,mode:'batch'}),/revision changed/);
  await assert.rejects(()=>proposeDesign({project,plan,mode:'autonomous',expected:s.revision}),/guided or batch/);
  s=await proposeDesign({project,plan,mode:'batch',expected:s.revision});assert.equal(s.mode,'batch');assert.deepEqual(s.question.slides,plan.slides.map(x=>x.id));
  assert.match(s.question.prompt,/whole design plan/);assert.deepEqual(s.question.options,['Approve the whole plan','Request changes']);
  await assert.rejects(()=>respondDesign({project,reply:{questionId:guided,planRevision:s.revision,decision:'approve',feedback:'Approve this design'}}),/stale/);
  await assert.rejects(()=>respondDesign({project,reply:{questionId:s.question.id,planRevision:'0'.repeat(64),decision:'approve',feedback:'Approve the whole plan'}}),/stale/);
  const revised=await respondDesign({project,reply:{questionId:s.question.id,planRevision:s.revision,decision:'revise',feedback:'Make the second slide about failover only.'}});
  assert.equal(revised.status,'revision requested');assert.equal(revised.pending.length,3);
  plan.slides[1].composition+=' Failover only.';s=await proposeDesign({project,plan,expected:revised.revision});assert.equal(s.mode,'batch');assert.equal(s.question.slides.length,3);
  s=await respondDesign({project,reply:{questionId:s.question.id,planRevision:s.revision,decision:'approve',feedback:'Approve the whole plan'}});assert.equal(s.buildAllowed,true);
  const record=JSON.parse(await readFile(join(project,'.harness-slides/design/session.json'),'utf8'));assert.ok(record.responses.some(r=>r.kind==='mode'&&r.mode==='batch'));
  // A plan with one changed slide asks about that slide only, and says so.
  plan.slides[2].composition+=' Label the replica.';s=await proposeDesign({project,plan,expected:s.revision});assert.deepEqual(s.question.slides,[plan.slides[2].id]);assert.match(s.question.prompt,/remaining/);
});

test('the CLI takes --mode on propose only',async t=>{
  const project=await temporary(t),file=join(project,'p.json');await writeFile(file,JSON.stringify(schema1(2)));
  assert.equal((await ok(['design','propose','--project',project,'--file',file,'--mode','batch'])).question.slides.length,2);
  const r=await run(['design','status','--project',project,'--mode','batch']);assert.equal(r.code,1);assert.match(r.stderr,/--mode is not valid/);
});

// A section is a run of neighbouring approved slides, written by one author and declared with --section.
const sectionFile=async(dir,name,ids,edit=()=>{})=>{const comp=await read('composition.json');comp.slides=ids.map(id=>typeof id==='string'?comp.slides.find(s=>s.id===id):id);edit(comp);const file=join(dir,name);await writeFile(file,JSON.stringify(comp));return file;};
const tiny=encodePng({width:16,height:9,rgb:Buffer.alloc(16*9*3,200)});
// Stand-ins for Drive and Poppler that write the files the real tools would, for a render of `pages` slides.
const renderFakes=pages=>({drive:{importDeck:async()=>({id:'drive_file_1',url:'https://docs.google.com/presentation/d/drive_file_1/edit'}),exportPdf:async({output})=>{await writeFile(output,'%PDF-1.7 fake');return {output};}},
  run:async(command,args)=>{if(args[0]==='-v')return {stdout:''};if(command==='pdfinfo')return {stdout:`Pages:          ${pages}\n`};await writeFile(args.at(-1)+'.png',tiny);return {stdout:''};}});

test('a declared section compiles and previews against the approved design, and the merged deck compiles as a whole',async t=>{
  const project=await temporary(t);await given('approved',project);const revision=(await designStatus(project)).revision;
  const first=await sectionFile(project,'section-1.json',['operator_architecture']),second=await sectionFile(project,'section-2.json',['reconcile_loop','knowledge_check']);
  const checked=await ok(['compose','compile','--file',second,'--design-project',project,'--section','--json']);
  assert.deepEqual(checked.design,{revision,scope:'section',slides:['reconcile_loop','knowledge_check']});
  const compiled=join(project,'compiled-2');await ok(['compose','compile','--file',second,'--design-project',project,'--section','--output',compiled]);
  const report=JSON.parse(await readFile(join(compiled,'compose-report.json'),'utf8'));assert.equal(report.designRevision,revision);assert.equal(report.designScope,'section');
  const preview=await previewComposition({file:compiled,output:join(project,'preview-2'),'design-project':project,section:true},renderFakes(2));
  assert.deepEqual(preview.slides.map(s=>s.id),['reconcile_loop','knowledge_check']);assert.deepEqual(preview.design,{revision,scope:'section',slides:['reconcile_loop','knowledge_check']});
  // Undeclared, the same section is a deck with a missing slide: a section never passes as the whole deck.
  let value=blocked(await run(['compose','compile','--file',second,'--design-project',project,'--json']));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide]),[['design-mismatch','operator_architecture']]);assert.match(value.problems[0].detail,/missing/);
  value=blocked(await run(['compose','preview','--file',compiled,'--output',join(project,'preview-deck'),'--design-project',project,'--json']));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide]),[['design-mismatch','operator_architecture']]);assert.equal(value.designRevision,revision);
  // The lead merges the sections and compiles the whole deck without --section.
  const parts=join(project,'parts.json'),comp=await read('composition.json');await writeFile(parts,JSON.stringify({title:comp.title,direction:comp.direction,parts:[first,second]}));
  const merged=join(project,'merged.json');await ok(['compose','merge','--file',parts,'--output',merged]);
  const deck=await ok(['compose','compile','--file',merged,'--design-project',project,'--output',join(project,'compiled-deck')]);assert.equal(deck.slides,3);assert.equal(deck.design.scope,'deck');
  const whole=await previewComposition({file:join(project,'compiled-deck'),output:join(project,'preview-deck'),'design-project':project},renderFakes(3));assert.equal(whole.design.scope,'deck');
});

test('a section is refused, naming the slide, when a slide is missing, extra, out of order, retitled or carries a changed intent',async t=>{
  const project=await temporary(t);await given('approved',project);const plan=await read('proposal.json'),intent=id=>structuredClone(plan.slides.find(s=>s.id===id).intent);
  const refused=async(name,ids,edit,args=[])=>blocked(await run(['compose','compile','--file',await sectionFile(project,name,ids,edit),'--design-project',project,'--section','--json',...args])).problems.map(p=>[p.code,p.slide,p.detail]);
  const [missing]=await refused('missing.json',['operator_architecture','knowledge_check']);assert.deepEqual(missing.slice(0,2),['design-mismatch','reconcile_loop']);assert.match(missing[2],/missing/);
  const extra=async comp=>{const s=structuredClone(comp.slides[1]);s.id='extra_slide';s.title='A slide nobody approved';comp.slides[1]=s;};
  const [added]=await refused('extra.json',['reconcile_loop','knowledge_check'],extra);assert.deepEqual(added.slice(0,2),['design-mismatch','extra_slide']);assert.match(added[2],/not in the approved design/);
  const [reordered]=await refused('reordered.json',['reconcile_loop','operator_architecture'],undefined,['--output',join(project,'out')]);assert.deepEqual(reordered.slice(0,2),['design-mismatch','operator_architecture']);assert.match(reordered[2],/order/);
  const [retitled]=await refused('retitled.json',['reconcile_loop'],comp=>{comp.slides[0].title='The controller closes the gap';});assert.deepEqual(retitled.slice(0,2),['design-mismatch','reconcile_loop']);assert.match(retitled[2],/title/i);
  const changed=await refused('intent.json',['reconcile_loop','knowledge_check'],comp=>{for(const s of comp.slides)s.intent=intent(s.id);comp.slides[0].intent.takeaway='A controller runs once when a resource is created.';comp.slides[1].intent.visual.family='diagram';});
  assert.deepEqual(changed.map(p=>p.slice(0,2)),[['design-mismatch','reconcile_loop'],['design-mismatch','knowledge_check']]);assert.match(changed[0][2],/intent/);
  // The approved intent, unchanged, passes.
  const kept=await ok(['compose','compile','--file',await sectionFile(project,'kept.json',['reconcile_loop'],comp=>{comp.slides[0].intent=intent('reconcile_loop');}),'--design-project',project,'--section']);assert.equal(kept.design.scope,'section');
});

test('compose compile with --design-project checks the design even without --output, and --section needs --design-project',async t=>{
  const project=await temporary(t);await given('proposed',project);
  let value=blocked(await run(['compose','compile','--file',join(fixture,'composition.json'),'--design-project',project,'--json']));
  assert.deepEqual(value.problems.map(p=>p.code),['design-awaiting-approval','design-awaiting-approval','design-awaiting-approval']);
  const approved=await temporary(t);await given('approved',approved);
  value=blocked(await run(['compose','compile','--file',join(fixture,'refusals/composition-reordered.json'),'--design-project',approved,'--json']));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide]),[['design-mismatch','reconcile_loop']]);
  const checked=await ok(['compose','compile','--file',join(fixture,'composition.json'),'--design-project',approved]);assert.equal(checked.design.scope,'deck');assert.match(checked.status,/nothing written/);
  // Without a design project nothing has changed: a plain check is a fit check.
  assert.equal((await ok(['compose','compile','--file',join(fixture,'refusals/composition-reordered.json')])).slides,3);
  for(const args of [['compose','compile','--file',join(fixture,'composition.json'),'--section','--json'],['compose','preview','--file',approved,'--output',join(approved,'p'),'--section','--json']]){
    value=blocked(await run(args));assert.equal(value.problems[0].code,'input-invalid');assert.match(value.problems[0].detail,/--section needs --design-project/);
  }
});
