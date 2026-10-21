// The visual vocabulary a composer reaches for: filled cards, derived supporting colors, dashed edges, crossed-out
// states and arrows that hold on to words. And the audits that stop sentences being chopped into nodes, internal
// provenance reaching a slide, ASCII art standing in for drawing, and words drawn over words.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {temporary} from './fixtures.mjs';
import {brand as nativeBrand,part} from './native-fixtures.mjs';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {validateComposition,compileComposition,composeContract,composeSizes,supportingRoles,contrastRatio} from '../scripts/lib/compose.mjs';
import {splitPoints,internalSource,asciiArt,repairClusters} from '../scripts/lib/compose-audit.mjs';
import {screenComposition} from '../scripts/lib/compose-preview.mjs';
import {compileCompositionFile} from '../scripts/lib/compose-file.mjs';
import {emitNativePptx} from '../scripts/lib/pptx-native.mjs';
import {renderSceneHtml} from '../scripts/lib/scene.mjs';
import {compileGoogleScene} from '../scripts/lib/google-slides.mjs';
import {checkOutline,startOutlineFile} from '../scripts/lib/outline.mjs';

function brand({delivery='reading',...extra}={}) {
  const colors={canvasPrimary:'#FFFFFF',canvasSecondary:'#E2E3E4',inkPrimary:'#000000',inkDeep:'#1B1D36',inkSecondary:'#53565A',headingPrimary:'#005C8A',accentAqua:'#007B8C',accentPurple:'#6C4B94',accentAzure:'#0098C7',accentGreen:'#61A60E',accentAzureText:'#007DA3',statusCritical:'#CC092F'};
  const role=(size,bold=false,colorRole='inkDeep')=>({size,bold,colorRole});
  const c={schema:1,identity:{id:'acme',variant:'light'},medium:{kind:'slides',delivery},sources:[{path:'/synthetic/source',sha256:'a'.repeat(64)}],
    design:{fontFamily:'Arial',colors,slides:{canvas:{width:960,height:540},titleBox:{x:48,y:32,width:864,height:66},contentBox:{x:48,y:126,width:864,height:360},reservedBottom:486,
      spacing:{column:30,inset:18},typography:{title:role(28,true,'headingPrimary'),body:role(24),bodyReference:role(20),label:role(20,true),caption:role(14,false,'inkSecondary'),metric:role(64,true,'accentAqua'),quote:role(30)},
      chart:{seriesRoles:['headingPrimary','accentAqua','accentPurple'],axisFontPt:18},table:{headerFillRole:'headingPrimary',headerTextRole:'canvasPrimary',fontPt:20,paddingPt:12},...extra}},
    language:{organization:{toneStatus:'unspecified'},authorVoice:{status:'unselected'}}};
  c.revision=contractRevision(c);return c;
}
// Fit refusals are enforced only when the brand font measures the text; without it they are warnings. The host decides
// which: a runner without Arial (the core CI job) measures by estimate, one with it (the native job, macOS) exactly.
const {resolveFont}=await import('../scripts/lib/text-metrics.mjs');
const fontMode=async()=>{const r=(await resolveFont('Arial')).font,b=(await resolveFont('Arial',{bold:true})).font;return r&&b?'exact':!r&&!b?'estimated':'mixed';};
// A refusal under exact measurement; the same problem reported as an unverified-fit warning under estimated measurement.
async function refusedOrWarned(comp,c,pattern){
  const mode=await fontMode();
  if(mode==='exact')return assert.rejects(()=>compileComposition(comp,c),pattern);
  const {structure,report}=await compileComposition(comp,c);assert.match(report.measurement,/estimated/);
  assert.ok((structure.unverifiedFit??[]).some(u=>pattern.test(u.detail)),JSON.stringify(structure.unverifiedFit));
}
const exec=promisify(execFile),cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url));
const dir0={focal:'headingPrimary',neutral:'canvasSecondary'};
const deck=(canvas,{direction=dir0,brief,connect,...slide}={})=>({version:1,title:'Vocabulary',...(direction?{direction}:{}),slides:[{id:'slide_one',title:'A claim the slide supports',sources:['s1'],...(brief?{brief}:{}),...(connect?{connect}:{}),...slide,canvas}]});
const byId=(scene,id)=>scene.slides[0].elements.find(e=>e.id===id);
const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);

test('a tint card is a light surface of its color, and the contract offers it as the supporting card',async()=>{
  assert.match(composeContract,/tint/);assert.match(composeContract,/state/);assert.match(composeContract,/dashed/);
  const dir={...dir0,meanings:{accentAqua:'Tanzu',accentPurple:'the incumbent'}};
  const {scene}=await compileComposition(deck({type:'stack',direction:'row',children:[
    {type:'box',id:'tint_plain',style:'tint',text:'Neutral surface'},
    {type:'box',id:'tint_aqua',style:'tint',fill:'accentAqua',text:'Tanzu surface'},
    {type:'box',id:'tint_point',style:'tint',text:'The point'}]},{direction:dir,brief:{relation:'parallel',focal:'tint_point'}}),brand());
  const plain=byId(scene,'tint_plain'),aqua=byId(scene,'tint_aqua'),point=byId(scene,'tint_point');
  // Every tint is light enough for ordinary ink, and a tint of a meaning keeps its hue.
  for(const e of [plain,aqua,point]){assert.ok(luminance(e.fill)>.6,`${e.id} ${e.fill} is light`);assert.ok(contrastRatio(e.color,e.fill)>=4.5,`${e.id} text reads`);}
  assert.notEqual(aqua.fill,plain.fill);assert.ok(parseInt(aqua.fill.slice(5,7),16)>parseInt(aqua.fill.slice(1,3),16),'the aqua tint leans to its hue');
  // The point keeps the focal color as its edge, so it still reads as the one thing to look at.
  assert.equal(point.stroke,'#005C8A');assert.equal(plain.stroke,undefined);
  // Under a direction a tint is still one of its fills.
  assert.throws(()=>validateComposition(deck({type:'box',id:'tint_bad',style:'tint',fill:'inkDeep',text:'x'},{direction:dir}),brand()),/fill inkDeep is not in the deck direction/);
});

test('a direction without meanings may use two or three supporting colors derived from the brand palette',async()=>{
  const c=brand();
  // The brand's chart colors come first, then its other accents; the focal, the neutral and text variants never qualify.
  assert.deepEqual(supportingRoles(c,dir0),['accentAqua','accentPurple','accentAzure']);
  assert.deepEqual(supportingRoles(c,{focal:'accentAqua',neutral:'canvasSecondary'}),['headingPrimary','accentPurple','accentAzure']);
  assert.match(await composeSizes(c),/accentAqua, accentPurple, accentAzure/);
  const {scene,structure}=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'card_aqua',style:'tint',fill:'accentAqua',text:'A'},{type:'box',id:'card_purple',style:'bar',fill:'accentPurple',text:'B'}]}),c);
  assert.ok(byId(scene,'card_aqua').fill);assert.deepEqual(structure.supporting,['accentAqua','accentPurple','accentAzure']);
  assert.throws(()=>validateComposition(deck({type:'box',id:'card_green',fill:'accentGreen',text:'x'}),c),/fill accentGreen is not in the deck direction/);
  // Once the deck says what its colors mean, only those colors carry meaning.
  assert.throws(()=>validateComposition(deck({type:'box',id:'card_purple',fill:'accentPurple',text:'x'},{direction:{...dir0,meanings:{accentAqua:'Tanzu'}}}),c),/fill accentPurple is not in the deck direction/);
});

test('a long deck whose direction gives no color a meaning is reported, a short one is not',async()=>{
  const c=brand(),slides=n=>({version:1,title:'Long',direction:dir0,slides:Array.from({length:n},(_,i)=>({id:`slide_${i+10}`,title:`Claim number ${i+1} holds`,sources:['s1'],brief:{relation:'none'},notes:'Say it.',canvas:{type:'text',id:`words_${i+10}`,text:'Words that are enough.'}}))});
  const long=await compileComposition(slides(11),c),short=await compileComposition(slides(4),c);
  const found=await screenComposition({scene:long.scene,structure:long.structure});
  const f=found.find(x=>x.code==='no-meanings');assert.ok(f);assert.equal(f.severity,'warn');assert.match(f.detail,/accentAqua/);
  assert.ok(!(await screenComposition({scene:short.scene,structure:short.structure})).some(x=>x.code==='no-meanings'));
});

test('edges can be dashed or dotted in every writer',async t=>{
  const comp=deck({type:'stack',direction:'row',children:[{type:'box',id:'node_a',text:'Primary'},{type:'spacer',weight:.4},{type:'box',id:'node_b',text:'Standby'},{type:'spacer',weight:.4},{type:'box',id:'node_c',text:'Replica'}]},{connect:[{id:'edge_sync',from:'node_a',to:'node_b'},{id:'edge_async',from:'node_b',to:'node_c',style:'dashed'},{id:'edge_hint',from:'node_a',to:'node_c',style:'dotted',route:'curve'}]});
  const c=brand(),{scene,structure}=await compileComposition(comp,c);
  assert.equal(byId(scene,'edge_sync').dash,undefined);assert.equal(byId(scene,'edge_async').dash,'dash');assert.equal(byId(scene,'edge_hint').dash,'dot');
  assert.throws(()=>validateComposition((d=>{d.slides[0].connect[0].style='wavy';return d;})(structuredClone(comp)),c),/edge style is solid, dashed or dotted/);
  assert.match(renderSceneHtml(scene),/stroke-dasharray/);
  const google=compileGoogleScene(scene,{presentationId:'test_deck',revisionId:'r1',pageSize:{width:{magnitude:960,unit:'PT'},height:{magnitude:540,unit:'PT'}},slides:[]});
  assert.ok(google.requests.some(r=>r.updateLineProperties?.objectId==='edge_async'&&r.updateLineProperties.lineProperties.dashStyle==='DASH'));
  assert.ok(google.requests.some(r=>r.updateLineProperties?.objectId==='edge_hint'&&r.updateLineProperties.lineProperties.dashStyle==='DOT'));
  const dir=await temporary(t),nb=await nativeBrand(dir),built=await compileComposition(comp,nb),file=join(dir,'dash.pptx');
  await emitNativePptx({...built,brand:nb,output:file,base:dir});const xml=await part(file,'ppt/slides/harnessSlide1.xml');
  assert.match(xml,/name="edge_async".*?<a:prstDash val="dash"\/>/s);assert.match(xml,/name="edge_hint".*?<a:prstDash val="sysDot"\/>/s);
  assert.ok(!/name="edge_sync"(?:(?!<\/p:cxnSp>).)*prstDash/s.test(xml),'a solid edge has no dash');
});

test('a node can be muted, struck through or marked failed instead of having lines drawn across its words',async t=>{
  const c=brand();
  const canvas={type:'stack',direction:'row',children:[
    {type:'box',id:'zone_a',state:'failed',children:[{type:'text',id:'zone_a_label',text:'Zone A',textRole:'label'},{type:'box',id:'zone_primary',text:'Primary'},{type:'box',id:'zone_standby',text:'Synchronous standby'}]},
    {type:'box',id:'zone_b',style:'tint',children:[{type:'text',id:'zone_b_label',text:'Zone B',textRole:'label'},{type:'box',id:'zone_replica',text:'Asynchronous replica'}]},
    {type:'stack',direction:'column',children:[{type:'text',id:'old_claim',state:'struck',text:'Local HA proves regional recovery'},{type:'text',id:'quiet_note',state:'muted',text:'Assumed, not shown'}]}]};
  const {scene,structure}=await compileComposition(deck(canvas,{brief:{relation:'contrast'}}),c),e=id=>byId(scene,id);
  // Struck words are drawn with a strikethrough in a muted ink; muted words keep their text plain.
  assert.equal(e('old_claim').strike,true);assert.equal(e('old_claim').color,'#53565A');assert.equal(e('quiet_note').strike,undefined);assert.equal(e('quiet_note').color,'#53565A');
  // A failed box gets a status-colored dashed edge and an × badge, grouped with it; what it holds is muted, not crossed by lines.
  assert.deepEqual([e('zone_a').stroke,e('zone_a').dash],['#CC092F','dash']);
  const badge=e('zone_a_state');assert.deepEqual([badge.shape,badge.text,badge.fill],['ellipse','×','#CC092F']);
  assert.ok(badge.x>=e('zone_a').x&&badge.x+badge.width<=e('zone_a').x+e('zone_a').width&&badge.y>=e('zone_a').y,'the badge sits inside the failed box');
  assert.ok(structure.groups.find(g=>g.id==='zone_a_group').members.includes('zone_a_state'));
  assert.equal(e('zone_primary').color,'#53565A');assert.equal(e('zone_a_label').color,'#53565A');assert.ok(luminance(e('zone_primary').fill)>.6);
  assert.ok(!scene.slides[0].elements.some(x=>x.type==='line'),'nothing is drawn across the words');
  // State is validated: the point of a slide cannot be muted, and failed belongs to a box.
  assert.throws(()=>validateComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'the_point',state:'muted',text:'x'},{type:'box',id:'other_box',text:'y'}]},{brief:{relation:'parallel',focal:'the_point'}}),c),/the focal node is the point of the slide; it cannot be muted/);
  assert.throws(()=>validateComposition(deck({type:'text',id:'odd_state',state:'gone',text:'x'}),c),/state is normal, muted, struck or failed/);
  assert.throws(()=>validateComposition(deck({type:'text',id:'text_failed',state:'failed',text:'x'}),c),/failed marks a box/);
  assert.throws(()=>validateComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'zone_a',state:'failed',text:'x'},{type:'box',id:'zone_a_state',text:'y'}]}),c),/repeated ID: zone_a_state/);
  // Every writer carries the strikethrough.
  assert.match(renderSceneHtml(scene),/line-through/);
  const google=compileGoogleScene(scene,{presentationId:'test_deck',revisionId:'r1',pageSize:{width:{magnitude:960,unit:'PT'},height:{magnitude:540,unit:'PT'}},slides:[]});
  assert.ok(google.requests.some(r=>r.updateTextStyle?.objectId==='old_claim'&&r.updateTextStyle.style.strikethrough===true));
  const dir=await temporary(t),nb=await nativeBrand(dir),built=await compileComposition(deck(canvas,{brief:{relation:'contrast'}}),nb),file=join(dir,'state.pptx');
  await emitNativePptx({...built,brand:nb,output:file,base:dir});const xml=await part(file,'ppt/slides/harnessSlide1.xml');
  assert.match(xml,/name="old_claim".*?strike="sngStrike"/s);assert.match(xml,/name="zone_a".*?<a:prstDash val="dash"\/>/s);
});

test('an arrow to a text node meets the edge of its words and stays attached',async t=>{
  // A text given a tall slot keeps its words at the top of it; the arrow used to aim at the empty middle of the slot.
  const canvas={type:'free',children:[{type:'box',id:'from_box',text:'Restore',at:{x:0,y:.4,width:.3,height:.2}},{type:'text',id:'to_words',text:'Verify access',at:{x:.6,y:.2,width:.4,height:.6}}]};
  const comp=deck(canvas,{connect:[{id:'edge_words',from:'from_box',to:'to_words'}]}),c=brand();
  const {scene}=await compileComposition(comp,c),words=byId(scene,'to_words'),line=byId(scene,'edge_words');
  // The text keeps its place but is sized to its words, so the arrow lands beside them, not in empty space below them.
  assert.ok(words.height<60,`text height ${words.height} fits its one line`);assert.equal(words.y,126+.2*360);
  const end={x:line.flipH?line.x:line.x+line.width,y:line.flipV?line.y:line.y+line.height};
  assert.ok(Math.abs(end.x-words.x)<1,'the arrow ends at the words');assert.ok(end.y>=words.y&&end.y<=words.y+words.height,'the arrow meets the words, not the empty slot');
  const dir=await temporary(t),nb=await nativeBrand(dir),built=await compileComposition(comp,nb),result=await emitNativePptx({...built,brand:nb,output:join(dir,'attach.pptx'),base:dir});
  assert.deepEqual(result.native[0].attached,['edge_words']);assert.deepEqual(result.native[0].unattached,[]);
});

test('dependency can be drawn as labelled cards in reading order when the parts have no short labels',async()=>{
  const card=(id,label,text)=>({type:'box',id,style:'tint',children:[{type:'text',id:`${id}_label`,text:label,textRole:'label'},{type:'text',id:`${id}_text`,text}]});
  const comp=deck({type:'stack',direction:'row',children:[card('need_card','Prerequisites','Base backup, continuous archived WAL, storage access, credentials and retention.'),card('path_card','Evaluation path','Restore to an isolated new instance; verify access, data and elapsed recovery.')]},{brief:{relation:'dependency'}});
  assert.equal(validateComposition(comp,brand()).slides.length,1);
  const bare=deck({type:'stack',direction:'row',children:[{type:'box',id:'plain_one',text:'One'},{type:'box',id:'plain_two',text:'Two'}]},{brief:{relation:'dependency'}});
  assert.throws(()=>validateComposition(bare,brand()),/relation "dependency" is not drawn\. Join the nodes with edges, or lay the parts out as labelled cards/);
});

// The approved points of slide rest001, and the way a composer split them across nodes.
const restOutline={version:1,title:'Deck',delivery:'reading',slides:[{id:'slide_one',kind:'content',title:'Prove recovery with an isolated new-instance restore',understand:'Backup completion alone does not prove recoverability.',relation:'dependency',points:[
  {label:'Prerequisites',text:'Base backup, continuous archived WAL, storage access, credentials and retention.'},
  {label:'Evaluation path',text:'Restore to an isolated new instance; verify application access, data and elapsed recovery.'}],sources:['O5']}]};
const chopped={type:'free',children:[
  {type:'text',id:'pre_label',text:'Prerequisites:',textRole:'label',at:{x:0,y:0,width:.3,height:.12}},
  {type:'box',id:'pre_base',text:'Base backup,',at:{x:0,y:.15,width:.28,height:.22}},
  {type:'box',id:'pre_wal',text:'continuous archived WAL,',at:{x:0,y:.4,width:.28,height:.34}},
  {type:'text',id:'pre_access',text:'storage access, credentials and retention.',at:{x:.32,y:.0,width:.3,height:.34}},
  {type:'box',id:'eval_dest',text:'Restore to an isolated new instance; verify application access, data and elapsed recovery.',at:{x:.66,y:.2,width:.34,height:.6}}]};

test('a point split across several nodes is found; a whole sentence, notes and approved short labels are not',async()=>{
  const c=brand(),{scene}=await compileComposition(deck(chopped),c);
  const found=splitPoints(restOutline,scene);
  assert.equal(found.length,1);assert.equal(found[0].code,'split-point');assert.equal(found[0].slide,'slide_one');
  assert.deepEqual(found[0].objects.sort(),['pre_access','pre_base','pre_wal']);assert.match(found[0].detail,/Prerequisites/);
  // The whole sentence in one node, beside short node labels, is the pattern to follow.
  const whole=structuredClone(chopped);whole.children[3].text='Base backup, continuous archived WAL, storage access, credentials and retention.';whole.children[3].at={x:0,y:.78,width:.62,height:.22};
  assert.equal(splitPoints(restOutline,(await compileComposition(deck(whole),c)).scene).length,0);
  // So is keeping the sentence in the notes.
  assert.equal(splitPoints(restOutline,(await compileComposition(deck(chopped,{notes:'Prerequisites: base backup, continuous archived WAL, storage access, credentials and retention.'}),c)).scene).length,0);
  // Short labels the outline approved for diagram nodes are not fragments.
  const labelled=structuredClone(restOutline);labelled.slides[0].points[0].parts=['Base backup','Continuous archived WAL','Storage access, credentials and retention'];
  assert.equal(splitPoints(labelled,scene).length,0);
});

test('compile refuses a split point in a reading deck and reports it in a live one',async t=>{
  const dir=await temporary(t),file=join(dir,'composition.json'),outlineFile=join(dir,'outline.json'),brandFile=join(dir,'brand.json'),liveFile=join(dir,'live.json');
  await writeFile(file,JSON.stringify(deck(chopped)));await writeFile(outlineFile,JSON.stringify(restOutline));
  const nb=await nativeBrand(dir);await writeFile(brandFile,JSON.stringify(nb));
  const live=structuredClone(nb);live.medium.delivery='live';live.revision=contractRevision(live);await writeFile(liveFile,JSON.stringify(live));
  await assert.rejects(()=>compileCompositionFile({file,brand:brandFile,outline:outlineFile}),/slide_one: the approved point "Prerequisites" is split across pre_base, pre_wal, pre_access/);
  // The command line takes the same --outline, and a refusal names the slide and the nodes to repair.
  const refused=await exec(process.execPath,[cli,'compose','compile','--file',file,'--brand',brandFile,'--outline',outlineFile,'--json']).then(()=>null,e=>JSON.parse(e.stdout));
  assert.ok(refused.problems.some(p=>p.slide==='slide_one'&&/split across/.test(p.message??p.detail??JSON.stringify(p))),JSON.stringify(refused));
  const result=await compileCompositionFile({file,brand:liveFile,outline:outlineFile});
  assert.equal(result.splitPoints.length,1);
  // An outline project is found from --project, and the outline is recorded with the build so previews can audit it.
  const project=join(dir,'project');await mkdir(project);await writeFile(join(project,'outline.json'),JSON.stringify(restOutline));
  await writeFile(join(project,'project.json'),JSON.stringify({schema:1,tool:'harness-slides-project',outline:'outline.json',versions:[]}));
  await assert.rejects(()=>compileCompositionFile({file,brand:brandFile,project,output:join(project,'build')}),/is split across/);
  const ok=structuredClone(deck(chopped));ok.slides[0].notes='Prerequisites: base backup, continuous archived WAL, storage access, credentials and retention.';await writeFile(file,JSON.stringify(ok));
  await compileCompositionFile({file,brand:brandFile,project,output:join(project,'build')});
  const report=JSON.parse(await readFile(join(project,'build','compose-report.json'),'utf8'));assert.equal(report.inputs.outline.path,'../outline.json');assert.match(report.inputs.outline.sha256,/^[a-f0-9]{64}$/);
});

test('the preview screen reports split points as blocking in a reading deck',async()=>{
  const c=brand(),{scene,structure}=await compileComposition(deck(chopped),c);
  const findings=await screenComposition({scene,structure,outline:restOutline,delivery:'reading'}),f=findings.find(x=>x.code==='split-point');
  assert.equal(f.severity,'error');
  assert.equal((await screenComposition({scene,structure,outline:restOutline,delivery:'live'})).find(x=>x.code==='split-point').severity,'warn');
});

test('a source line is a citation for the audience; internal provenance belongs in notes',async t=>{
  for(const internal of ['Finding g3; Tanzu HA 4.5','Findings g2, g3; PGD 6.5.0','Blueprint O1–O9; learner guide objectives','research:g4','O4','Research g4/f9/f10/f25'])assert.ok(internalSource(internal),internal);
  for(const citation of ['Tanzu for Postgres 4.5 documentation','PostgreSQL 18 documentation, continuous archiving','EDB Postgres Distributed 6.5 release notes','Learner guide chapter 2','S3-compatible storage guide'])assert.ok(!internalSource(citation),citation);
  const c=brand(),{scene,structure}=await compileComposition(deck({type:'text',id:'only_words',text:'Words that are enough.'},{source:'Finding g3; Tanzu HA 4.5',brief:{relation:'none'}}),c);
  const f=(await screenComposition({scene,structure})).find(x=>x.code==='internal-source');assert.ok(f);assert.equal(f.object,'slide_one_source');assert.match(f.detail,/provenance/);
  // provenance is never drawn; it goes into the speaker notes.
  const traced=await compileComposition(deck({type:'text',id:'only_words',text:'Words that are enough.'},{source:'Tanzu for Postgres 4.5 documentation',notes:'Say this.',provenance:'Finding g3; research f27'}),c);
  assert.equal(traced.scene.slides[0].notes,'Say this.\n\nProvenance: Finding g3; research f27');assert.ok(!traced.scene.slides[0].elements.some(e=>/Finding g3/.test(e.text??'')));
  assert.equal((await compileComposition(deck({type:'text',id:'only_words',text:'x'},{provenance:'Finding g3'}),c)).scene.slides[0].notes,'Provenance: Finding g3');
  assert.throws(()=>validateComposition(deck({type:'text',id:'only_words',text:'x'},{provenance:''}),c),/provide provenance text or omit it/);
  // The outline check says the same before anything is built, and start hands provenance to the builder for notes.
  const dir=await temporary(t),nb=await nativeBrand(dir),outline={version:1,title:'Deck',delivery:'reading',direction:dir0,slides:[{id:'slide_one',kind:'content',title:'Enable HA before interpreting settings',understand:'An empty field is one node.',relation:'none',points:[{text:'An empty highAvailability field is a single node.'}],source:'Finding g3; Tanzu HA 4.5',provenance:'Research g3/f27/f30',sources:['O4']}]};
  const checked=await checkOutline(outline,nb);assert.ok(checked.findings.some(x=>x.code==='internal-source'&&x.slide==='slide_one'));
  const file=join(dir,'outline.json'),brandFile=join(dir,'brand.json');await writeFile(file,JSON.stringify(outline));await writeFile(brandFile,JSON.stringify(nb));
  const started=await startOutlineFile({file,brand:brandFile,output:join(dir,'start')});
  assert.match(await readFile(started.briefs[0],'utf8'),/Provenance, to set on the slide as `provenance` \(speaker notes only, never drawn\): Research g3\/f27\/f30/);
});

test('ASCII arrows, box drawing and punctuation placeholders are reported as faked drawing',async()=>{
  for(const bad of ['- - >','-->','primary ==> standby','+----+','│ zone A │','.'])assert.ok(asciiArt(bad),bad);
  for(const fine of ['Primary → standby','Read-only replicas','Step 1: restore','A, B and C','zone-A loss'])assert.ok(!asciiArt(fine),fine);
  const c=brand(),{scene,structure}=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'left_node',text:'Zone A'},{type:'text',id:'fake_arrow',text:'- - >'},{type:'box',id:'right_node',text:'Zone B'}]}),c);
  const f=(await screenComposition({scene,structure})).find(x=>x.code==='ascii-art');assert.equal(f.object,'fake_arrow');assert.match(f.detail,/style: "dashed"/);
});

test('words drawn over other words are refused; words over a plain filled card are not',async()=>{
  const c=brand(),over=children=>deck({type:'free',children});
  await refusedOrWarned(over([{type:'text',id:'first_words',text:'Primary and synchronous standby',at:{x:0,y:0,width:.6,height:.3}},{type:'text',id:'second_words',text:'Zone-A loss risk',at:{x:.2,y:.05,width:.6,height:.3}}]),c,/slide_one\/second_words: its words overlap the words of first_words/);
  await refusedOrWarned(over([{type:'box',id:'boxed_words',text:'Restore to a new instance',at:{x:0,y:0,width:.5,height:.4}},{type:'text',id:'stray_words',text:'verify access',at:{x:.1,y:.12,width:.3,height:.2}}]),c,/its words overlap/);
  // A label on a filled card, words in an empty box's corner, and two texts whose boxes touch only in empty padding are fine.
  await compileComposition(over([{type:'box',id:'zone_box',at:{x:0,y:0,width:.6,height:.8}},{type:'text',id:'zone_label',text:'Zone A',textRole:'label',at:{x:.02,y:.02,width:.3,height:.2}},{type:'text',id:'zone_body',text:'Primary',at:{x:.02,y:.3,width:.3,height:.2}}]),c);
  await compileComposition(over([{type:'text',id:'top_words',text:'One short line',at:{x:0,y:0,width:.5,height:.5}},{type:'text',id:'low_words',text:'Another short line',at:{x:0,y:.3,width:.5,height:.3}}]),c);
});

test('preview findings are grouped per slide, so a caller can send the worst slides back for repair',()=>{
  const slides=[{id:'slide_one',number:1,findings:[{code:'split-point',severity:'error',objects:['a_node','b_node']},{code:'ascii-art',severity:'warn',object:'c_node'}]},{id:'slide_two',number:2,findings:[{code:'no-notes',severity:'info'}]},{id:'slide_three',number:3,findings:[{code:'internal-source',severity:'warn',object:'slide_three_source'}]}];
  const repair=repairClusters(slides);
  assert.deepEqual(repair.blocking,['slide_one']);
  assert.deepEqual(repair.slides.map(s=>s.slide),['slide_one','slide_three']);
  assert.deepEqual(repair.slides[0],{slide:'slide_one',number:1,blocking:true,codes:{'split-point':1,'ascii-art':1},objects:['a_node','b_node','c_node']});
});

test('existing compositions keep compiling unchanged: outline boxes, bar cards and edges without a style',async()=>{
  const comp=deck({type:'stack',direction:'row',children:[{type:'box',id:'old_outline',style:'outline',text:'Outlined'},{type:'spacer',weight:.4},{type:'box',id:'old_bar',style:'bar',text:'Barred'}]},{connect:[{id:'old_edge',from:'old_outline',to:'old_bar'}]});
  const {scene}=await compileComposition(comp,brand());
  assert.deepEqual([byId(scene,'old_outline').stroke,byId(scene,'old_outline').fill,byId(scene,'old_edge').dash,byId(scene,'old_outline').strike],['#53565A',undefined,undefined,undefined]);
  const gallery=JSON.parse(await readFile(new URL('../references/gallery/dependency.json',import.meta.url),'utf8'));
  assert.ok(JSON.stringify(gallery).includes('"tint"'),'the gallery leads with filled cards');
});

test('a preview of a build bound to its outline reports the split point and groups it for repair',async t=>{
  const {previewComposition}=await import('../scripts/lib/compose-preview.mjs'),{encodePng}=await import('../scripts/lib/contact-sheet.mjs');
  const dir=await temporary(t),nb=await nativeBrand(dir);nb.medium.delivery='live';nb.revision=contractRevision(nb);
  const brandFile=join(dir,'brand.json'),file=join(dir,'composition.json'),project=join(dir,'project');
  await writeFile(brandFile,JSON.stringify(nb));const roomy=structuredClone(chopped);roomy.children[1].at={x:0,y:.13,width:.28,height:.26};roomy.children[2].at={x:0,y:.42,width:.28,height:.4};roomy.children[3].at={x:.32,y:0,width:.3,height:.42};roomy.children[4].at={x:.66,y:0,width:.34,height:1};
  await writeFile(file,JSON.stringify(deck(roomy,{source:'Finding g4; Tanzu 4.5',notes:'Say it.'})));await mkdir(project);
  await writeFile(join(project,'outline.json'),JSON.stringify({...restOutline,delivery:'live'}));
  await writeFile(join(project,'project.json'),JSON.stringify({schema:1,tool:'harness-slides-project',outline:'outline.json',versions:[]}));
  const built=await compileCompositionFile({file,brand:brandFile,project,output:join(project,'build')});assert.equal(built.splitPoints.length,1);
  const tiny=encodePng({width:16,height:9,rgb:Buffer.alloc(16*9*3,200)});
  const run=async(command,args)=>{if(args[0]==='-v')return {stdout:''};if(command==='pdfinfo')return {stdout:'Pages:          1\n'};if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png',tiny);return {stdout:''};}throw Object.assign(new Error('spawn ENOENT'),{code:'ENOENT'});};
  const drive={poolPreview:async({render})=>{const r={id:'drive_file_1',url:''};await render?.(r);return r;},importDeck:async()=>({id:'drive_file_1',url:'https://docs.google.com/presentation/d/drive_file_1/edit'}),updateDeck:async({fileId})=>({id:fileId,url:''}),exportPdf:async({output})=>{await writeFile(output,'%PDF-1.7 fake');return {output};}};
  const result=await previewComposition({file:join(project,'build'),output:join(dir,'preview')},{run,drive});
  const codes=result.slides[0].findings.map(f=>f.code);assert.ok(codes.includes('split-point'));assert.ok(codes.includes('internal-source'));
  assert.equal(result.slides[0].findings.find(f=>f.code==='split-point').severity,'warn');
  assert.deepEqual(result.repair.slides[0].slide,'slide_one');assert.ok(result.repair.slides[0].objects.includes('pre_base'));
  assert.deepEqual(JSON.parse(await readFile(join(dir,'preview','preview.json'),'utf8')).repair,result.repair);
});

test('a word wider than its box is refused rather than broken mid-word, and a muted card keeps a hairline edge',async()=>{
  const c=brand(),narrow=deck({type:'stack',direction:'row',children:[{type:'box',id:'wide_box',text:'Zone B'},{type:'box',id:'thin_box',text:'Replica',weight:.35},{type:'box',id:'other_box',text:'Other',weight:2}]});
  await refusedOrWarned(narrow,c,/slide_one\/thin_box: the word "Replica" needs [\d.]+pt but the text is [\d.]+pt wide/);
  const {scene}=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'quiet_box',state:'muted',style:'tint',text:'Standby'},{type:'box',id:'loud_box',text:'Primary'}]}),c);
  assert.deepEqual([byId(scene,'quiet_box').stroke,byId(scene,'quiet_box').strokeWeight],['#53565A',1]);assert.equal(byId(scene,'loud_box').stroke,undefined);
});

test('a brand that forbids tints gets a neutral card with a strip of the meaning color instead',async()=>{
  const c=brand({fills:{tints:false}}),dir={...dir0,meanings:{accentAqua:'Tanzu'}};
  const {scene,structure}=await compileComposition(deck({type:'stack',direction:'row',children:[
    {type:'box',id:'tint_aqua',style:'tint',fill:'accentAqua',text:'Tanzu surface'},
    {type:'box',id:'tint_plain',style:'tint',text:'Neutral surface'},
    {type:'box',id:'tint_card',style:'tint',fill:'accentAqua',children:[{type:'text',id:'tint_card_text',text:'Inside'}]},
    {type:'box',id:'zone_gone',state:'failed',children:[{type:'box',id:'zone_node',style:'tint',text:'Primary'}]}]},{direction:dir}),c),e=id=>byId(scene,id);
  // No color is lightened: the card is the neutral panel and the meaning color is a strip, as a bar card draws it.
  assert.equal(e('tint_aqua').fill,'#E2E3E4');assert.equal(e('tint_aqua_bar').fill,'#007B8C');assert.equal(e('tint_aqua_text').text,'Tanzu surface');
  assert.ok(structure.groups.some(g=>g.id==='tint_aqua_group'));assert.equal(e('tint_plain').fill,'#E2E3E4');assert.equal(e('tint_plain_bar'),undefined);
  assert.equal(e('tint_card_bar').fill,'#007B8C');
  const brandColors=new Set(Object.values(c.design.colors).map(v=>v.toUpperCase()));
  for(const x of scene.slides[0].elements)for(const k of ['fill','stroke','color'])if(x[k])assert.ok(brandColors.has(x[k].toUpperCase()),`${x.id}.${k} ${x[k]} is a brand color`);
  // The contract says so, and a malformed rule is refused. Without the rule, tints stay.
  assert.match(await composeSizes(c),/does not allow tints/);
  assert.throws(()=>validateComposition(deck({type:'text',id:'only_words',text:'x'}),brand({fills:{tints:'no'}})),/fills\.tints/);
  assert.notEqual(byId((await compileComposition(deck({type:'box',id:'tint_aqua',style:'tint',fill:'accentAqua',text:'x'},{direction:dir}),brand())).scene,'tint_aqua').fill,'#E2E3E4');
});

test('a failed box reserves room for its badge, so it never overlaps its own words or children',async()=>{
  const c=brand(),long='Primary and synchronous standby share one zone, so one outage removes both of them at once.';
  const inside=(scene,owner,id)=>{const b=byId(scene,`${owner}_state`),e=byId(scene,id);return b.x>=e.x+e.width-.5||b.y>=e.y+e.height-.5||b.x+b.width<=e.x+.5||b.y+b.height<=e.y+.5;};
  // A failed bar card with long words, a failed card whose first child is as wide as the card, and a plain failed box.
  const bar=(await compileComposition(deck({type:'box',id:'zone_bar',style:'bar',state:'failed',text:long}),c)).scene;assert.ok(inside(bar,'zone_bar','zone_bar_text'),'badge clear of the bar words');
  const card=(await compileComposition(deck({type:'box',id:'zone_card',state:'failed',children:[{type:'box',id:'wide_child',text:long},{type:'text',id:'after_child',text:'More'}]}),c)).scene;assert.ok(inside(card,'zone_card','wide_child'),'badge clear of the first child');
  const plain=(await compileComposition(deck({type:'box',id:'zone_plain',state:'failed',text:long}),c)).scene;
  assert.equal(byId(plain,'zone_plain').text,undefined);assert.equal(byId(plain,'zone_plain_text').text,long);assert.ok(inside(plain,'zone_plain','zone_plain_text'),'badge clear of the words');
  // The words stay centred in the box, as a box's words are.
  const box=byId(plain,'zone_plain'),words=byId(plain,'zone_plain_text');assert.ok(Math.abs((words.y+words.height/2)-(box.y+box.height/2))<1);
  assert.throws(()=>validateComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'zone_plain',state:'failed',text:'x'},{type:'box',id:'zone_plain_text',text:'y'}]}),c),/repeated ID: zone_plain_text/);
});

test('the audits ignore the engine\'s own badges, real URLs and names, and short repeated words',async()=>{
  // A failed box's × badge is the engine's, not faked drawing; a "+" badge is a symbol, not a placeholder.
  for(const fine of ['×','+','?','%','&','—'])assert.ok(!asciiArt(fine),fine);
  for(const bad of ['.','. .','·','|'])assert.ok(asciiArt(bad),bad);
  const c=brand(),{scene,structure}=await compileComposition(deck({type:'box',id:'zone_gone',state:'failed',text:'Zone A'}),c);
  assert.ok(!(await screenComposition({scene,structure})).some(f=>f.code==='ascii-art'));
  for(const citation of ['https://www.postgresql.org/docs/18/continuous-archiving.html','AWS g5 instance guide','O2 network report','See https://example.com/f10/g3'])assert.ok(!internalSource(citation),citation);
  for(const internal of ['Finding g3; Tanzu HA 4.5','g3, g4','Objective O4','Blueprint O1–O9'])assert.ok(internalSource(internal),internal);
  // One-word pieces that happen to occur in a sentence are labels, not a split sentence.
  const outline={version:1,title:'D',slides:[{id:'slide_one',kind:'content',title:'T',understand:'U',relation:'none',points:[{label:'Topology',text:'Primary and standby in zone A; replica in zone B.'}],sources:['s1']}]};
  const labels=(await compileComposition(deck({type:'stack',direction:'row',children:['Primary','Standby','Replica','Zone A'].map((t,i)=>({type:'box',id:`node_${i}x`,text:t}))}),c)).scene;
  assert.equal(splitPoints(outline,labels).length,0);
  // Pieces out of order, or covering only a little of the sentence, are not a split either.
  const scattered=(await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'node_late',text:'replica in zone B'},{type:'box',id:'node_early',text:'Primary and standby'}]}),c)).scene;
  assert.equal(splitPoints(outline,scattered).length,1,'in-order pieces covering the sentence are a split');
  const thin=(await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'node_one',text:'Primary and standby'},{type:'box',id:'node_two',text:'Primary and standby'}]}),c)).scene;
  assert.equal(splitPoints(outline,thin).length,0,'the same piece twice covers too little');
});

test('fit refusals that rest on estimated measurement become warnings, and hyphenated words may break at the hyphen',async()=>{
  const c=brand();
  await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'wide_box',text:'Zone B'},{type:'box',id:'hyphen_box',text:'Synchronous-standby-replica',weight:1},{type:'box',id:'other_box',text:'Other',weight:2}]}),c);
  const guessed=brand();guessed.design.fontFamily='Harness Missing Sans';guessed.revision=contractRevision(guessed);
  const over=deck({type:'free',children:[{type:'text',id:'first_words',text:'Primary and synchronous standby',at:{x:0,y:0,width:.6,height:.3}},{type:'text',id:'second_words',text:'Zone-A loss risk',at:{x:.2,y:.05,width:.6,height:.3}}]});
  const {structure,report}=await compileComposition(over,guessed);assert.match(report.measurement,/estimated/);
  assert.ok(structure.unverifiedFit.some(x=>x.slide==='slide_one'&&/its words overlap/.test(x.detail)));
  const f=(await screenComposition({scene:(await compileComposition(over,guessed)).scene,structure})).find(x=>x.code==='unverified-fit');assert.equal(f.severity,'warn');
});

test('an outline named by project.json must be readable, and a preview notices an outline changed since the build',async t=>{
  const dir=await temporary(t),nb=await nativeBrand(dir),brandFile=join(dir,'brand.json'),file=join(dir,'composition.json'),project=join(dir,'project');
  await writeFile(brandFile,JSON.stringify(nb));await writeFile(file,JSON.stringify(deck({type:'text',id:'only_words',text:'Words that are enough.'})));await mkdir(project);
  await writeFile(join(project,'project.json'),JSON.stringify({schema:1,tool:'harness-slides-project',outline:'outline.json',versions:[]}));
  await assert.rejects(()=>compileCompositionFile({file,brand:brandFile,project}),/project\.json names the outline outline\.json, which cannot be read/);
  await writeFile(join(project,'outline.json'),'{not json');
  await assert.rejects(()=>compileCompositionFile({file,brand:brandFile,project}),/outline outline\.json is not valid JSON/);
  await writeFile(join(project,'outline.json'),JSON.stringify(restOutline));
  await compileCompositionFile({file,brand:brandFile,project,output:join(project,'build')});
  await writeFile(join(project,'outline.json'),JSON.stringify({...restOutline,title:'Changed'}));
  const {previewComposition}=await import('../scripts/lib/compose-preview.mjs'),{encodePng}=await import('../scripts/lib/contact-sheet.mjs'),tiny=encodePng({width:16,height:9,rgb:Buffer.alloc(16*9*3,200)});
  const run=async(command,args)=>{if(args[0]==='-v')return {stdout:''};if(command==='pdfinfo')return {stdout:'Pages:          1\n'};if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png',tiny);return {stdout:''};}throw Object.assign(new Error('spawn ENOENT'),{code:'ENOENT'});};
  const drive={poolPreview:async({render})=>{const r={id:'drive_file_1',url:''};await render?.(r);return r;},importDeck:async()=>({id:'drive_file_1',url:''}),updateDeck:async({fileId})=>({id:fileId,url:''}),exportPdf:async({output})=>{await writeFile(output,'%PDF-1.7 fake');return {output};}};
  const result=await previewComposition({file:join(project,'build'),output:join(dir,'preview')},{run,drive});
  const f=result.slides[0].findings.find(x=>x.code==='outline-changed');assert.equal(f.severity,'error');assert.deepEqual(result.repair.blocking,['slide_one']);
});

test('the pptxgenjs writer carries dashes and strikethrough too',async t=>{
  const {renderPptxScene}=await import('../scripts/lib/pptx-render.mjs'),dir=await temporary(t),file=join(dir,'scene.pptx');
  await renderPptxScene({version:2,title:'Dash',mode:'new',canvas:{width:960,height:540},slides:[{id:'slide_one',title:'Dash',sources:['s1'],elements:[
    {id:'struck_words',type:'text',x:40,y:40,width:300,height:40,text:'Gone',strike:true},
    {id:'dashed_line',type:'line',x:40,y:120,width:300,height:1,dash:'dash',arrow:true},
    {id:'dotted_edge',type:'shape',x:40,y:160,width:200,height:80,stroke:'#555555',dash:'dot'}]}]},file);
  const xml=await part(file,'ppt/slides/slide1.xml');
  assert.match(xml,/strike="sngStrike"/);assert.match(xml,/<a:prstDash val="dash"\/>/);assert.match(xml,/<a:prstDash val="sysDot"\/>/);
});

test('compositions that use none of the new vocabulary compile to the same scenes as before',async t=>{
  // Digests recorded from 0.15.1 (5ba0054) on the neutral brand, in each measurement mode: with Arial (exact) and with no
  // Arial at all (estimated, as on a runner without the font). Only arrows to texts, new fields and refusals change a scene.
  const mode=await fontMode();if(mode==='mixed')return t.skip('only one Arial weight is installed, a mode with no recorded baseline');
  const {neutralBrandContract}=await import('../scripts/lib/brand-contract.mjs'),{digest}=await import('../scripts/lib/common.mjs'),c=await neutralBrandContract();
  for(const [name,expected] of Object.entries(unchanged[mode])){
    const comp=JSON.parse(await readFile(new URL(`../${name}`,import.meta.url),'utf8'));
    assert.equal(digest((await compileComposition(comp,c)).scene),expected,name);
  }
});
const unchanged={exact:{
  'examples/composition.json':'309b662b53f218f7468820af4178664cd094a8fc40d21c50aca2a62fc77d99d5',
  'references/gallery/hierarchy.json':'388faeaa3302f78c02584d6df0af72476ea53de0acc241388234458598cbdac9',
  'references/gallery/none.json':'8235e2fadd0a1257d39a4bac3b7e8e4186e689499b5ddad37c4b4825057adf89',
  'references/gallery/overlap.json':'f3f4bf4a8f6dec49d4b3f928f48a83f37a3430b53b3682bb48e0569359f29c21',
  'references/gallery/quantity.json':'71743c0f99306b638bebab2ab909b903f6b1eab16470226d9f2afd0e0c5cdce0',
},estimated:{
  'examples/composition.json':'8aeb59c89aea415f86bcb32a1fef5851444ab4a7d65ad418a7244ff15ae7920c',
  'references/gallery/hierarchy.json':'74236749bcb9404f9a97045f68d60da308b38ec58cd45377a9e9088e85f48820',
  'references/gallery/none.json':'9e4b8008ff3257770301d760192e548ebcc14de017b53072d3e4074e72e50467',
  'references/gallery/overlap.json':'f3f4bf4a8f6dec49d4b3f928f48a83f37a3430b53b3682bb48e0569359f29c21',
  'references/gallery/quantity.json':'65229fc752730608e1de2f08b8c56ef18430c8777737334b1b33216e0ed33c2b',
}};

test('a failed box\'s badge is big enough for its own ×, and a solid icon\'s glyph is not judged against the card',async()=>{
  // Found in the live Google check: the 26pt badge was 1.3pt short of the × it holds, so the engine flagged its own badge.
  const c=brand(),{scene,structure}=await compileComposition(deck({type:'box',id:'zone_gone',state:'failed',children:[{type:'text',id:'zone_words',text:'Zone A'}]}),c);
  const {auditSceneQuality}=await import('../scripts/lib/slide-quality.mjs'),{findings}=await auditSceneQuality(scene);
  const badge=byId(scene,'zone_gone_state');assert.equal(badge.width,badge.height);
  // With Arial the × needs 27.3pt in the caption size; without it the estimate is smaller and the audit cannot measure.
  if(await fontMode()==='exact'){assert.ok(badge.width>=28,`badge ${badge.width}pt`);assert.ok(!findings.some(f=>f.object==='zone_gone_state'&&f.code==='measured-text-overflow'),JSON.stringify(findings.filter(f=>f.object==='zone_gone_state')));}
  // A solid icon is a white glyph on a colored disc: on a white card only the disc can blend in.
  const iconBrand=brand({icon:{size:54,library:{path:'/x',index:'/y'}}});
  const card=await compileComposition(deck({type:'box',id:'white_card',fill:'canvasPrimary',children:[{type:'icon',id:'disc_icon',icon:'fi-test',style:'solid',color:'statusCritical'},{type:'text',id:'disc_label',text:'Zone A'}]}),iconBrand);
  const glyph=card.structure.icons[0].glyph.slice(1).toUpperCase();assert.equal(glyph,'FFFFFF');
  const screened=await screenComposition({scene:card.scene,structure:card.structure,native:[{id:'slide_one',unattached:[],icons:[{id:'disc_icon',colors:['CC092F',glyph]}]}]});
  assert.ok(!screened.some(f=>f.code==='icon-blends-into-fill'));
  const red=await compileComposition(deck({type:'box',id:'white_card',fill:'accentPurple',children:[{type:'icon',id:'disc_icon',icon:'fi-test',style:'solid',color:'accentPurple'},{type:'text',id:'disc_label',text:'Zone A'}]}),iconBrand);
  const blended=await screenComposition({scene:red.scene,structure:red.structure,native:[{id:'slide_one',unattached:[],icons:[{id:'disc_icon',colors:['6C4B94',red.structure.icons[0].glyph.slice(1).toUpperCase()]}]}]});
  assert.ok(blended.some(f=>f.code==='icon-blends-into-fill'),'a disc the color of the card still blends');
});
