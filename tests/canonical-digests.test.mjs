import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalDigest,digest} from '../scripts/lib/common.mjs';
import {designStatus,proposeDesign,getApprovedDesign} from '../scripts/lib/design-session.mjs';
import {temporary} from './fixtures.mjs';
const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url));
const fixture=name=>fileURLToPath(new URL(`fixtures/${name}`,import.meta.url));
const read=async name=>JSON.parse(await readFile(fixture(name),'utf8'));
const run=args=>new Promise(done=>execFile(process.execPath,[cli,...args],{timeout:120000},(error,stdout,stderr)=>done({code:error?error.code??1:0,stdout,stderr})));
const ok=async args=>{const r=await run(args);assert.equal(r.code,0,r.stdout+r.stderr);return JSON.parse(r.stdout);};
// Keys sorted at every level, as Python's json.dumps(sort_keys=True) writes them; and reversed, as some other writer might.
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const reversed=v=>Array.isArray(v)?v.map(reversed):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reversed(v[k])])):v;
const sessionFile=project=>join(project,'.harness-slides/design/session.json');
// A session written by 0.13.1-era code: the visual-contract proposal, approved by one whole-plan answer, its approvals bound with order-dependent digests.
async function legacyProject(t){const project=await temporary(t);await mkdir(join(project,'.harness-slides/design'),{recursive:true});await copyFile(fixture('legacy-design-session/session.json'),sessionFile(project));return project;}
async function approvedProject(t){
  const project=await temporary(t),proposed=await ok(['design','propose','--project',project,'--file',fixture('visual-contract/proposal.json'),'--mode','batch']),reply=join(project,'reply.json');
  await writeFile(reply,JSON.stringify({questionId:proposed.question.id,planRevision:proposed.revision,decision:'approve',feedback:'Approve the whole plan'}));
  await ok(['design','respond','--project',project,'--file',reply]);return project;
}
// The contract composition with each slide carrying its approved intent, re-serialised with sorted keys.
async function composition(dir,change){
  const plan=await read('visual-contract/proposal.json'),value=await read('visual-contract/composition.json');
  for(const s of value.slides)s.intent=sorted(plan.slides.find(p=>p.id===s.id).intent);
  change?.(value);const file=join(dir,'composition-sorted.json');await writeFile(file,JSON.stringify(sorted(value)));
  assert.notEqual(JSON.stringify(value.slides[0].intent),JSON.stringify(plan.slides[0].intent),'the fixture must reorder the intent keys');
  return file;
}

test('canonicalDigest ignores object key order at every depth, but not array order or values',()=>{
  const a={b:1,a:{d:[1,{y:2,x:3}],c:null}},b={a:{c:null,d:[1,{x:3,y:2}]},b:1};
  assert.equal(canonicalDigest(a),canonicalDigest(b));assert.notEqual(digest(a),digest(b));
  assert.notEqual(canonicalDigest({a:[1,2]}),canonicalDigest({a:[2,1]}));assert.notEqual(canonicalDigest({a:1}),canonicalDigest({a:'1'}));
  assert.equal(canonicalDigest({a:1,b:undefined}),canonicalDigest({a:1}),'undefined is dropped, as JSON drops it');
});

test('an intent with reordered keys passes compose compile --design-project; a changed intent is still refused',async t=>{
  const project=await approvedProject(t),file=await composition(project);
  const checked=await ok(['compose','compile','--file',file,'--design-project',project,'--json']);assert.equal(checked.design.scope,'deck');
  const output=join(project,'compiled');const built=await ok(['compose','compile','--file',file,'--design-project',project,'--output',output,'--json']);assert.equal(built.slides,3);
  assert.equal(JSON.parse(await readFile(join(output,'compose-report.json'),'utf8')).designRevision,(await designStatus(project)).revision);
  const section=await composition(join(project,'..'),value=>{value.slides=value.slides.slice(1);});
  assert.equal((await ok(['compose','compile','--file',section,'--design-project',project,'--section','--json'])).design.scope,'section');
  const changed=await composition(project,value=>{value.slides[1].intent.takeaway+=' Changed.';});
  const refused=await run(['compose','compile','--file',changed,'--design-project',project,'--json']);assert.equal(refused.code,1);
  assert.deepEqual(JSON.parse(refused.stdout).problems.map(p=>[p.code,p.slide]),[['design-mismatch','reconcile_loop']]);
});

test('a session written with order-dependent approvals stays approved, and its next write stores canonical bindings',async t=>{
  const project=await legacyProject(t),legacy=JSON.parse(await readFile(sessionFile(project),'utf8'));
  const checked=await ok(['design','check','--project',project,'--json']);assert.equal(checked.buildAllowed,true);assert.equal(checked.revision,legacy.revision);assert.deepEqual((await designStatus(project)).pending,[]);
  await ok(['compose','compile','--file',await composition(project),'--design-project',project,'--json']);
  assert.deepEqual(JSON.parse(await readFile(sessionFile(project),'utf8')),legacy,'reading does not rewrite the session');
  // The same plan, sent back with its keys in another order: nothing changes but the stored form of the bindings.
  const again=await proposeDesign({project,plan:reversed(legacy.plan),expected:legacy.revision});
  assert.equal(again.revision,legacy.revision);assert.equal(again.buildAllowed,true);assert.deepEqual(again.pending,[]);
  const written=JSON.parse(await readFile(sessionFile(project),'utf8'));
  assert.deepEqual(written.plan,legacy.plan,'the stored plan, and so its revision, is kept');assert.deepEqual(written.responses,legacy.responses,'a reordered resubmission is not a new proposal');
  for(const id of Object.keys(legacy.approvals)){assert.notEqual(written.approvals[id].binding,legacy.approvals[id].binding);assert.equal(written.approvals[id].response,legacy.approvals[id].response);}
  assert.equal((await getApprovedDesign(project)).revision,legacy.revision);
});

test('a revised plan written in another key order keeps the approvals of its unchanged slides',async t=>{
  const project=await legacyProject(t),legacy=JSON.parse(await readFile(sessionFile(project),'utf8')),plan=sorted(structuredClone(legacy.plan));
  plan.slides[1].composition+=' Label the loop with its three steps.';
  const revised=await proposeDesign({project,plan,expected:legacy.revision});
  assert.notEqual(revised.revision,legacy.revision);assert.deepEqual(revised.pending,['reconcile_loop']);
  const status=await designStatus(project);assert.deepEqual(status.pending,['reconcile_loop']);
});

test('a session written by this runtime survives being re-serialised with sorted keys; one written before cannot be checked and is refused',async t=>{
  const project=await approvedProject(t),before=await designStatus(project),stored=JSON.parse(await readFile(sessionFile(project),'utf8'));
  assert.equal(before.revision,canonicalDigest(stored.plan));
  await writeFile(sessionFile(project),JSON.stringify(sorted(stored),null,1));
  const after=await ok(['design','check','--project',project,'--json']);assert.equal(after.revision,before.revision);assert.equal(after.buildAllowed,true);assert.deepEqual((await designStatus(project)).pending,[]);
  // A legacy revision is the digest of the plan's bytes in their stored order, so a reordered legacy plan no longer matches it.
  const legacy=await legacyProject(t),old=JSON.parse(await readFile(sessionFile(legacy),'utf8'));
  await writeFile(sessionFile(legacy),JSON.stringify(sorted(old)));
  await assert.rejects(()=>designStatus(legacy),/changed outside the checkpoint/);
});
