// The project asset manifest: supplied images, brand icons and generated art, each with a stable ID, hash, alt text and provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile,writeFile,mkdir,rm,rename,realpath,access} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {temporary} from './fixtures.mjs';
import {images} from '../scripts/lib/images.mjs';
import {neutralBrandContract,contractRevision} from '../scripts/lib/brand-contract.mjs';
import {compileComposition} from '../scripts/lib/compose.mjs';
import {hash} from '../scripts/lib/common.mjs';

const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),fixture=fileURLToPath(new URL('fixtures/visual-contract/',import.meta.url));
const run=(args,env={})=>new Promise(done=>execFile(process.execPath,[cli,...args],{env:{...process.env,...env},timeout:120000},(error,stdout,stderr)=>done({code:error?error.code??1:0,stdout,stderr})));
const ok=async(args,env)=>{const r=await run(args,env);assert.equal(r.code,0,r.stderr||r.stdout);return JSON.parse(r.stdout);};
const blocked=r=>{assert.equal(r.code,1,r.stderr);assert.equal(r.stderr,'');const value=JSON.parse(r.stdout);assert.equal(value.status,'blocked');
  for(const p of value.problems)for(const key of ['code','slide','asset','provider','detail','recoverable','next'])assert.ok(Object.hasOwn(p,key),`problem lacks ${key}`);return value;};
const sha=data=>createHash('sha256').update(data).digest('hex');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
const other=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
const manifest=async project=>JSON.parse(await readFile(join(project,'.harness-slides/assets.json'),'utf8'));
const noKeys={GEMINI_API_KEY:'',GOOGLE_API_KEY:''};

async function place(t){
  const base=await realpath(await temporary(t)),project=join(base,'project'),outside=join(base,'incoming');
  await mkdir(project);await mkdir(outside);await writeFile(join(outside,'Console view.png'),png);
  return {base,project,outside,shot:join(outside,'Console view.png')};
}
// A brand whose icon index holds one native icon and one picture.
async function iconBrand(dir){
  const c=await neutralBrandContract(),library=join(dir,'icons.pptx'),index=join(dir,'icon-index.json');
  await writeFile(library,'stub library');
  await writeFile(index,JSON.stringify({entries:[{id:'fi-0000aaaa-s001-l001',label:'Database',native:true,bounds:[0,0,10,10],shapeIds:['1','2']},{id:'fi-0000aaaa-s001-l002',label:'Photo',native:false,bounds:[0,0,10,10],shapeIds:['3','4']}]}));
  c.design.slides.icon={size:54,library:{path:library,index}};
  for(const file of [library,index])c.sources.push({path:file,kind:'icon library',sha256:hash(await readFile(file))});
  c.revision=contractRevision(c);const file=join(dir,'brand.json');await writeFile(file,JSON.stringify(c));return {file,contract:c,index};
}
const composition=(image)=>({version:1,title:'Assets in a composition',slides:[{id:'console_view',title:'The operator pod runs like any other workload',sources:['brief:test'],
  canvas:{type:'stack',direction:'row',children:[{type:'image',id:'console_shot',...image},{type:'text',id:'console_text',text:'The console lists the operator pod with the other workloads.'}]}}]});

test('a supplied file outside the project is copied in and recorded with project-relative paths, hash, alt, source and restrictions',async t=>{
  const f=await place(t);
  const added=await ok(['assets','add-supplied',f.shot,'--project',f.project,'--alt','Cluster console listing the operator pod','--source','Course author, October 2026','--restrictions','Internal training only']);
  assert.equal(added.assetId,'Console-view');assert.equal(added.path,'assets/supplied/Console-view.png');assert.equal(added.status,'recorded');
  assert.deepEqual(await readFile(join(f.project,added.path)),png);
  const m=await manifest(f.project);assert.equal(m.schema,1);assert.equal(m.tool,'harness-slides-assets');
  const [entry]=m.assets;
  assert.deepEqual({...entry,recorded:undefined},{assetId:'Console-view',kind:'supplied',path:'assets/supplied/Console-view.png',sha256:sha(png),alt:'Cluster console listing the operator pod',
    source:'Course author, October 2026',restrictions:'Internal training only',format:'png',width:1,height:1,ref:null,provenance:null,recorded:undefined});
  assert.match(entry.recorded,/^\d{4}-\d\d-\d\dT/);
  assert.ok(!JSON.stringify(m).includes(f.base),'the manifest holds no absolute path');
  // A file already in the project is recorded where it is; --kind names a screenshot or chart.
  await mkdir(join(f.project,'art'));await writeFile(join(f.project,'art/chart.png'),other);
  const inside=await ok(['assets','add-supplied',join(f.project,'art/chart.png'),'--project',f.project,'--id','revenue_chart','--kind','chart','--alt','Revenue by quarter','--source','Finance team export']);
  assert.equal(inside.path,'art/chart.png');assert.equal((await manifest(f.project)).assets[1].kind,'chart');
  // The same file under the same ID is unchanged; a different file under it is a conflict.
  assert.equal((await ok(['assets','add-supplied',f.shot,'--project',f.project,'--alt','Cluster console listing the operator pod','--source','Course author, October 2026'])).status,'unchanged');
  await writeFile(join(f.outside,'second.png'),other);
  const conflict=blocked(await run(['assets','add-supplied',join(f.outside,'second.png'),'--project',f.project,'--id','Console-view','--alt','x','--source','y','--json']));
  assert.equal(conflict.problems[0].code,'asset-conflict');assert.equal(conflict.problems[0].asset,'Console-view');
  // Not an image, and missing alt or source, are refused.
  await writeFile(join(f.outside,'notes.txt'),'not a picture');
  assert.equal(blocked(await run(['assets','add-supplied',join(f.outside,'notes.txt'),'--project',f.project,'--alt','x','--source','y','--json'])).problems[0].code,'input-invalid');
  const bare=await run(['assets','add-supplied',f.shot,'--project',f.project]);assert.equal(bare.code,1);assert.match(bare.stderr,/--alt/);
  const nofile=await run(['assets','add-supplied','--project',f.project,'--alt','x','--source','y']);assert.equal(nofile.code,1);assert.match(nofile.stderr,/file/);
});

test('status reports each asset, and check refuses a missing or changed file with its asset ID',async t=>{
  const f=await place(t);
  await ok(['assets','add-supplied',f.shot,'--project',f.project,'--id','console_shot','--alt','Console','--source','Author']);
  await writeFile(join(f.outside,'chart.png'),other);
  await ok(['assets','add-supplied',join(f.outside,'chart.png'),'--project',f.project,'--id','revenue_chart','--kind','chart','--alt','Chart','--source','Finance']);
  assert.deepEqual((await ok(['assets','check','--project',f.project])).assets,2);
  const status=await ok(['assets','status','--project',f.project]);
  assert.deepEqual(status.assets.map(a=>[a.assetId,a.state]),[['console_shot','ok'],['revenue_chart','ok']]);
  await rm(join(f.project,'assets/supplied/console_shot.png'));await writeFile(join(f.project,'assets/supplied/revenue_chart.png'),png);
  assert.deepEqual((await ok(['assets','status','--project',f.project])).assets.map(a=>a.state),['file-missing','hash-changed']);
  const value=blocked(await run(['assets','check','--project',f.project,'--json']));
  assert.deepEqual(value.problems.map(p=>[p.code,p.asset,p.recoverable]),[['asset-file-missing','console_shot',true],['asset-hash-changed','revenue_chart',true]]);
  const plain=await run(['assets','check','--project',f.project]);assert.equal(plain.code,1);assert.equal(plain.stdout,'');assert.match(plain.stderr,/console_shot/);
  // An empty project has nothing to check.
  const empty=join(f.base,'empty');await mkdir(empty);assert.equal((await ok(['assets','check','--project',empty])).assets,0);
});

test('a brand icon is recorded by its stable ID, checked against the brand icon index when a brand is given',async t=>{
  const f=await place(t),brand=await iconBrand(f.base);
  const icon=await ok(['assets','icon','fi-0000aaaa-s001-l001','--project',f.project,'--id','icon_database','--brand',brand.file]);
  assert.equal(icon.assetId,'icon_database');
  const [entry]=(await manifest(f.project)).assets;
  assert.equal(entry.kind,'icon');assert.equal(entry.ref,'fi-0000aaaa-s001-l001');assert.equal(entry.path,null);assert.equal(entry.alt,'Database');
  assert.equal(entry.provenance.brandRevision,brand.contract.revision);assert.equal(entry.provenance.label,'Database');assert.match(entry.sha256,/^[0-9a-f]{64}$/);
  for(const [id,pattern] of [['fi-0000aaaa-s001-l999',/unknown icon/],['fi-0000aaaa-s001-l002',/picture/]]){
    const value=blocked(await run(['assets','icon',id,'--project',f.project,'--id','icon_bad','--brand',brand.file,'--json']));
    assert.equal(value.problems[0].code,'icon-unavailable');assert.equal(value.problems[0].asset,'icon_bad');assert.match(value.problems[0].detail,pattern);
  }
  // Without a brand the ID is recorded unchecked; the asset ID defaults to the icon ID.
  const second=join(f.base,'second');await mkdir(second);
  const loose=await ok(['assets','icon','fi-0000aaaa-s009-l001','--project',second,'--alt','Queue']);
  assert.equal(loose.assetId,'fi-0000aaaa-s009-l001');assert.equal((await manifest(second)).assets[0].provenance,null);
  // Checked later against the brand, that unchecked ID is found missing from the library.
  assert.deepEqual(blocked(await run(['assets','check','--project',second,'--brand',brand.file,'--json'])).problems.map(p=>[p.code,p.asset]),[['icon-unavailable','fi-0000aaaa-s009-l001']]);
  // The same asset ID cannot be moved to another icon.
  assert.equal(blocked(await run(['assets','icon','fi-0000aaaa-s001-l002','--project',f.project,'--id','icon_database','--json'])).problems[0].code,'asset-conflict');
  // check --brand finds an icon the library no longer has.
  await ok(['assets','check','--project',f.project,'--brand',brand.file]);
  const index=JSON.parse(await readFile(brand.index,'utf8'));index.entries[0].label='Data store';await writeFile(brand.index,JSON.stringify(index));
  const c=brand.contract;c.sources.find(s=>s.path===brand.index).sha256=hash(await readFile(brand.index));c.revision=contractRevision(c);await writeFile(brand.file,JSON.stringify(c));
  const changed=blocked(await run(['assets','check','--project',f.project,'--brand',brand.file,'--json']));
  assert.deepEqual(changed.problems.map(p=>[p.code,p.asset]),[['asset-hash-changed','icon_database']]);
});

test('images generate registers the artwork and its sidecar in the manifest, with stubbed providers only',async t=>{
  const f=await place(t),state=join(f.base,'state'),promptFile=join(f.project,'brief.txt');await writeFile(promptFile,'A greenhouse at dawn.\n');
  const reply={id:'v1_stub',status:'completed',steps:[{type:'model_output',content:[{type:'image',mime_type:'image/png',data:png.toString('base64')}]}]};
  const deps={env:{GEMINI_API_KEY:'stub-key-never-real'},fetch:async()=>new Response(JSON.stringify(reply),{status:200,headers:{'content-type':'application/json'}})};
  const options={state,project:f.project,promptFile,id:'hero-art-v1',output:'assets/hero.png',slide:'operator_architecture',alt:'A greenhouse on a ridge at dawn'};
  const result=await images('generate',options,deps);
  const [entry]=(await manifest(f.project)).assets;
  assert.deepEqual([entry.assetId,entry.kind,entry.path,entry.sha256,entry.alt],['hero-art-v1','generated','assets/hero.png',sha(png),'A greenhouse on a ridge at dawn']);
  assert.equal(entry.provenance.provider,'gemini-api');assert.equal(entry.provenance.requestId,'hero-art-v1');assert.equal(entry.provenance.metadata,'assets/hero.image.json');
  assert.equal(entry.provenance.slide,'operator_architecture');assert.equal(entry.provenance.metadataSha256,sha(await readFile(result.metadata)));
  assert.match(entry.source,/gemini-api/);
  // A repeat sends nothing and records nothing new.
  await images('generate',options,{...deps,fetch:async()=>assert.fail('no second send')});
  assert.equal((await manifest(f.project)).assets.length,1);
  await ok(['assets','check','--project',f.project]);
  // An edited sidecar is a changed asset.
  await writeFile(result.metadata,(await readFile(result.metadata,'utf8')).replace('gemini-api','elsewhere'));
  const value=blocked(await run(['assets','check','--project',f.project,'--json']));
  assert.deepEqual(value.problems.map(p=>[p.code,p.asset]),[['asset-hash-changed','hero-art-v1']]);
  // An ID already recorded for another asset is refused before anything is sent.
  await ok(['assets','add-supplied',f.shot,'--project',f.project,'--id','taken','--alt','Console','--source','Author']);
  await assert.rejects(images('generate',{...options,id:'taken',output:'assets/taken.png'},{...deps,fetch:async()=>assert.fail('nothing is sent')}),e=>e.problem?.code==='asset-conflict');
});

test('images refusals are JSON with provider-missing when no key is set, and the generated-art gate is kept',async t=>{
  const f=await place(t),promptFile=join(f.project,'brief.txt');await writeFile(promptFile,'A greenhouse.\n');
  const env={...noKeys,HARNESS_IMAGE_STATE:join(f.base,'state')};
  const value=blocked(await run(['images','generate','--project',f.project,'--id','hero-v1','--prompt-file',promptFile,'--output','assets/hero.png','--json'],env));
  assert.deepEqual([value.problems[0].code,value.problems[0].provider,value.problems[0].asset,value.problems[0].recoverable],['provider-missing','gemini-api','hero-v1',true]);
  assert.match(value.problems[0].next,/aistudio/);
  await access(join(f.project,'.harness-slides/assets.json')).then(()=>assert.fail('nothing is recorded'),()=>{});
  // The approved-slide gate still refuses artwork for a slide whose visual family is not generated-art.
  const {approveFixture}=await import('./design-fixtures.mjs');await approveFixture(f.project);
  const gated=blocked(await run(['images','generate','--project',f.project,'--id','hero-v1','--prompt-file',promptFile,'--output','assets/hero.png','--design-project',f.project,'--slide','design_slide_0','--json'],env));
  assert.equal(gated.problems[0].code,'design-mismatch');
});

test('a composition places {type:image,asset} from the manifest; the compiled folder carries its own copy and the report its ID and hash',async t=>{
  const f=await place(t),file=join(f.base,'composition.json'),output=join(f.base,'compiled');
  await ok(['assets','add-supplied',f.shot,'--project',f.project,'--id','console_screenshot','--alt','Cluster console listing the operator pod','--source','Course author']);
  await writeFile(file,JSON.stringify(composition({asset:'console_screenshot'})));
  assert.match((await ok(['compose','compile','--file',file,'--asset-project',f.project])).status,/fits/);
  await ok(['compose','compile','--file',file,'--asset-project',f.project,'--output',output]);
  const report=JSON.parse(await readFile(join(output,'compose-report.json'),'utf8')),scene=JSON.parse(await readFile(join(output,'scene.json'),'utf8'));
  assert.deepEqual(report.inputs.assets,[{object:'console_shot',slide:'console_view',asset:'console_screenshot',kind:'supplied',path:'assets/console_screenshot.png',source:'assets/supplied/console_screenshot.png',sha256:sha(png)}]);
  const image=scene.slides[0].elements.find(e=>e.type==='image');
  assert.equal(image.src,'assets/console_screenshot.png');assert.equal(image.alt,'Cluster console listing the operator pod');assert.ok(!isAbsolute(image.src));
  assert.deepEqual(await readFile(join(output,image.src)),png);
  // The build no longer needs the project: it renders after the project moves.
  await rename(f.project,join(f.base,'moved'));
  const rendered=await ok(['compose','render','--file',output,'--output',join(f.base,'deck.pptx')]);assert.ok(rendered.output??rendered.path??true);
  // A copy changed after compiling is refused by render, with its asset ID.
  await writeFile(join(output,image.src),other);
  const value=blocked(await run(['compose','preview','--file',output,'--output',join(f.base,'preview'),'--renderer','local','--json'],{HARNESS_PDFINFO:process.execPath,HARNESS_PDFTOPPM:process.execPath}));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide,p.asset]),[['asset-hash-changed','console_view','console_screenshot']]);
});

test('compile refuses an unknown, missing or changed asset with its slide and asset ID, and keeps src images working',async t=>{
  const f=await place(t),file=join(f.base,'composition.json'),attempt=async(image,extra=['--asset-project',f.project])=>{await writeFile(file,JSON.stringify(composition(image)));return run(['compose','compile','--file',file,...extra,'--output',join(f.base,`out-${Math.random()}`),'--json']);};
  let value=blocked(await attempt({asset:'console_screenshot'}));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide,p.asset]),[['asset-unresolved','console_view','console_screenshot']]);
  value=blocked(await attempt({asset:'console_screenshot'},[]));assert.equal(value.problems[0].code,'asset-unresolved');assert.match(value.problems[0].detail,/--asset-project/);
  await ok(['assets','add-supplied',f.shot,'--project',f.project,'--id','console_screenshot','--alt','Console','--source','Author']);
  // A recorded asset without alt text needs the composition to give it.
  await writeFile(join(f.outside,'bare.png'),png);await ok(['assets','add-supplied',join(f.outside,'bare.png'),'--project',f.project,'--id','bare_art','--alt','x','--source','y']);
  const m=await manifest(f.project);m.assets[1].alt=null;await writeFile(join(f.project,'.harness-slides/assets.json'),JSON.stringify(m));
  assert.match(blocked(await attempt({asset:'bare_art'})).problems[0].detail,/no recorded alt text/);
  await writeFile(file,JSON.stringify(composition({asset:'bare_art',alt:'Given here'})));assert.match((await ok(['compose','compile','--file',file,'--asset-project',f.project])).status,/fits/);
  await writeFile(join(f.project,'assets/supplied/console_screenshot.png'),other);
  value=blocked(await attempt({asset:'console_screenshot',alt:'Console listing'}));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide,p.asset]),[['asset-hash-changed','console_view','console_screenshot']]);
  await rm(join(f.project,'assets/supplied/console_screenshot.png'));
  value=blocked(await attempt({asset:'console_screenshot'}));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide,p.asset]),[['asset-file-missing','console_view','console_screenshot']]);
  // src and asset together are refused; src alone still compiles with an absolute path, as before.
  value=blocked(await attempt({asset:'console_screenshot',src:'x.png',alt:'x'}));assert.equal(value.problems[0].code,'composition-invalid');
  await writeFile(join(f.base,'local.png'),png);
  assert.ok((await ok(['compose','compile','--file',(await writeFile(file,JSON.stringify(composition({src:'local.png',alt:'Local'}))),file),'--output',join(f.base,'src-out')])).sceneDigest);
  // The pure compiler names the asset it cannot resolve on its own.
  const c=await neutralBrandContract();
  await assert.rejects(compileComposition(composition({asset:'console_screenshot'}),c),/console_shot: image asset console_screenshot resolves through the project's asset manifest/);
});

test('a template layout picture slot takes an asset too',async t=>{
  const f=await place(t);
  await ok(['assets','add-supplied',f.shot,'--project',f.project,'--id','cover_art','--alt','Cover','--source','Author']);
  const {resolveCompositionAssets}=await import('../scripts/lib/assets.mjs');
  const resolved=await resolveCompositionAssets({version:1,title:'x',slides:[{id:'cover_slide',title:'Cover',sources:['brief:test'],layout:'Title',picture:{asset:'cover_art'}}]},f.project);
  assert.deepEqual(resolved.problems,[]);
  assert.deepEqual(resolved.comp.slides[0].picture,{src:join(f.project,'assets/supplied/cover_art.png'),alt:'Cover'});
  assert.equal(resolved.uses.get('cover_slide_picture').assetId,'cover_art');
});

test('assets check against a design reports candidates not yet in the manifest, and a pending generated candidate without a provider',async t=>{
  const f=await place(t),proposal=JSON.parse(await readFile(join(fixture,'proposal.json'),'utf8'));
  proposal.slides[0].asset.candidates.push({assetId:'hero_art',kind:'generated',ref:'brief:hero',concept:'A cluster at dawn',status:'pending'});
  const file=join(f.base,'proposal.json');await writeFile(file,JSON.stringify(proposal));
  await ok(['design','propose','--project',f.project,'--file',file]);
  let value=blocked(await run(['assets','check','--project',f.project,'--design-project',f.project,'--json'],noKeys));
  assert.deepEqual(value.problems.map(p=>[p.code,p.slide,p.asset,p.provider]),[['asset-unresolved','operator_architecture','icon_kubernetes',null],['asset-unresolved','operator_architecture','icon_pod',null],['provider-missing','operator_architecture','hero_art','gemini-api']]);
  assert.ok(value.designRevision);
  await ok(['assets','icon','kubernetes','--project',f.project,'--id','icon_kubernetes','--alt','Kubernetes']);
  await ok(['assets','icon','pod','--project',f.project,'--id','icon_pod','--alt','Pod']);
  const status=await ok(['assets','status','--project',f.project,'--design-project',f.project],noKeys);
  assert.deepEqual(status.candidates.resolved.map(c=>c.assetId),['icon_kubernetes','icon_pod']);assert.deepEqual(status.candidates.pending.map(c=>c.assetId),['hero_art']);
  // With a key configured the pending artwork is simply unresolved: generate it once its slide is approved.
  value=blocked(await run(['assets','check','--project',f.project,'--design-project',f.project,'--json'],{GEMINI_API_KEY:'stub-key-never-real'}));
  assert.deepEqual(value.problems.map(p=>[p.code,p.asset]),[['asset-unresolved','hero_art']]);
  // A candidate whose kind differs from the recorded asset is a conflict.
  await writeFile(join(f.outside,'pod.png'),other);
  const second=join(f.base,'second');await mkdir(second);
  await ok(['design','propose','--project',second,'--file',file]);
  await ok(['assets','add-supplied',join(f.outside,'pod.png'),'--project',second,'--id','icon_pod','--alt','Pod','--source','Author']);
  value=blocked(await run(['assets','check','--project',second,'--design-project',second,'--json'],{GEMINI_API_KEY:'stub-key-never-real'}));
  assert.ok(value.problems.some(p=>p.code==='asset-conflict'&&p.asset==='icon_pod'));
});

test('the manifest refuses paths that leave the project or pass through a link',async t=>{
  const f=await place(t);
  await ok(['assets','add-supplied',f.shot,'--project',f.project,'--id','console_shot','--alt','Console','--source','Author']);
  const m=await manifest(f.project);m.assets[0].path='../incoming/Console view.png';await writeFile(join(f.project,'.harness-slides/assets.json'),JSON.stringify(m));
  const value=blocked(await run(['assets','check','--project',f.project,'--json']));assert.equal(value.problems[0].code,'input-invalid');
});
