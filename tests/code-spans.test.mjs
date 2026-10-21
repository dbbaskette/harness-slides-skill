// Inline code: configuration fields, commands, API and file names written as `code` spans in slide text are set in the
// brand's code font as runs inside one text box, measured as drawn, carried by every writer, shown on the draft page,
// and asked for by the outline check when a name is left unmarked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {temporary} from './fixtures.mjs';
import {brand as nativeBrand,part} from './native-fixtures.mjs';
import {contractRevision,validateBrandContract} from '../scripts/lib/brand-contract.mjs';
import {validateComposition,compileComposition,composeContract,composeSizes} from '../scripts/lib/compose.mjs';
import {codeSpans,withCodeTicks,textRuns,renderSceneHtml,validateScene} from '../scripts/lib/scene.mjs';
import {resolveFont,measureText} from '../scripts/lib/text-metrics.mjs';
import {compileGoogleScene,verifyGoogleSceneReadback} from '../scripts/lib/google-slides.mjs';
import {emitNativePptx} from '../scripts/lib/pptx-native.mjs';
import {renderPptxScene} from '../scripts/lib/pptx-render.mjs';
import {checkOutline,draftOutline,outlineContract} from '../scripts/lib/outline.mjs';
import {unmarkedCode} from '../scripts/lib/compose-audit.mjs';
import {auditSceneQuality} from '../scripts/lib/slide-quality.mjs';

function brand({code,tints}={}) {
  const colors={canvasPrimary:'#FFFFFF',canvasSecondary:'#E2E3E4',inkPrimary:'#000000',inkDeep:'#1B1D36',inkSecondary:'#53565A',headingPrimary:'#005C8A',accentAqua:'#007B8C',statusCritical:'#CC092F'};
  const role=(size,bold=false,colorRole='inkDeep')=>({size,bold,colorRole});
  const c={schema:1,identity:{id:'acme',variant:'light'},medium:{kind:'slides',delivery:'reading'},sources:[{path:'/synthetic/source',sha256:'a'.repeat(64)}],
    design:{fontFamily:'Arial',colors,slides:{canvas:{width:960,height:540},titleBox:{x:48,y:32,width:864,height:66},contentBox:{x:48,y:126,width:864,height:360},reservedBottom:486,
      spacing:{column:30,inset:18},typography:{title:role(28,true,'headingPrimary'),body:role(24),bodyReference:role(20),label:role(20,true),caption:role(14,false,'inkSecondary'),metric:role(64,true,'accentAqua'),quote:role(30),...(code?{code}:{})},
      chart:{seriesRoles:['headingPrimary','accentAqua'],axisFontPt:18},table:{headerFillRole:'headingPrimary',headerTextRole:'canvasPrimary',fontPt:20,paddingPt:12},...(tints===false?{fills:{tints:false}}:{})}},
    language:{organization:{toneStatus:'unspecified'},authorVoice:{status:'unselected'}}};
  c.revision=contractRevision(c);return c;
}
const deck=(canvas,extra={})=>({version:1,title:'Code spans',slides:[{id:'slide_one',title:'Enable high availability before reading synchronous settings',sources:['s1'],...extra,canvas}]});
const byId=(scene,id)=>scene.slides[0].elements.find(e=>e.id===id);
const lead='High availability (`highAvailability`) is empty or omitted';

test('backticks mark code spans; the visible words lose them and keep the ranges',()=>{
  assert.deepEqual(codeSpans(lead),{text:'High availability (highAvailability) is empty or omitted',code:[[19,35]]});
  assert.deepEqual(codeSpans('Set `a` and `b_c`').code,[[4,5],[10,13]]);
  // A lone backtick is a backtick; a span does not cross a line.
  assert.deepEqual(codeSpans('Press ` to open').code,[]);assert.deepEqual(codeSpans('`a\nb`').code,[]);
  const words=codeSpans(lead);assert.equal(withCodeTicks(words),lead);
  // \` is a literal backtick, inside or outside a span; the author form escapes literal backticks so it reads back the same.
  assert.deepEqual(codeSpans('Press \\` then `a\\`b` and \\`x\\`'),{text:'Press ` then a`b and `x`',code:[[13,16]]});
  for(const raw of ['Press \\` then `a\\`b`','Set `highAvailability` and \\`no\\`'])assert.equal(withCodeTicks(codeSpans(raw)),raw);
  assert.equal(withCodeTicks({text:'Press `q` to quit'}),'Press \\`q\\` to quit');
  assert.deepEqual(textRuns(words).map(r=>[r.text,r.code]),[['High availability (',false],['highAvailability',true],[') is empty or omitted',false]]);
});

test('a composition sets code spans in the brand code font, or in Courier New when the brand names none',async()=>{
  const canvas={type:'stack',direction:'column',children:[{type:'text',id:'ha_text',text:lead},{type:'box',id:'ha_box',style:'tint',text:'Set `synchronous_mode` to `true`'}]};
  const plain=await compileComposition(deck(canvas,{caveat:{label:'Limit',text:'`synchronous_node_count` has no effect without HA'},subtitle:'Read `highAvailability` first',source:'Tanzu for Postgres 4.5 documentation'}),brand());
  const e=id=>byId(plain.scene,id);
  assert.equal(e('ha_text').text,'High availability (highAvailability) is empty or omitted');assert.deepEqual(e('ha_text').code,[[19,35]]);
  assert.deepEqual(e('ha_box').code,[[4,20],[24,28]]);assert.deepEqual(e('slide_one_caveat').code,[[0,22]]);assert.deepEqual(e('slide_one_subtitle').code,[[5,21]]);
  assert.equal(e('slide_one_source').code,undefined);
  const cover=await compileComposition({version:1,title:'Code spans',slides:[{id:'cover_one',title:'Operating Tanzu for Postgres',sources:['s1'],layout:'Cover',subtitle:'Field guide',detail:'Covers `highAvailability`'}]},brand());
  assert.deepEqual(cover.scene.slides[0].elements.find(x=>x.id==='cover_one_detail').code,[[7,23]]);
  assert.equal(plain.scene.theme.codeFont,'Courier New');assert.match(plain.report.codeMeasurement,/Courier New/);
  const branded=await compileComposition(deck(canvas),brand({code:{fontFamily:'Roboto Mono'}}));
  assert.equal(branded.scene.theme.codeFont,'Roboto Mono');assert.match(await composeSizes(brand({code:{fontFamily:'Roboto Mono'}})),/Code spans .* set in Roboto Mono, the brand's code type/);
  assert.match(await composeSizes(brand()),/set in Courier New, as the brand names no code type/);
  // A deck without code is unchanged: no code font in its theme, no code ranges and no code measurement.
  const none=await compileComposition(deck({type:'text',id:'ha_text',text:'High availability is empty or omitted'}),brand());
  assert.equal(none.scene.theme.codeFont,undefined);assert.equal(none.report.codeMeasurement,undefined);assert.ok(none.scene.slides[0].elements.every(x=>x.code===undefined));
});

test('code spans are refused where they cannot be drawn, and the code role is inline only',()=>{
  const c=brand(),words={type:'text',id:'ha_text',text:'x'};
  assert.throws(()=>validateComposition({...deck(words),slides:[{...deck(words).slides[0],title:'Set `highAvailability` first'}]},c),/a title is a plain-English claim/);
  assert.throws(()=>validateComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'from_box',text:'a'},{type:'spacer'},{type:'box',id:'to_box',text:'b'}]},{connect:[{id:'edge_one',from:'from_box',to:'to_box',label:'`sync`'}]}),c),/edge label has no code span/);
  assert.throws(()=>validateComposition(deck({type:'table',id:'field_table',rows:[['Field','Default'],['`synchronous_mode`','true']]}),c),/table cell has no code span/);
  assert.throws(()=>validateComposition(deck({type:'badge',id:'step_badge',text:'`a`'}),c),/badge has no code span/);
  assert.throws(()=>validateComposition(deck(words,{caveat:{label:'`x`',text:'y'}}),c),/caveat label has no code span/);
  assert.throws(()=>validateComposition(deck({type:'text',id:'ha_text',text:'x',textRole:'code'}),brand({code:{fontFamily:'Roboto Mono'}})),/code is set inline: put the name in backticks/);
  // The brand's code role names a font family; anything else is refused.
  for(const bad of [{fontFamily:'Mono; color:red'},{size:12},{fontFamily:'Roboto Mono',colorRole:'missing'},{fontFamily:'Roboto Mono',weight:400}])assert.throws(()=>validateBrandContract(brand({code:bad})),/Invalid brand typography: code/);
  assert.match(composeContract,/Code spans: configuration fields, commands, API and file names go in backticks/);
  assert.match(composeContract,/High availability \(`highAvailability`\) is empty or omitted/);
  assert.match(composeContract,/Texts, boxes, subtitle, detail, caveat and source take them/);
});

test('a code span is measured in the code font, so a long name that fits as prose may not fit as code',async t=>{
  const arial=(await resolveFont('Arial')).font,mono=(await resolveFont('Courier New')).font;
  if(arial&&mono){
    const words='Set minReplicas first';
    const prose=measureText(words,{font:arial,fontSize:20,width:400,height:1e6}),code=measureText(words,{font:arial,fontSize:20,width:400,height:1e6,code:[[4,15]],codeFont:mono});
    assert.ok(code.maxWidth>prose.maxWidth+10,`${code.maxWidth} > ${prose.maxWidth}`);
    // With the text font standing in for the code font, the result is exactly the plain measurement.
    const same=measureText(lead,{font:arial,fontSize:20,width:200,height:1e6,code:[[19,35]],codeFont:arial}),base=measureText(lead,{font:arial,fontSize:20,width:200,height:1e6});
    assert.deepEqual([same.lines,same.requiredHeight,same.maxWidth],[base.lines,base.requiredHeight,base.maxWidth]);
  } else t.diagnostic('Arial or Courier New missing; exact comparisons skipped');
  // Without the code font, code is estimated as monospace: 0.6 em a character.
  if(arial){const m=measureText('`x`',{font:arial,fontSize:20,width:400,height:1e6,code:[[0,3]]});assert.ok(Math.abs(m.maxWidth-36)<.01);assert.match(m.model,/estimated at 0.6 em/);}
  // In a narrow box the code word is wider than its line, which is refused (or warned about without fonts).
  const narrow=deck({type:'stack',direction:'row',children:[{type:'box',id:'wide_box',text:'Zone',weight:3},{type:'box',id:'field_box',text:'`synchronous_node_count`'}]});
  const exact=arial&&mono&&(await resolveFont('Arial',{bold:true})).font;
  if(exact)await assert.rejects(()=>compileComposition(narrow,brand()),/the word "synchronous_node_count" needs/);
  else{const {structure}=await compileComposition(narrow,brand());assert.ok((structure.unverifiedFit??[]).some(u=>/synchronous_node_count/.test(u.detail)));}
});

test('every writer draws code as runs in one text box: HTML, Google Slides, pptxgenjs and the native PPTX writer',async t=>{
  const canvas={type:'stack',direction:'column',children:[{type:'text',id:'ha_text',text:lead},{type:'box',id:'ha_box',text:'Line one\nwith `field_two` here'}]};
  const {scene}=await compileComposition(deck(canvas),brand());validateScene(scene);
  const html=renderSceneHtml(scene);
  assert.match(html,/<span>High availability \(<code style="font-family:'Courier New','Menlo','Consolas',monospace;font-size:inherit">highAvailability<\/code>\) is empty or omitted<\/span>/);
  // Google: the whole text in the brand font, then each code range in the code font.
  const page={presentationId:'test_deck',revisionId:'r1',pageSize:{width:{magnitude:960,unit:'PT'},height:{magnitude:540,unit:'PT'}},slides:[]},google=compileGoogleScene(scene,page);
  const ranged=google.requests.filter(r=>r.updateTextStyle?.textRange?.type==='FIXED_RANGE');
  assert.deepEqual(ranged.map(r=>[r.updateTextStyle.objectId,r.updateTextStyle.textRange.startIndex,r.updateTextStyle.textRange.endIndex,r.updateTextStyle.style.fontFamily,r.updateTextStyle.fields]),[['ha_text',19,35,'Courier New','fontFamily'],['ha_box',14,23,'Courier New','fontFamily']]);
  // Read back, a code run in the code font passes and one left in the text font is reported.
  const e=byId(scene,'ha_text'),run=(content,startIndex,fontFamily)=>({startIndex,textRun:{content,style:{fontFamily,fontSize:{magnitude:e.fontSize,unit:'PT'}}}});
  const read=runs=>({...page,slides:[{objectId:'slide_one',pageElements:[{objectId:'ha_text',size:{width:{magnitude:e.width,unit:'PT'},height:{magnitude:e.height,unit:'PT'}},transform:{scaleX:1,scaleY:1,translateX:e.x,translateY:e.y,unit:'PT'},shape:{text:{textElements:runs}}}]}]});
  const only={...scene,slides:[{...scene.slides[0],elements:[e]}]};
  verifyGoogleSceneReadback(only,read([run('High availability (',0,'Arial'),run('highAvailability',19,'Courier New'),run(') is empty or omitted\n',35,'Arial')]));
  assert.throws(()=>verifyGoogleSceneReadback(only,read([run('High availability (',0,'Arial'),run('highAvailability',19,'Arial'),run(') is empty or omitted\n',35,'Arial')])),/text typography/);
  // pptxgenjs: the code is its own run in the code face, in the same paragraph as its words.
  const dir=await temporary(t),simple=join(dir,'simple.pptx');await renderPptxScene(scene,simple);
  const xml=await part(simple,'ppt/slides/slide1.xml');
  assert.match(xml,/<a:latin typeface="Courier New"[^>]*\/>(?:(?!<\/a:r>).)*<a:t>highAvailability<\/a:t>/s);
  assert.match(xml,/<a:t>High availability \(<\/a:t>/);
  // A line break ends a paragraph; the code on the next line stays in that line's paragraph with its words.
  const paragraphs=[...xml.matchAll(/<a:p>(.*?)<\/a:p>/gs)].map(m=>[...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(x=>x[1]));
  // A paragraph has one set of paragraph properties, first, however many runs it holds (PptxGenJS writes one per run).
  for(const m of xml.matchAll(/<a:p>(.*?)<\/a:p>/gs)){const count=(m[1].match(/<a:pPr\b/g)??[]).length;assert.ok(count<=1,`${count} pPr in ${m[1].slice(0,120)}`);if(count)assert.match(m[1],/^<a:pPr\b/);}
  assert.ok(paragraphs.some(p=>p.join('|')==='Line one'));assert.ok(paragraphs.some(p=>p.join('|')==='with |field_two| here'),JSON.stringify(paragraphs));
  // Native: runs in one paragraph per line; the code run names Courier New as fixed pitch, so a missing font stays monospace.
  const nb=await nativeBrand(dir),built=await compileComposition(deck(canvas),nb),file=join(dir,'native.pptx');
  await emitNativePptx({...built,brand:nb,output:file,base:dir});const native=await part(file,'ppt/slides/harnessSlide1.xml');
  const shape=native.match(/name="ha_text".*?<\/p:sp>/s)[0];
  assert.equal((shape.match(/<a:p>/g)??[]).length,1);
  assert.match(shape,/<a:latin typeface="Arial"\/>(?:(?!<\/a:r>).)*<a:t>High availability \(<\/a:t>/s);
  assert.match(shape,/<a:latin typeface="Courier New" pitchFamily="49" charset="0"\/>(?:(?!<\/a:r>).)*<a:t>highAvailability<\/a:t>/s);
  const box=native.match(/name="ha_box".*?<\/p:sp>/s)[0];assert.equal((box.match(/<a:p>/g)??[]).length,2);assert.match(box,/<a:t>Line one<\/a:t>/);
});

test('the quality audit measures code in the code font, and a studio-style edit keeps code spans',async()=>{
  const {scene}=await compileComposition(deck({type:'text',id:'ha_text',text:lead}),brand());
  const report=await auditSceneQuality(scene),measured=report.measurements.find(m=>m.object==='ha_text');
  if(measured){assert.match(measured.model,/text and code fonts/);assert.ok(report.fontEvidence.some(f=>/^code /.test(f.weight)));}
  // A fonts record may name the code font's files too, for a brand monospace outside the system font folders.
  // (The stand-in records what was asked for and resolves the installed font, so it runs with or without the files.)
  const asked=[],resolve=async(family,{bold,file})=>{asked.push([family,bold,file]);return resolveFont(family,{bold});};
  await auditSceneQuality(scene,{fonts:{code:{path:'/fonts/Mono-Regular.ttf'},codeBold:{path:'/fonts/Mono-Bold.ttf'}},resolve});
  if((await resolveFont('Arial')).font)assert.ok(asked.some(([family,bold,file])=>family==='Courier New'&&!bold&&file==='/fonts/Mono-Regular.ttf'),JSON.stringify(asked));
  await assert.rejects(()=>auditSceneQuality(scene,{fonts:{mono:{path:'/x.ttf'}}}),/regular, bold, code and codeBold/);
  const compiled=await compileComposition(deck({type:'text',id:'ha_text',text:lead}),brand(),{fonts:{code:{path:'/no/such/Mono.ttf'}}}).catch(e=>e);
  assert.ok(compiled instanceof Error,'a named code font file that cannot be read is an error, not a silent estimate');
  assert.equal(withCodeTicks(byId(scene,'ha_text')),lead);
});

test('the outline check asks for code spans around names that read as code, and the draft shows them',async()=>{
  const c=brand(),slide=(points,extra={})=>({version:1,title:'D',slides:[{id:'slide_one',kind:'content',title:'Enable high availability first',understand:'U',relation:'none',points,sources:['s1'],...extra}]});
  const codes=async outline=>(await checkOutline(outline,c)).findings.filter(f=>f.code==='unmarked-code');
  const found=await codes(slide([{label:'HA off',text:'Empty or omitted highAvailability'},{text:'Defaults: synchronous_mode=true; see /etc/postgresql/postgresql.conf and values.yaml'}],{caveat:'MAX_CONNECTIONS is capped'}));
  assert.equal(found.length,1);for(const name of ['highAvailability','synchronous_mode','/etc/postgresql/postgresql.conf','values.yaml','MAX_CONNECTIONS'])assert.ok(found[0].detail.includes(`"${name}"`),name);
  assert.match(found[0].detail,/High availability \(`highAvailability`\)/);
  // Marked names, product names, versions, URLs and ordinary slashes are fine.
  assert.equal((await codes(slide([{text:lead},{text:'vSphere, macOS, iPhone, JavaScript, PostgreSQL 18, Node.js, TCP/IP, and/or, 24/7'},{text:'See https://docs.example.com/a_b/c/d.yaml'}]))).length,0);
  assert.deepEqual(unmarkedCode('Use ~/.kube/config or ./bin/run'),['~/.kube/config','./bin/run']);
  // A snake_case segment starts with a letter: architectures, standards and years are not code.
  assert.deepEqual(unmarkedCode('x86_64 hosts, ISO_27001, COVID_19 and max_wal_size'),['max_wal_size']);
  assert.deepEqual(unmarkedCode('Escaped \\`highAvailability\\` is still unmarked'),['highAvailability']);
  // A title names things in words: an unmarked name is a finding, and a code span is refused.
  const titled=await codes({...slide([{text:'x'}]),slides:[{...slide([{text:'x'}]).slides[0],title:'Set highAvailability first'}]});
  assert.match(titled[0].detail,/A title is a plain-English claim/);
  await assert.rejects(()=>checkOutline({...slide([{text:'x'}]),slides:[{...slide([{text:'x'}]).slides[0],title:'Set `highAvailability` first'}]},c),/a title is a plain-English claim/);
  const draft=await draftOutline(slide([{label:'HA off',text:lead}]),c);
  assert.match(draft.html,/High availability \(<code>highAvailability<\/code>\) is empty or omitted/);assert.match(draft.html,/code\{font-family:'Courier New','Menlo','Consolas',monospace/);
  assert.match(outlineContract,/code spans in backticks, with a plain-English lead the first time/);
});

test('a brand that forbids tints still gets brand-only colors with code spans and struck cards together',async()=>{
  const c=brand({tints:false}),{scene}=await compileComposition(deck({type:'stack',direction:'row',children:[{type:'box',id:'one_node',text:'One node'},{type:'box',id:'no_replicas',state:'struck',text:'Replicas'},{type:'text',id:'ha_text',text:lead}]}),c);
  const own=new Set(Object.values(c.design.colors));for(const x of scene.slides[0].elements)for(const k of ['fill','stroke','color'])if(x[k])assert.ok(own.has(x[k].toUpperCase()),`${x.id}.${k} ${x[k]}`);
});
