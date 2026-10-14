// Native charts in compositions: a chart node compiles to a scene chart, and the native template emitter writes it as a
// real chart part with its own embedded workbook, so the data stays editable in PowerPoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {temporary} from './fixtures.mjs';
import {chartBrand,chartComposition,part,audit} from './native-fixtures.mjs';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {hash} from '../scripts/lib/common.mjs';
import {validateComposition,compileComposition,composeContract} from '../scripts/lib/compose.mjs';
import {emitNativePptx} from '../scripts/lib/pptx-native.mjs';
import {renderPptxScene} from '../scripts/lib/pptx-render.mjs';

const exec=promisify(execFile),cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url));
const names=async file=>(await exec('unzip',['-Z1',file])).stdout.trim().split('\n');
const brandHex={headingPrimary:'2867B2',accentAqua:'0091DA',inkSecondary:'555555'};
const one=(canvas,extra={})=>({version:1,title:'Chart',slides:[{id:'chart_slide',title:'A chart',sources:['brief:test'],canvas,...extra}]});
const chart=(extra={},data={categories:['North','South'],series:[{name:'2026',values:[1,2]}]})=>({type:'chart',id:'test_chart',kind:'bar',data,...extra});

// The cells of an embedded workbook, as {A1: value}: shared strings resolved, numbers as numbers.
async function workbook(file,name) {
  const script=`import sys,zipfile,io,re,json
from xml.dom import minidom
outer=zipfile.ZipFile(sys.argv[1]);book=zipfile.ZipFile(io.BytesIO(outer.read(sys.argv[2])))
names=book.namelist();problems=[]
for n in names:
    if n.endswith('.xml') or n.endswith('.rels'):
        try: minidom.parseString(book.read(n))
        except Exception as e: problems.append('malformed '+n)
types=book.read('[Content_Types].xml').decode()
for p in re.findall(r'PartName="/([^"]+)"',types):
    if p not in names: problems.append('override without part '+p)
shared=[''.join(t.firstChild.data if t.firstChild else '' for t in si.getElementsByTagName('t')) for si in minidom.parseString(book.read('xl/sharedStrings.xml')).getElementsByTagName('si')]
sheet=minidom.parseString(book.read('xl/worksheets/sheet1.xml'));cells={}
for c in sheet.getElementsByTagName('c'):
    v=c.getElementsByTagName('v');value=v[0].firstChild.data if v else None
    cells[c.getAttribute('r')]=shared[int(value)] if c.getAttribute('t')=='s' else float(value)
sheets=[s.getAttribute('name') for s in minidom.parseString(book.read('xl/workbook.xml')).getElementsByTagName('sheet')]
print(json.dumps({'cells':cells,'sheets':sheets,'problems':problems}))`;
  return JSON.parse((await exec('python3',['-c',script,file,name])).stdout);
}
// Where a chart's formula points, read from the workbook: Sheet1!$B$2:$B$4 gives [B2,B3,B4].
const range=f=>{const [,col1,row1,col2,row2]=f.match(/^Sheet1!\$([A-Z])\$(\d+)(?::\$([A-Z])\$(\d+))?$/),out=[];for(let r=Number(row1);r<=Number(row2??row1);r++)for(let c=col1.charCodeAt(0);c<=(col2??col1).charCodeAt(0);c++)out.push(String.fromCharCode(c)+r);return out;};
const relsOf=xml=>Object.fromEntries([...xml.matchAll(/<Relationship Id="([^"]+)" Type="([^"]+)" Target="([^"]+)"\/>/g)].map(m=>[m[1],{type:m[2],target:m[3]}]));

test('a chart node compiles to a scene chart in the brand chart colors and label size',async t=>{
  const c=await chartBrand(await temporary(t)),{scene,structure}=await compileComposition(chartComposition(),c);
  const at=(slide,id)=>scene.slides[slide].elements.find(e=>e.id===id);
  const bar=at(0,'bookings_chart');
  assert.deepEqual([bar.type,bar.chartType,bar.title,bar.units,bar.source,bar.labelSize],['chart','bar','Bookings by region','$M','Finance close, Q3 2026',16]);
  assert.deepEqual(bar.series,[{name:'2025',labels:['North','South','West'],values:[12.5,9,7]},{name:'2026',labels:['North','South','West'],values:[15,11.25,8]}]);
  assert.deepEqual(bar.colors,['#2867B2','#0091DA','#555555']);
  // The node's own source is drawn as a caption beneath the chart; the chart is not grouped.
  const caption=at(0,'bookings_chart_source');assert.equal(caption.text,'Finance close, Q3 2026');assert.ok(caption.y>=bar.y+bar.height);
  assert.ok(!structure.groups.some(g=>g.members.includes('bookings_chart')));
  // Without its own source a chart cites the slide's source line, or else the slide's source IDs.
  assert.equal(at(1,'teams_chart').source,'Product analytics');assert.equal(at(2,'channel_chart').source,'brief:test');
  assert.equal(at(1,'teams_chart_source'),undefined);
  assert.equal(at(2,'channel_chart').units,undefined);
  assert.match(composeContract,/\{type:chart,id,kind:bar\|line\|pie,data:\{categories,series:\[\{name,values\}\]\},title\?,units\?,source\?\}/);
});

test('chart shapes, counts and numbers are checked with errors that say what to fix',async t=>{
  const c=await chartBrand(await temporary(t)),bad=(node,pattern)=>assert.throws(()=>validateComposition(one(node),c),pattern);
  bad(chart({kind:'area'}),/chart_slide\/test_chart: kind is bar, line or pie/);
  bad(chart({colour:'red'}),/unsupported node field/);
  bad({type:'chart',kind:'bar',data:{categories:['a','b'],series:[{name:'s',values:[1,2]}]}},/invalid or repeated ID/);
  bad({type:'chart',id:'test_chart',kind:'bar'},/data is \{categories,series\}/);
  bad(chart({},{categories:['a','b'],series:[{name:'s',values:[1,2]}],extra:1}),/data is \{categories,series\}/);
  bad(chart({},{categories:['only'],series:[{name:'s',values:[1]}]}),/2–24 categories/);
  bad(chart({},{categories:['a','a'],series:[{name:'s',values:[1,2]}]}),/categories must differ/);
  bad(chart({},{categories:['a',''],series:[{name:'s',values:[1,2]}]}),/2–24 categories, each a short label/);
  bad(chart({},{categories:['a','b'],series:[]}),/1–6 series/);
  bad(chart({},{categories:['a','b'],series:[{name:'s',values:[1]}]}),/series s has 1 values for 2 categories; give one number per category/);
  bad(chart({},{categories:['a','b'],series:[{name:'s',values:[1,'2']}]}),/series s: values are plain numbers/);
  bad(chart({},{categories:['a','b'],series:[{name:'s',values:[1,1e300]}]}),/series s: values are plain numbers/);
  bad(chart({},{categories:['a','b'],series:[{name:'s',values:[1,2]},{name:'s',values:[3,4]}]}),/series names must differ/);
  bad(chart({},{categories:['a','b'],series:[{values:[1,2]}]}),/each series is \{name,values\}/);
  bad(chart({},{categories:['a','b'],series:['w','x','y','z'].map(name=>({name,values:[1,2]}))}),/the brand has 3 chart colors \(headingPrimary, accentAqua, inkSecondary\), so a bar chart holds at most 3 series/);
  bad(chart({kind:'pie'},{categories:['a','b'],series:[{name:'s',values:[1,2]},{name:'t',values:[3,4]}]}),/a pie has one series/);
  bad(chart({kind:'pie'},{categories:['a','b'],series:[{name:'s',values:[3,-1]}]}),/a pie's values are zero or more, with a total above zero/);
  bad(chart({kind:'pie'},{categories:['a','b'],series:[{name:'s',values:[0,0]}]}),/a pie's values are zero or more, with a total above zero/);
  bad(chart({kind:'pie'},{categories:['a','b','c','d'],series:[{name:'s',values:[1,2,3,4]}]}),/so a pie holds at most 3 slices/);
  bad(chart({kind:'pie',units:'%'}),/a pie shows shares; put the units in its title/);
  for(const key of ['title','units','source'])bad(chart({[key]:' '}),new RegExp(`provide chart ${key} text or omit it`));
  // Every problem on the slide comes back from one run.
  assert.throws(()=>validateComposition(one({type:'stack',direction:'row',children:[chart({kind:'area'}),chart({id:'second_chart',units:'%'},{categories:['a'],series:[{name:'s',values:[1]}]})]}),c),/2 problems to fix/);
  // A chart draws a quantity.
  assert.equal(validateComposition(one(chart(),{brief:{relation:'quantity'}}),c).slides.length,1);
});

test('a chart refused by compose compile --json names its slide and what to fix',async t=>{
  const dir=await temporary(t),c=await chartBrand(dir),brandFile=join(dir,'brand.json'),file=join(dir,'composition.json');
  await writeFile(brandFile,JSON.stringify(c));await writeFile(file,JSON.stringify(one(chart({},{categories:['a','b'],series:[{name:'s',values:[1]}]}))));
  const failed=await exec('node',[cli,'compose','compile','--file',file,'--brand',brandFile,'--json']).then(()=>null,error=>error);
  assert.equal(failed?.code,1);
  const refusal=JSON.parse(failed.stdout);
  assert.equal(refusal.status,'blocked');assert.equal(refusal.problems.length,1);
  assert.deepEqual([refusal.problems[0].code,refusal.problems[0].slide,refusal.problems[0].recoverable],['composition-invalid','chart_slide',true]);
  assert.match(refusal.problems[0].detail,/give one number per category/);
});

test('bar, line and pie charts are written as native charts with embedded workbooks, in the brand colors',async t=>{
  const dir=await temporary(t),c=await chartBrand(dir),output=join(dir,'charts.pptx');
  const result=await emitNativePptx({...await compileComposition(chartComposition(),c),brand:c,output,base:dir});
  assert.equal(result.slides,3);
  assert.deepEqual(await audit(output),[]);
  const listed=await names(output),types=await part(output,'[Content_Types].xml');
  for(const n of [1,2,3]) {
    for(const name of [`ppt/charts/harnessChart${n}.xml`,`ppt/charts/_rels/harnessChart${n}.xml.rels`,`ppt/embeddings/harnessChart${n}.xlsx`])assert.ok(listed.includes(name),name);
    assert.match(types,new RegExp(`<Override PartName="/ppt/charts/harnessChart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart\\+xml"/>`));
  }
  assert.match(types,/<Default Extension="xlsx" ContentType="application\/vnd.openxmlformats-officedocument.spreadsheetml.sheet"\/>/);
  assert.equal(result.native.flatMap(r=>r.charts).length,3);
  const given=chartComposition().slides.map(s=>s.canvas);
  for(const [index,node] of given.entries()) {
    const n=index+1,slide=await part(output,`ppt/slides/harnessSlide${n}.xml`),slideRels=relsOf(await part(output,`ppt/slides/_rels/harnessSlide${n}.xml.rels`));
    // The slide holds one graphic frame named after the node, pointing through its relationships at the chart part.
    const frame=slide.match(new RegExp(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="\\d+" name="${node.id}" descr="[^"]+"/>.*?</p:graphicFrame>`,'s'));
    assert.ok(frame,`${node.id} has a graphic frame`);
    const rid=frame[0].match(/<a:graphicData uri="http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/chart"><c:chart xmlns:c="http:\/\/schemas.openxmlformats.org\/drawingml\/2006\/chart" r:id="(rId\d+)"\/><\/a:graphicData>/)[1];
    assert.deepEqual(slideRels[rid],{type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',target:`../charts/harnessChart${n}.xml`});
    const xml=await part(output,`ppt/charts/harnessChart${n}.xml`),chartRels=relsOf(await part(output,`ppt/charts/_rels/harnessChart${n}.xml.rels`));
    const external=xml.match(/<c:externalData r:id="(rId\d+)"><c:autoUpdate val="0"\/><\/c:externalData>/)[1];
    assert.deepEqual(chartRels[external],{type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',target:`../embeddings/harnessChart${n}.xlsx`});
    assert.match(xml,{bar:/<c:barChart><c:barDir val="col"\/><c:grouping val="clustered"\/><c:varyColors val="0"\/>/,line:/<c:lineChart><c:grouping val="standard"\/><c:varyColors val="0"\/>/,pie:/<c:pieChart><c:varyColors val="1"\/>/}[node.kind]);
    // Each series: its name, categories and values cached in the chart, and the same values in the workbook cells its formulas name.
    const book=await workbook(output,`ppt/embeddings/harnessChart${n}.xlsx`);
    assert.deepEqual(book.problems,[]);assert.deepEqual(book.sheets,['Sheet1']);
    const series=[...xml.matchAll(/<c:ser>(.*?)<\/c:ser>/gs)].map(m=>m[1]);
    assert.equal(series.length,node.data.series.length);
    for(const [i,s] of node.data.series.entries()) {
      const ser=series[i],name=ser.match(/<c:tx><c:strRef><c:f>([^<]+)<\/c:f><c:strCache><c:ptCount val="1"\/><c:pt idx="0"><c:v>([^<]+)<\/c:v><\/c:pt><\/c:strCache><\/c:strRef><\/c:tx>/);
      assert.equal(name[2],s.name);assert.deepEqual(range(name[1]).map(cell=>book.cells[cell]),[s.name]);
      const cat=ser.match(/<c:cat><c:strRef><c:f>([^<]+)<\/c:f><c:strCache>(.*?)<\/c:strCache><\/c:strRef><\/c:cat>/s),val=ser.match(/<c:val><c:numRef><c:f>([^<]+)<\/c:f><c:numCache><c:formatCode>General<\/c:formatCode>(.*?)<\/c:numCache><\/c:numRef><\/c:val>/s);
      const points=body=>[...body.matchAll(/<c:pt idx="(\d+)"><c:v>([^<]*)<\/c:v><\/c:pt>/g)].map(m=>m[2]);
      assert.deepEqual(points(cat[2]),node.data.categories);assert.match(cat[2],new RegExp(`^<c:ptCount val="${node.data.categories.length}"/>`));
      assert.deepEqual(points(val[2]).map(Number),s.values);
      assert.deepEqual(range(cat[1]).map(cell=>book.cells[cell]),node.data.categories);
      assert.deepEqual(range(val[1]).map(cell=>book.cells[cell]),s.values);
      // Colors: one per series for bar and line, one per slice for a pie, in the brand's chart order.
      const order=['headingPrimary','accentAqua','inkSecondary'];
      if(node.kind==='bar')assert.match(ser,new RegExp(`<c:spPr><a:solidFill><a:srgbClr val="${brandHex[order[i]]}"/></a:solidFill>`));
      if(node.kind==='line')assert.match(ser,new RegExp(`<c:spPr><a:ln w="\\d+" cap="rnd"><a:solidFill><a:srgbClr val="${brandHex[order[i]]}"/></a:solidFill>`));
      if(node.kind==='pie')assert.deepEqual([...ser.matchAll(/<c:dPt><c:idx val="(\d)"\/><c:bubble3D val="0"\/><c:spPr><a:solidFill><a:srgbClr val="([0-9A-F]{6})"\/>/g)].map(m=>[Number(m[1]),m[2]]),order.map((role,k)=>[k,brandHex[role]]));
    }
    // The title and the units are native chart text in the brand font; a chart without a title says so.
    if(node.title)assert.match(xml,new RegExp(`<c:title><c:tx><c:rich>.*?<a:t>${node.title}</a:t>.*?</c:title><c:autoTitleDeleted val="0"/>`,'s'));
    else assert.match(xml,/<c:chart><c:autoTitleDeleted val="1"\/>/);
    if(node.units)assert.match(xml,new RegExp(`<c:valAx>.*?<c:title><c:tx><c:rich>.*?<a:t>${node.units.replace('$','\\$')}</a:t>`,'s'));
    assert.match(xml,/<a:latin typeface="Arial"\/>/);assert.match(xml,/sz="1600"/);
  }
  // Two series need a legend; one series of bars or a line does not, and a pie labels its slices.
  assert.match(await part(output,'ppt/charts/harnessChart1.xml'),/<c:legend><c:legendPos val="b"\/>/);
  assert.doesNotMatch(await part(output,'ppt/charts/harnessChart2.xml'),/<c:legend>/);
  assert.match(await part(output,'ppt/charts/harnessChart3.xml'),/<c:showCatName val="1"\/><c:showSerName val="0"\/><c:showPercent val="1"\/>/);
});

test('chart text is escaped in the chart and the workbook',async t=>{
  const dir=await temporary(t),c=await chartBrand(dir),output=join(dir,'escaped.pptx');
  const comp=one({type:'chart',id:'risky_chart',kind:'bar',title:'R&D <net>',data:{categories:['A & B','"C"'],series:[{name:'Cost <est>',values:[-2.5,4]}]}});
  await emitNativePptx({...await compileComposition(comp,c),brand:c,output,base:dir});
  assert.deepEqual(await audit(output),[]);
  const xml=await part(output,'ppt/charts/harnessChart1.xml'),book=await workbook(output,'ppt/embeddings/harnessChart1.xlsx');
  assert.match(xml,/<a:t>R&amp;D &lt;net&gt;<\/a:t>/);assert.match(xml,/<c:v>A &amp; B<\/c:v>/);
  assert.deepEqual(book.problems,[]);assert.deepEqual([book.cells.A2,book.cells.A3,book.cells.B1,book.cells.B2],['A & B','"C"','Cost <est>',-2.5]);
});

test('a template\'s own sample chart is dropped with its slide, and the new chart does not collide with it',async t=>{
  const dir=await temporary(t),c=await chartBrand(dir),path=join(dir,'chart-template.pptx'),output=join(dir,'deck.pptx');
  await renderPptxScene({version:2,title:'Template',mode:'new',canvas:{width:960,height:540},slides:[{id:'sample_chart',title:'Sample',sources:['brief:test'],
    elements:[{id:'sample_data',type:'chart',x:40,y:40,width:400,height:300,chartType:'bar',series:[{name:'Old',labels:['x','y'],values:[1,2]}],source:'sample'}]}]},path);
  assert.ok((await names(path)).some(n=>/^ppt\/charts\/chart\d+\.xml$/.test(n)),'the template carries a chart of its own');
  const sha256=hash(await readFile(path)),next=structuredClone(c);next.sources=[{path,sha256}];Object.assign(next.design.nativeTemplate,{path,sha256});next.revision=contractRevision(next);
  await emitNativePptx({...await compileComposition(chartComposition(),next),brand:next,output,base:dir});
  assert.deepEqual(await audit(output),[]);
  const listed=await names(output);
  assert.deepEqual(listed.filter(n=>n.startsWith('ppt/charts/')||n.startsWith('ppt/embeddings/')).sort(),[1,2,3].flatMap(n=>[`ppt/charts/_rels/harnessChart${n}.xml.rels`,`ppt/charts/harnessChart${n}.xml`,`ppt/embeddings/harnessChart${n}.xlsx`]).sort());
  assert.doesNotMatch(await part(output,'[Content_Types].xml'),/PartName="\/ppt\/charts\/chart\d/);
});

test('a scene chart still renders through the generated deck, with its title and units',async t=>{
  const dir=await temporary(t),c=await chartBrand(dir),{scene}=await compileComposition(chartComposition(),c),output=join(dir,'scene-deck.pptx');
  await renderPptxScene(scene,output);
  const listed=await names(output);assert.equal(listed.filter(n=>/^ppt\/charts\/chart\d+\.xml$/.test(n)).length,3);
  const all=(await Promise.all(listed.filter(n=>/^ppt\/charts\/chart\d+\.xml$/.test(n)).map(n=>part(output,n)))).join('');
  assert.match(all,/Bookings by region/);assert.match(all,/\$M/);
});

test('native-charts is a reported capability',async()=>{
  const {capabilities}=await import('../scripts/lib/runtime-version.mjs');
  assert.ok(capabilities.includes('native-charts'));
});

test('the Google import acceptance deck for charts is prepared locally from the same fixtures, with what must survive',async t=>{
  const dir=await temporary(t),output=join(dir,'acceptance'),script=fileURLToPath(new URL('../scripts/acceptance/native-charts.mjs',import.meta.url));
  const result=JSON.parse((await exec('node',[script,'prepare',output])).stdout),expected=JSON.parse(await readFile(result.expected,'utf8'));
  assert.equal(result.slides,3);assert.equal(expected.deckSha256,hash(await readFile(result.deck)));assert.deepEqual(await audit(result.deck),[]);
  assert.deepEqual(expected.charts.map(x=>[x.slide,x.node,x.kind,x.title??null,x.colors.length]),[[1,'bookings_chart','bar','Bookings by region',2],[2,'teams_chart','line',null,1],[3,'channel_chart','pie','Bookings by channel',3]]);
  assert.deepEqual(expected.charts[0].series,[{name:'2025',values:[12.5,9,7]},{name:'2026',values:[15,11.25,8]}]);
  assert.deepEqual(expected.charts[2].colors,['#2867B2','#0091DA','#555555']);
  await assert.rejects(()=>exec('node',[script,'prepare',output]),/EEXIST/);
});
