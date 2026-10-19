import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {temporary} from './fixtures.mjs';
import {brand,part,audit} from './native-fixtures.mjs';
import {compileCompositionFile,renderCompositionDir} from '../scripts/lib/compose-file.mjs';
import {previewComposition,recordCritique,verifyCriticPacket} from '../scripts/lib/compose-preview.mjs';
import {encodePng} from '../scripts/lib/contact-sheet.mjs';
import {startOutlineFile,checkOutlineFile} from '../scripts/lib/outline.mjs';
import {loadCompositionProject,editCompositionProject,restoreCompositionProject,buildCompositionProject,compositionStatus} from '../scripts/lib/composition-project.mjs';
import {startStudio} from '../scripts/lib/studio.mjs';
import {diagnose} from '../scripts/lib/doctor.mjs';

const png=encodePng({width:16,height:9,rgb:Buffer.alloc(16*9*3,200)});
const comp=()=>({version:1,title:'Flow',slides:[{id:'flow_slide',title:'Requests move between services',sources:['request'],notes:'A request moves from A to B.',canvas:{type:'stack',direction:'row',gap:'wide',children:[{type:'box',id:'first_card',children:[{type:'text',id:'first_label',text:'Source'}]},{type:'box',id:'second_card',text:'Destination'}]},connect:[{id:'flow_arrow',from:'first_card',to:'second_card',route:'elbow'}]}]});
export function fakeRenderer(count=1){
  const calls=[];const run=async(command,args)=>{
    calls.push([command,...args]);if(args[0]==='-v'||args[0]==='--version')return {stdout:'fixture renderer v1'};
    if(command==='fc-list')return {stdout:join(process.cwd(),'package.json')};
    if(command==='pdfinfo')return {stdout:`Pages: ${count}`};
    if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png',png);return {stdout:''};}
    if(command==='soffice'){await writeFile(join(args[args.indexOf('--outdir')+1],'deck.pdf'),'%PDF-1.7 fixture');return {stdout:''};}
    throw new Error(`Unexpected fixture command ${command}`);
  };return {calls,deps:{run}};
}
async function build(t,extra={}){const dir=await temporary(t),file=join(dir,'source.json'),output=join(dir,'compiled');await writeFile(file,JSON.stringify(comp()));await compileCompositionFile({file,output,...extra});return {dir,file,output};}
const assessment=result=>({deckSha256:result.deckSha256,reviewer:'author',slides:result.slides.map(s=>({id:s.id,answers:Array(8).fill(true),note:`SCRIPTED FIXTURE inspected ${s.id}; not visual acceptance.`})),findings:[]});

test('neutral and template compositions retain native groups, attachments, notes and routed edges',async t=>{
  for(const branded of [false,true]){
    const dir=await temporary(t),file=join(dir,'source.json'),output=join(dir,'compiled'),brandFile=join(dir,'brand.json');
    if(branded)await writeFile(brandFile,JSON.stringify(await brand(dir)));
    await writeFile(file,JSON.stringify(comp()));await compileCompositionFile({file,output,...(branded?{brand:brandFile}:{})});
    const deck=join(dir,'deck.pptx'),result=await renderCompositionDir({file:output,output:deck}),xml=await part(deck,'ppt/slides/harnessSlide1.xml');
    assert.match(xml,/<p:grpSp>/);assert.match(xml,/<a:stCxn /);assert.match(xml,/<a:endCxn /);assert.deepEqual(result.native[0].attached,['flow_arrow']);
    assert.deepEqual(await audit(deck),[]);assert.match(await part(deck,'ppt/notesSlides/harnessNotes1.xml'),/A request moves from A to B/);
  }
});

test('direct source images are immutable and portable, and corrupted copies are refused',async t=>{
  const dir=await temporary(t),original=join(dir,'picture.png'),file=join(dir,'source.json'),output=join(dir,'compiled');await writeFile(original,png);
  const c=comp();c.slides[0].canvas={type:'image',id:'picture_node',src:'picture.png',alt:'Fixture'};delete c.slides[0].connect;await writeFile(file,JSON.stringify(c));
  await compileCompositionFile({file,output});await writeFile(original,Buffer.from('changed original'));await rm(original);
  const moved=join(dir,'moved');await rename(output,moved);await renderCompositionDir({file:moved,output:join(dir,'portable.pptx')});
  const scene=JSON.parse(await readFile(join(moved,'scene.json'),'utf8')),image=scene.slides[0].elements.find(e=>e.type==='image');assert.match(image.src,/^assets\//);
  await writeFile(join(moved,image.src),'corrupt');await assert.rejects(()=>renderCompositionDir({file:moved,output:join(dir,'bad.pptx')}),/changed since it was compiled/);
});

test('critique requires complete per-slide answers and unchanged real artifacts',async t=>{
  const {dir,output}=await build(t),fixture=fakeRenderer(),preview=join(dir,'preview'),result=await previewComposition({file:output,output:preview,renderer:'local'},fixture.deps),file=join(dir,'answers.json');
  await writeFile(file,JSON.stringify({deckSha256:result.deckSha256,reviewer:'author',findings:[]}));await assert.rejects(()=>recordCritique({file:preview,assessment:file}),/every question for every slide/);
  await writeFile(file,JSON.stringify(assessment(result)));const receipt=await recordCritique({file:preview,assessment:file});assert.equal(receipt.status,'clear');
  await rm(result.slides[0].image);await assert.rejects(async()=>verifyCriticPacket(preview,JSON.parse(await readFile(result.critic,'utf8'))),/ENOENT/);
  const next=await previewComposition({file:output,output:join(dir,'fresh'),renderer:'local'},fixture.deps);await writeFile(next.deck,'tampered');await assert.rejects(()=>recordCritique({file:join(dir,'fresh'),assessment:file}),/artifact changed/);
});

test('native bundles reuse unchanged pixels across locations and invalidate corruption without copying judgments',async t=>{
  const {dir,output}=await build(t),fixture=fakeRenderer(),first=await previewComposition({file:output,output:join(dir,'one'),renderer:'local'},fixture.deps);
  const before=fixture.calls.filter(c=>c[0]==='soffice'&&c[1]!=='--version').length;
  await writeFile(join(dir,'answers.json'),JSON.stringify(assessment(first)));await recordCritique({file:join(dir,'one'),assessment:join(dir,'answers.json')});
  const second=await previewComposition({file:output,output:join(dir,'two'),renderer:'local'},fixture.deps);
  assert.equal(second.reused,true);assert.equal(second.deckSha256,first.deckSha256);assert.equal(fixture.calls.filter(c=>c[0]==='soffice'&&c[1]!=='--version').length,before);
  const selected=await previewComposition({file:output,output:join(dir,'selected'),slide:'flow_slide',renderer:'local'},fixture.deps);assert.equal(selected.reused,true);assert.equal(fixture.calls.filter(c=>c[0]==='soffice'&&c[1]!=='--version').length,before);assert.equal(selected.critic,undefined);
  const deliverable=await renderCompositionDir({file:output,output:join(dir,'deliver.pptx')});assert.equal(deliverable.sha256,first.deckSha256);assert.equal(deliverable.reused,true);
  await assert.rejects(()=>readFile(join(dir,'two','critique.json')),/ENOENT/);
  const {readdir}=await import('node:fs/promises'),cache=join(dir,'.harness-slides','render-bundles'),key=(await readdir(cache)).find(n=>/^[a-f0-9]{64}$/.test(n));await rm(join(cache,key,'deck.pptx'));
  const third=await previewComposition({file:output,output:join(dir,'three'),renderer:'local'},fixture.deps);assert.equal(third.reused,false);
});

test('neutral tables retain the compiler row heights and a diagonal elbow keeps its route',async t=>{
  const {dir,file}=await build(t),c=comp();c.slides[0].canvas={type:'free',children:[{type:'box',id:'first_card',text:'Source',at:{x:0,y:0,width:.3,height:.3}},{type:'box',id:'second_card',text:'Destination',at:{x:.7,y:.6,width:.3,height:.3}}]};
  c.slides.push({id:'table_slide',title:'Two rows carry different amounts of text',sources:['request'],canvas:{type:'table',id:'test_table',rows:[['Name','Meaning'],['Longer\nlabel','A value']],widths:[1,2]}});await writeFile(file,JSON.stringify(c));const output=join(dir,'table-compiled');await compileCompositionFile({file,output});
  const scene=JSON.parse(await readFile(join(output,'scene.json'),'utf8')),table=scene.slides[1].elements.find(e=>e.type==='table'),deck=join(dir,'geometry.pptx');await renderCompositionDir({file:output,output:deck});
  assert.match(await part(deck,'ppt/slides/harnessSlide1.xml'),/bentConnector/);
  const xml=await part(deck,'ppt/slides/harnessSlide2.xml');assert.deepEqual([...xml.matchAll(/<a:tr h="(\d+)"/g)].map(m=>Number(m[1])),table.rowHeights.map(h=>Math.round(h*12700)));
});

test('a one-slide change reuses unaffected pages while converting a fresh native deck',async t=>{
  const dir=await temporary(t),source=join(dir,'source.json'),c=comp();c.slides.push({...structuredClone(c.slides[0]),id:'other_slide',canvas:{type:'text',id:'other_text',text:'Keep this page'},connect:[]});await writeFile(source,JSON.stringify(c));
  const fixture=fakeRenderer(2),first=join(dir,'compiled-one');await compileCompositionFile({file:source,output:first});await previewComposition({file:first,output:join(dir,'preview-one'),renderer:'local'},fixture.deps);
  fixture.calls.length=0;c.slides[0].canvas.children[1].text='Changed destination';await writeFile(source,JSON.stringify(c));const second=join(dir,'compiled-two');await compileCompositionFile({file:source,output:second});await previewComposition({file:second,output:join(dir,'preview-two'),renderer:'local'},fixture.deps);
  assert.deepEqual(fixture.calls.filter(c=>c[0]==='pdftoppm'&&c[1]==='-f').map(c=>c[2]),['1']);
});

test('neutral live outline starts with neutral layouts and a shared project record',async t=>{
  const dir=await temporary(t),file=join(dir,'outline.json');await writeFile(file,JSON.stringify({version:1,title:'Live deck',delivery:'live',direction:{focal:'headingPrimary',neutral:'canvasSecondary'},slides:[{id:'cover_slide',kind:'cover',title:'Welcome'},{id:'closing_slide',kind:'closing',title:'Next steps'}]}));
  assert.equal((await checkOutlineFile({file})).delivery,'live');const start=await startOutlineFile({file,output:join(dir,'project')});
  assert.equal(JSON.parse(await readFile(start.brand,'utf8')).medium.delivery,'live');assert.equal(JSON.parse(await readFile(join(start.output,'lead-1.json'),'utf8')).slides[0].layout,'Cover');
  const result=await compileCompositionFile({file:join(start.output,'lead-1.json'),brand:start.brand,project:start.output,output:join(start.output,'compiled')});
  assert.equal((await loadCompositionProject(start.output)).current.id,'v000001');await renderCompositionDir({file:result.output,output:join(dir,'anchors.pptx')});
});

test('composition studio edits reflow source, reject stale saves, restore, resume and keep relationships',async t=>{
  const {dir,output}=await build(t),studio=await startStudio({root:output});t.after(()=>studio.close());
  const url=new URL(studio.url),request=async(path,body)=>{const response=await fetch(studio.url+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:url.origin}:{},...(body?{body:JSON.stringify(body)}:{})});return {response,value:await response.json()};};
  const initial=(await request('state')).value;assert.equal(initial.kind,'composition');
  const edit={id:'first_label',fields:{text:'Updated source'},expectedDigest:initial.current.sceneDigest};assert.equal((await request('edit',edit)).response.status,200);assert.equal((await request('edit',edit)).response.status,400);
  let w=await loadCompositionProject(output);assert.equal(w.current.id,'v000002');assert.equal(w.composition.slides[0].canvas.children[0].children[0].text,'Updated source');
  await restoreCompositionProject({root:output,id:'v000001',expectedDigest:w.current.sceneDigest});const result=await buildCompositionProject(output);assert.match(await part(result.output,'ppt/slides/harnessSlide1.xml'),/<a:stCxn /);
  await studio.close();const moved=join(dir,'moved-project');await rename(output,moved);w=await loadCompositionProject(moved);assert.equal(w.current.id,'v000003');assert.equal((await compositionStatus(moved)).status,'built; native review required');
  assert.equal((await buildCompositionProject(moved)).status,'unchanged build');
});

test('doctor uses Poppler version flags and configured tool paths',async()=>{
  const calls=[],result=await diagnose({format:'pptx',env:{HARNESS_SOFFICE:'/custom/office',HARNESS_PDFINFO:'/custom/info',HARNESS_PDFTOPPM:'/custom/raster'},run:async(path,args)=>{calls.push([path,args]);return {stdout:'fixture version'};}});
  assert.deepEqual(calls.find(([path])=>path==='/custom/info'),['/custom/info',['-v']]);assert.equal(result.routes.localNativeReview.ready,true);assert.equal(result.tools.soffice.path,'/custom/office');
});

test('branded composition revisions link preview findings, resume state and restore without transferring review',async t=>{
  const dir=await temporary(t),file=join(dir,'source.json'),brandFile=join(dir,'brand.json'),root=join(dir,'project');await writeFile(brandFile,JSON.stringify(await brand(dir)));await writeFile(file,JSON.stringify(comp()));
  await compileCompositionFile({file,brand:brandFile,output:root});let w=await loadCompositionProject(root);
  await editCompositionProject({root,id:'first_label',fields:{text:'Revised branded source'},expectedDigest:w.current.sceneDigest});w=await loadCompositionProject(root);
  const fixture=fakeRenderer(),preview=join(root,'preview-v2'),result=await previewComposition({file:w.compiled,output:preview,renderer:'local'},fixture.deps),answers=join(dir,'answers.json');await writeFile(answers,JSON.stringify(assessment(result)));await recordCritique({file:preview,assessment:answers});
  const status=await compositionStatus(root);assert.equal(status.readyForUserReview,true);assert.equal(status.ready,false);assert.deepEqual(status.findings,[]);
  await restoreCompositionProject({root,id:'v000001',expectedDigest:w.current.sceneDigest});const restored=await compositionStatus(root);assert.equal(restored.version,'v000003');assert.equal(restored.readyForUserReview,false);assert.equal(restored.preview,undefined);
});

test('a version collision preserves the existing directory and the current project',async t=>{
  const {output}=await build(t),w=await loadCompositionProject(output),reserved=join(output,'versions','v000002');await mkdir(reserved,{recursive:true});await writeFile(join(reserved,'keep.txt'),'existing work');
  await assert.rejects(()=>editCompositionProject({root:output,id:'first_label',fields:{text:'Changed'},expectedDigest:w.current.sceneDigest}),/EEXIST/);
  assert.equal(await readFile(join(reserved,'keep.txt'),'utf8'),'existing work');assert.equal((await loadCompositionProject(output)).current.id,'v000001');
  assert.equal((await compositionStatus(output)).sceneDigest,w.current.sceneDigest);
});
