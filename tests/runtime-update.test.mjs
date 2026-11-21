// Nothing a person has saved is tied to one installed version: an update replaces the code behind one stable address,
// removes the old folder, and saved tasks, compiled builds, previews and critiques carry on.
// Every test installs into a temporary home and shared folder; none touches this computer's installation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,readlink,lstat,rm,cp,symlink,realpath,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,relative} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {install} from '../scripts/install.mjs';
import {checkBrandSources,neutralBrandContract,contractRevision} from '../scripts/lib/brand-contract.mjs';
import {encodePng} from '../scripts/lib/contact-sheet.mjs';
import {brand as templateBrand} from './native-fixtures.mjs';

const exec=promisify(execFile),repo=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(await readFile(join(repo,'package.json'),'utf8'));
const roots=['SKILL.md','LICENSE','NOTICE.md','package.json','package-lock.json','bootstrap','guidance','references','scripts','examples'];
const node=async(...args)=>(await exec(process.execPath,args,{maxBuffer:16*1024*1024})).stdout;
async function sandbox(t){
  const dir=await realpath(await mkdtemp(join(tmpdir(),'harness-update-')));
  t.after(async()=>{await exec('chmod',['-R','u+rwX',dir]).catch(()=>{});await rm(dir,{recursive:true,force:true});});
  return {dir,home:join(dir,'home'),shared:join(dir,'shared'),current:join(dir,'shared','current')};
}
// The next release: the same package with a later version, so its files and its content digest differ.
async function newerSource(dir,version='99.0.0'){
  const source=join(dir,'source-'+version);await mkdir(source);
  for(const name of roots)await cp(join(repo,name),join(source,name),{recursive:true});
  const edit=async(name,change)=>{const value=JSON.parse(await readFile(join(source,name),'utf8'));change(value);await writeFile(join(source,name),JSON.stringify(value,null,2)+'\n');};
  await edit('package.json',p=>{p.version=version;});await edit('package-lock.json',p=>{p.version=version;p.packages[''].version=version;});
  return source;
}
const folders=async shared=>(await readdir(join(shared,'versions'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
// The installer leaves the engine's packages to npm; these tests lend the checkout's instead.
const lendPackages=(shared,id)=>symlink(join(repo,'node_modules'),join(shared,'versions',id,'node_modules'));

test('an update leaves exactly one version folder, repoints skill links from an old version folder and leaves foreign entries alone',async t=>{
  const {dir,home,shared,current}=await sandbox(t),skill=name=>join(home,name,'skills','harness-slides');
  const claude=skill('.claude'),agents=skill('.agents'),cursor=skill('.cursor'),codex=skill('.codex'),targets=[agents,claude,cursor,codex];
  const first=await install({home,shared,targets});
  assert.equal(first.status,'installed');assert.equal(first.runtime,current);assert.deepEqual(await folders(shared),[first.versionId]);assert.deepEqual(first.removedVersions,[]);
  assert.equal(first.versionId,`${pkg.version}-${first.contentDigest.slice(0,20)}`);
  for(const target of targets)assert.equal(await readlink(target),current);
  // What earlier layouts or another tool could have left: links straight into a version folder (absolute and relative),
  // a link to someone else's skill, and a real folder.
  const old=join(shared,'versions',first.versionId),foreign=join(dir,'someone-elses-skill');
  await rm(claude);await symlink(old,claude);
  await rm(agents);await symlink(relative(dirname(agents),old),agents);
  await mkdir(foreign);await writeFile(join(foreign,'SKILL.md'),'Theirs');await rm(cursor);await symlink(foreign,cursor);
  await rm(codex);await mkdir(codex);await writeFile(join(codex,'SKILL.md'),'A folder someone made');
  // Other things in the versions folder: an abandoned stage, a link to a folder elsewhere, and a file.
  const outside=join(dir,'outside');await mkdir(outside);await writeFile(join(outside,'keep.txt'),'Not this installation');
  await mkdir(join(shared,'versions','.stage-abandoned'));await symlink(outside,join(shared,'versions','linked'));await writeFile(join(shared,'versions','.DS_Store'),'');
  await lendPackages(shared,first.versionId);

  const second=await install({source:await newerSource(dir),home,shared,targets});
  assert.equal(second.status,'installed');assert.equal(second.runtime,current);assert.equal(second.runtimeVersion,'99.0.0');assert.notEqual(second.versionId,first.versionId);
  assert.deepEqual(await folders(shared),[second.versionId]);assert.deepEqual([...second.removedVersions].sort(),['.stage-abandoned',first.versionId].sort());
  assert.equal(await readlink(current),'versions/'+second.versionId);
  // Links into the old version folder now point at the stable address; nothing else was touched, and all of it is reported.
  assert.equal(await readlink(claude),current);assert.equal(await readlink(agents),current);assert.deepEqual([...second.repointed].sort(),[agents,claude].sort());
  assert.equal(await readlink(cursor),foreign);assert.equal(await readFile(join(foreign,'SKILL.md'),'utf8'),'Theirs');
  assert.equal((await lstat(codex)).isDirectory(),true);assert.equal(await readFile(join(codex,'SKILL.md'),'utf8'),'A folder someone made');
  assert.deepEqual(second.skipped.map(s=>s.target).sort(),[codex,cursor].sort());assert.match(second.skipped.find(s=>s.target===cursor).reason,/someone-elses-skill.*left alone/);assert.match(second.skipped.find(s=>s.target===codex).reason,/did not make.*left alone/);
  // A link inside versions is neither followed nor removed, and the packages a version borrowed by link are still there.
  assert.equal(await readlink(join(shared,'versions','linked')),outside);assert.equal(await readFile(join(outside,'keep.txt'),'utf8'),'Not this installation');
  assert.deepEqual(second.keptVersions.map(k=>k.path),[join(shared,'versions','linked')]);assert.equal((await lstat(join(repo,'node_modules'))).isDirectory(),true);
  assert.equal((await node(join(claude,'scripts/harness-slides.mjs'),'--version')).trim(),'Harness Slides 99.0.0');
  // A dry run reports the same plan without changing anything.
  const plan=await install({home,shared,targets,dryRun:true});
  assert.equal(plan.runtime,current);assert.deepEqual(plan.skipped.map(s=>s.target).sort(),[codex,cursor].sort());assert.deepEqual(await folders(shared),[second.versionId]);

  // A version folder that cannot be removed is reported; the install still succeeds and the pointer has moved.
  if(process.getuid?.()!==0){
    const stuck=join(shared,'versions','0.0.1-stuck');await mkdir(join(stuck,'inner'),{recursive:true});await writeFile(join(stuck,'inner','file'),'x');await chmod(join(stuck,'inner'),0o555);
    const third=await install({home,shared,targets});
    assert.equal(third.status,'installed');assert.equal(third.versionId,first.versionId);assert.equal(await readlink(current),'versions/'+first.versionId);
    assert.deepEqual(third.removedVersions,[second.versionId]);assert.deepEqual(third.keptVersions.map(k=>k.path).sort(),[stuck,join(shared,'versions','linked')].sort());
    assert.deepEqual(await folders(shared),['0.0.1-stuck',first.versionId].sort());
    await chmod(join(stuck,'inner'),0o755);
  }
  // When the pointer cannot be moved, no version is removed.
  const before=await folders(shared),pointer=await readlink(current);await rm(current);await mkdir(current);
  await assert.rejects(install({source:join(dir,'source-99.0.0'),home,shared,targets}),/Unrecognized shared pointer/);
  assert.deepEqual(await folders(shared),before);await rm(current,{recursive:true});await symlink(pointer,current);
});

test('helpers run through the installed pointer and a skill link, and saved work survives the update behind them',async t=>{
  const {dir,home,shared,current}=await sandbox(t),first=await install({home,shared}),link=join(home,'.claude','skills','harness-slides');
  for(const base of [current,link]){
    const version=JSON.parse(await node(join(base,'scripts/harness-slides.mjs'),'version'));
    assert.equal(version.runtime,current);assert.equal(version.runtimeVersion,pkg.version);assert.ok(version.capabilities.includes('stable-runtime'));
    assert.equal((await node(join(base,'scripts/harness-slides.mjs'),'--version')).trim(),'Harness Slides '+pkg.version);
    assert.match(await node(join(base,'scripts/sync-guidance.mjs'),'--help'),/^Usage: node scripts\/sync-guidance\.mjs/);
    // The installer's own entry check resolves links, so it runs from the installed copy too.
    const plan=JSON.parse(await node(join(base,'scripts/install.mjs'),'--dry-run','--home',home,'--shared',shared));
    assert.equal(plan.status,'dry run');assert.equal(plan.runtime,current);assert.equal(plan.versionId,first.versionId);
  }
  const doctor=JSON.parse(await node(join(link,'scripts/harness-slides.mjs'),'doctor'));assert.equal(doctor.runtime,current);assert.equal(doctor.runtimeVersion,pkg.version);

  // New work, started the way a caller does: by importing the installed helper, which Node loads from the version folder.
  const source=join(dir,'guidance-source'),project=join(dir,'content');await mkdir(join(source,'guidance'),{recursive:true});await mkdir(join(source,'references'));await mkdir(project);
  await writeFile(join(source,'SKILL.md'),'---\nname: harness-slides\n---\nSaved guidance\n');await writeFile(join(source,'references/design.md'),'A reference');
  await writeFile(join(source,'guidance/manifest.json'),JSON.stringify({schema:1,skill:'harness-slides',entry:'SKILL.md',minimumRuntime:'0.2.0'}));
  await exec('git',['init','-q','--initial-branch=main',source]);await exec('git',['-C',source,'add','.']);
  await exec('git',['-C',source,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','Fixture guidance']);
  const helper=await import(pathToFileURL(join(link,'scripts/sync-guidance.mjs')).href),started=await helper.start({project,source});
  assert.equal(started.runtime,current);assert.equal(started.runtimeVersion,pkg.version);
  const resumeCli=async()=>JSON.parse(await node(join(started.runtime,'scripts/sync-guidance.mjs'),'resume','--project',project,'--task',started.task));
  const same=await resumeCli();assert.equal(same.runtime,current);assert.equal(same.runtimeDigest,started.runtimeDigest);assert.equal('notice' in same,false);

  // The update: the old folder is gone, and the recorded runtime path still runs, now as the new version.
  const second=await install({source:await newerSource(dir),home,shared});
  assert.deepEqual(await folders(shared),[second.versionId]);await assert.rejects(lstat(join(shared,'versions',first.versionId)),/ENOENT/);
  const continued=await resumeCli();
  assert.equal(continued.runtime,current);assert.equal(continued.runtimeVersion,'99.0.0');assert.equal(continued.startedRuntimeVersion,pkg.version);assert.equal(continued.task,started.task);
  assert.match(continued.notice,new RegExp(`started on runtime ${pkg.version.replaceAll('.','\\.')} and continues on the installed 99\\.0\\.0`));
  assert.match(await readFile(continued.guidance,'utf8'),/Saved guidance/);
  assert.equal(JSON.parse(await node(join(started.runtime,'scripts/harness-slides.mjs'),'version')).runtimeVersion,'99.0.0');
});

const png=encodePng({width:16,height:9,rgb:Buffer.alloc(16*9*3,200)});
function fakeRenderer(){
  const run=async(command,args)=>{
    if(args[0]==='-v'||args[0]==='--version')return {stdout:'fixture renderer v1'};
    if(command==='fc-list')return {stdout:join(repo,'package.json')};
    if(command==='pdfinfo')return {stdout:'Pages: 1'};
    if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png',png);return {stdout:''};}
    if(command==='soffice'){await writeFile(join(args[args.indexOf('--outdir')+1],'deck.pdf'),'%PDF-1.7 fixture');return {stdout:''};}
    throw new Error(`Unexpected fixture command ${command}`);
  };return {run};
}
// Every file under a folder, any depth, whose bytes contain the given text.
async function naming(root,text,within=''){
  const found=[];
  for(const entry of await readdir(join(root,within),{withFileTypes:true})){
    const name=within?`${within}/${entry.name}`:entry.name;
    if(entry.isDirectory())found.push(...await naming(root,text,name));
    else if(entry.isFile()&&(await readFile(join(root,name))).includes(text))found.push(name);
  }
  return found;
}
const composition=()=>({version:1,title:'Flow',slides:[{id:'flow_slide',title:'Requests move between services',sources:['request'],notes:'A request moves from A to B.',canvas:{type:'stack',direction:'row',gap:'wide',children:[{type:'box',id:'first_card',children:[{type:'text',id:'first_label',text:'Source'}]},{type:'box',id:'second_card',text:'Destination'}]},connect:[{id:'flow_arrow',from:'first_card',to:'second_card',route:'elbow'}]}]});
const answers=result=>({deckSha256:result.deckSha256,reviewer:'author',slides:result.slides.map(s=>({id:s.id,answers:Array(8).fill(true),note:`SCRIPTED FIXTURE inspected ${s.id}; not visual acceptance.`})),findings:[]});
// The installed copy's own modules, as a command run through the pointer loads them: Node resolves the pointer to the
// version folder when a process starts. This one process outlives an update, so it resolves the pointer afresh each time.
const installed=async current=>{const folder=await realpath(current),load=name=>import(pathToFileURL(join(folder,'scripts/lib',name)).href);return {file:await load('compose-file.mjs'),preview:await load('compose-preview.mjs'),project:await load('composition-project.mjs'),brand:await load('brand-contract.mjs'),outline:await load('outline.mjs')};};

test('a project compiled, previewed and critiqued under one installed runtime continues under the next',async t=>{
  const {dir,home,shared,current}=await sandbox(t),first=await install({home,shared});await lendPackages(shared,first.versionId);
  const A=await installed(current),deps=fakeRenderer(),work=join(dir,'work');await mkdir(work);
  // Two unbranded builds: one as this version writes it, and one as 0.18.0 and earlier wrote it, with the neutral
  // defaults named by their path inside the version folder that the update is about to remove.
  const stable=await A.brand.neutralBrandContract();assert.equal(stable.sources[0].path,join(current,'guidance','unbranded-design.json'));
  const legacy=structuredClone(stable);legacy.sources[0].path=join(shared,'versions',first.versionId,'guidance','unbranded-design.json');legacy.revision=A.brand.contractRevision(legacy);
  await writeFile(join(work,'composition.json'),JSON.stringify(composition()));await writeFile(join(work,'legacy-brand.json'),JSON.stringify(legacy));
  const builds={};
  for(const [name,brand] of [['current',undefined],['legacy',join(work,'legacy-brand.json')]]){
    const root=join(work,name);await A.file.compileCompositionFile({file:join(work,'composition.json'),brand,output:root});
    const preview=await A.preview.previewComposition({file:root,output:join(work,name+'-preview'),renderer:'local'},deps);
    await writeFile(join(work,name+'-answers.json'),JSON.stringify(answers(preview)));
    builds[name]={root,preview,status:await A.project.compositionStatus(root)};
  }
  assert.equal(JSON.parse(await readFile(join(builds.legacy.root,'brand-contract.json'),'utf8')).sources[0].path,legacy.sources[0].path);
  // The current build is critiqued before the update; the legacy one is left with its critique still to record.
  await A.preview.recordCritique({file:builds.current.preview.output,assessment:join(work,'current-answers.json')});
  builds.current.status=await A.project.compositionStatus(builds.current.root);
  assert.equal(builds.current.status.status,'critiqued; show rendered output for user acceptance');assert.equal(builds.legacy.status.status,'rendered; critique required');
  // An outline started now names the stable address in its briefs and its neutral contract, not this version's folder.
  await writeFile(join(work,'outline.json'),JSON.stringify({version:1,title:'Deck',delivery:'live',direction:{focal:'headingPrimary',neutral:'canvasSecondary'},slides:[{id:'cover_slide',kind:'cover',title:'Welcome'},{id:'slide_one',kind:'content',title:'A claim',understand:'What to take away.',relation:'parallel',points:[{label:'One',text:'First thing'},{label:'Two',text:'Second thing'}],notes:'Say this.',sources:['s1']}]}));
  const started=await A.outline.startOutlineFile({file:join(work,'outline.json'),output:join(work,'outline-build')});
  const brief=await readFile(join(started.output,'briefs','section-1.md'),'utf8');assert.ok(brief.includes(`- Runtime: \`${current}\``));assert.doesNotMatch(brief,/versions\//);
  assert.equal(JSON.parse(await readFile(started.brand,'utf8')).sources[0].path,join(current,'guidance','unbranded-design.json'));
  // Nothing this version wrote into the project names its version folder; only the planted legacy contract does.
  assert.deepEqual((await naming(work,join(shared,'versions'))).sort(),['legacy-brand.json','legacy/brand-contract.json'].sort());

  const second=await install({source:await newerSource(dir),home,shared});await lendPackages(shared,second.versionId);
  assert.deepEqual(await folders(shared),[second.versionId]);await assert.rejects(readFile(legacy.sources[0].path),/ENOENT/);
  const B=await installed(current);assert.notEqual(B.preview,A.preview);
  for(const [name,build] of Object.entries(builds)){
    // What was recorded still reads the same, with no command needed to bring it forward.
    assert.deepEqual(await B.project.compositionStatus(build.root),build.status,name);
    assert.equal((await B.project.loadCompositionProject(build.root)).current.id,'v000001',name);
    // The critique of the render made before the update is still accepted for that render, once.
    if(name==='legacy')assert.equal((await B.preview.recordCritique({file:build.preview.output,assessment:join(work,name+'-answers.json')})).status,'clear');
    assert.equal((await B.project.compositionStatus(build.root)).status,'critiqued; show rendered output for user acceptance',name);
    // The next preview is drawn by the new code rather than reused, and can be critiqued; the build renders and builds.
    const again=await B.preview.previewComposition({file:build.root,output:join(work,name+'-preview-2'),renderer:'local'},deps);
    assert.equal(again.reused,false,name);assert.equal(again.slides.length,1,name);assert.equal(again.buildBinding,build.preview.buildBinding,name);
    await writeFile(join(work,name+'-answers-2.json'),JSON.stringify(answers(again)));
    assert.equal((await B.preview.recordCritique({file:again.output,assessment:join(work,name+'-answers-2.json')})).status,'clear',name);
    assert.equal((await B.file.renderCompositionDir({file:build.root,output:join(work,name+'.pptx')})).slides,1,name);
    assert.match((await B.project.buildCompositionProject(build.root)).build,/deck\.pptx$/,name);
  }
  // The outline's neutral contract compiles after the update as well.
  assert.equal((await B.file.compileCompositionFile({file:join(started.output,'lead-1.json'),brand:started.brand,project:started.output,output:join(started.output,'compiled')})).slides,1);
  // The protection of the person's deck is unchanged: an edited compiled file is still refused.
  const contractFile=join(builds.legacy.root,'brand-contract.json'),edited=JSON.parse(await readFile(contractFile,'utf8'));edited.design.colors.headingPrimary='#000000';
  await writeFile(contractFile,JSON.stringify(edited,null,2)+'\n');
  await assert.rejects(B.project.loadCompositionProject(builds.legacy.root),/Compiled project changed outside its version/);
  await assert.rejects(B.preview.previewComposition({file:builds.legacy.root,output:join(work,'edited-preview'),renderer:'local'},deps),/Brand contract changed/);
});

test('only the shipped neutral defaults are free of the installation; edits and brand authorities are still checked',async t=>{
  const {dir}=await sandbox(t),neutral=await neutralBrandContract();
  // A neutral contract whose defaults file is gone is still current: it carries its whole design under its revision.
  const moved=structuredClone(neutral);moved.sources[0].path=join(dir,'versions','0.1.0-gone','guidance','unbranded-design.json');moved.revision=contractRevision(moved);
  assert.equal((await checkBrandSources(moved)).status,'current local sources');
  // Its design cannot be edited without the revision showing it.
  const edited=structuredClone(moved);edited.design.colors.headingPrimary='#000000';await assert.rejects(checkBrandSources(edited),/Brand contract changed/);
  // A brand's own authority is checked as before: a changed or missing source refuses the contract.
  const branded=await templateBrand(dir);assert.equal((await checkBrandSources(branded)).status,'current local sources');
  await writeFile(branded.sources[0].path,'changed');await assert.rejects(checkBrandSources(branded),/Brand authority changed/);
  await rm(branded.sources[0].path);await assert.rejects(checkBrandSources(branded),/ENOENT/);
  // Calling a brand's source "neutral design defaults" does not exempt it, nor does naming a native template that way.
  const posing=await templateBrand(await mkdtemp(join(dir,'posing-')));posing.sources[0].kind='neutral design defaults';posing.revision=contractRevision(posing);
  await writeFile(posing.sources[0].path,'changed');await assert.rejects(checkBrandSources(posing),/Brand authority changed/);
  const unbranded=await templateBrand(await mkdtemp(join(dir,'unbranded-')));unbranded.identity={id:'unbranded',variant:'default'};unbranded.sources[0].kind='neutral design defaults';unbranded.revision=contractRevision(unbranded);
  await writeFile(unbranded.sources[0].path,'changed');await assert.rejects(checkBrandSources(unbranded),/Brand authority changed/);
});
