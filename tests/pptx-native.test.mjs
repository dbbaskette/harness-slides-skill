import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {temporary} from './fixtures.mjs';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {hash} from '../scripts/lib/common.mjs';
import {compileComposition} from '../scripts/lib/compose.mjs';
import {renderPptxScene} from '../scripts/lib/pptx-render.mjs';
import {emitNativePptx} from '../scripts/lib/pptx-native.mjs';
import {pptxTool} from '../scripts/lib/presentation-tools.mjs';

const exec=promisify(execFile),cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url));
// unzip reads [ ] as a pattern, so the content-types part name must be escaped.
const part=async(file,name)=>(await exec('unzip',['-p',file,name.replace(/[[\]]/g,'\\$&')],{maxBuffer:32*1024*1024})).stdout;
const names=async file=>(await exec('unzip',['-Z1',file])).stdout.trim().split('\n');
// A 1x1 PNG, enough for the emitter to embed and measure.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAC0lEQVR4nGNgQAYAAA4AAamRc7EAAAAASUVORK5CYII=','base64');

import {brand} from './native-fixtures.mjs';
const flow=()=>({version:1,title:'Native deck',slides:[{id:'flow_slide',title:'Requests pass through stages',sources:['brief:test'],notes:'First line\nSecond & <last>',
  canvas:{type:'stack',direction:'row',gap:'none',children:[
    {type:'box',id:'node_from',shape:'roundRect',fill:'headingPrimary',color:'canvasPrimary',text:'Edge & <auth>',align:'center'},{type:'spacer',weight:.4},
    {type:'box',id:'node_card',children:[{type:'text',id:'card_head',text:'Router',textRole:'label'},{type:'text',id:'card_body',text:'Chooses a backend.'}]}]},
  connect:[{id:'edge_one',from:'node_from',to:'node_card',label:'token'}]}]});
async function build(t,comp=flow(),options) {
  const dir=await temporary(t),c=await brand(dir,options),compiled=await compileComposition(comp,c),output=join(dir,'deck.pptx');
  return {dir,c,output,...compiled,result:await emitNativePptx({scene:compiled.scene,structure:compiled.structure,brand:c,output,base:dir})};
}

test('slides replace the template samples and keep its master, layout and theme bytes',async t=>{
  const {output,c,result}=await build(t),list=await names(output),source=c.design.nativeTemplate.path;
  assert.equal(result.slides,1);assert.equal(result.emitter,'native template');assert.ok(result.removedTemplateParts>=2);
  assert.deepEqual(list.filter(n=>/^ppt\/slides\/[^_/]+\.xml$/.test(n)),['ppt/slides/harnessSlide1.xml']);
  assert.equal(list.filter(n=>n.startsWith('ppt/notesSlides/')&&n.endsWith('.xml')&&!n.includes('_rels')).length,1);
  for(const name of ['ppt/slideMasters/slideMaster1.xml','ppt/slideLayouts/slideLayout1.xml','ppt/theme/theme1.xml'])assert.equal(await part(output,name),await part(source,name));
  const types=await part(output,'[Content_Types].xml'),presentation=await part(output,'ppt/presentation.xml'),rels=await part(output,'ppt/_rels/presentation.xml.rels');
  assert.equal((presentation.match(/<p:sldId /g)??[]).length,1);assert.equal((rels.match(/relationships\/slide"/g)??[]).length,1);
  for(const m of types.matchAll(/PartName="\/([^"]+)"/g))assert.ok(list.includes(m[1]),`content type names a missing part: ${m[1]}`);
  const inventory=await pptxTool('inspect',[output]);assert.equal(inventory.slides.length,1);assert.equal(inventory.slides[0].layoutPart,'ppt/slideLayouts/slideLayout1.xml');
});

test('the title uses the layout placeholder and shape text lives inside its shape',async t=>{
  const {output,result}=await build(t),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.equal(result.titlePlaceholder,'title');assert.equal(result.native[0].titlePlaceholder,true);
  const title=xml.match(/<p:sp>(?:(?!<\/p:sp>).)*<p:ph type="title"\/>.*?<\/p:sp>/s)[0];
  assert.match(title,/<p:spPr\/>/);assert.match(title,/Requests pass through stages/);assert.doesNotMatch(title,/a:xfrm/);
  const shape=xml.match(/<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="node_from"\/>.*?<\/p:sp>/s)[0];
  assert.match(shape,/prst="roundRect"/);assert.match(shape,/<a:srgbClr val="2867B2"\/>/);assert.match(shape,/<a:t>Edge &amp; &lt;auth&gt;<\/a:t>/);assert.match(shape,/lIns="228600"/);assert.match(shape,/anchor="ctr"/);assert.match(shape,/algn="ctr"/);
  assert.doesNotMatch(xml,/node_from_text/);
});

test('a template layout without a title placeholder gets a positioned title text box',async t=>{
  const {output,result}=await build(t,flow(),{title:false}),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.equal(result.titlePlaceholder,null);assert.doesNotMatch(xml,/<p:ph /);
  assert.match(xml,/name="flow_slide_title"\/><p:cNvSpPr txBox="1">/);
});

test('edges attach to the facing connection sites and box children form a group',async t=>{
  const {output,result}=await build(t),xml=await part(output,'ppt/slides/harnessSlide1.xml'),id=name=>xml.match(new RegExp(`<p:cNvPr id="(\\d+)" name="${name}"`))[1];
  assert.deepEqual(result.native[0].attached,['edge_one']);assert.deepEqual(result.native[0].unattached,[]);assert.deepEqual(result.native[0].groups,['node_card_group']);
  const connector=xml.match(/<p:cxnSp>.*?<\/p:cxnSp>/s)[0];
  assert.match(connector,new RegExp(`<a:stCxn id="${id('node_from')}" idx="3"/><a:endCxn id="${id('node_card')}" idx="1"/>`));
  assert.match(connector,/<a:ext cx="\d+" cy="0"\/>/);assert.match(connector,/<a:tailEnd type="triangle"\/>/);
  const group=xml.match(/<p:grpSp>.*?<\/p:grpSp>/s)[0];
  for(const name of ['node_card_group','node_card','card_head','card_body'])assert.match(group,new RegExp(`name="${name}"`));
  assert.doesNotMatch(group,/name="node_from"/);
  const ids=[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('an edge to a shape without known connection sites is drawn but reported unattached',async t=>{
  const comp=flow();comp.slides[0].canvas.children[0].shape='hexagon';
  const {output,result}=await build(t,comp),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.deepEqual(result.native[0].unattached,['edge_one']);assert.match(xml,/<p:cxnSp>/);assert.doesNotMatch(xml,/stCxn/);
});

test('nested groups are written inside their parent group',async t=>{
  const comp=flow();Object.assign(comp.slides[0].canvas,{id:'whole_row',group:true});
  const {output,result}=await build(t,comp),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.deepEqual(result.native[0].groups.sort(),['node_card_group','whole_row']);
  const outer=xml.match(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="whole_row"\/>.*<\/p:grpSp>/s)[0];
  assert.match(outer,/name="node_from"/);assert.match(outer,/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="node_card_group"\/>/);
  assert.equal((xml.match(/<p:grpSp>/g)??[]).length,(xml.match(/<\/p:grpSp>/g)??[]).length);
});

test('notes use the template notes master and escape their text',async t=>{
  const {output}=await build(t),list=await names(output),notes=list.find(n=>/^ppt\/notesSlides\/harnessNotes1\.xml$/.test(n));
  assert.ok(notes);const xml=await part(output,notes),rels=await part(output,'ppt/notesSlides/_rels/harnessNotes1.xml.rels');
  assert.match(xml,/<a:t>First line<\/a:t>/);assert.match(xml,/<a:t>Second &amp; &lt;last&gt;<\/a:t>/);
  assert.match(rels,/notesMasters\/notesMaster1\.xml/);assert.match(rels,/slides\/harnessSlide1\.xml/);
  assert.match(await part(output,'ppt/slides/_rels/harnessSlide1.xml.rels'),/notesSlides\/harnessNotes1\.xml/);
  assert.match(await part(output,'[Content_Types].xml'),/PartName="\/ppt\/notesSlides\/harnessNotes1\.xml" ContentType="[^"]*notesSlide\+xml"/);
});

test('images are embedded with alt text, fitted for contain and cropped for cover',async t=>{
  const dir=await temporary(t);await writeFile(join(dir,'wide.png'),png);
  const comp=fit=>({version:1,title:'Images',slides:[{id:'image_slide',title:'An image',sources:['brief:test'],canvas:{type:'image',id:'wide_image',src:'wide.png',alt:'A "wide" picture',fit}}]});
  const c=await brand(dir),render=async(fit,name)=>{const compiled=await compileComposition(comp(fit),c),output=join(dir,name);await emitNativePptx({...compiled,brand:c,output,base:dir});return output;};
  const contain=await render('contain','contain.pptx'),xml=await part(contain,'ppt/slides/harnessSlide1.xml'),list=await names(contain);
  assert.equal(list.filter(n=>/^ppt\/media\/harness-[0-9a-f]{16}\.png$/.test(n)).length,1);
  assert.match(xml,/descr='A "wide" picture'/);assert.match(xml,/<a:blip r:embed="rId2"\/>/);assert.doesNotMatch(xml,/srcRect/);
  const ext=xml.match(/<p:pic>.*?<a:ext cx="(\d+)" cy="(\d+)"\/>/s);assert.equal(Math.round(ext[1]/ext[2]),2);
  assert.match(await part(contain,'ppt/slides/_rels/harnessSlide1.xml.rels'),/relationships\/image" Target="\.\.\/media\/harness-/);
  assert.match(await part(await render('cover','cover.pptx'),'ppt/slides/harnessSlide1.xml'),/<a:srcRect t="\d+" b="\d+"\/>/);
});

test('unsupported scene objects and a missing template are refused by name',async t=>{
  const dir=await temporary(t),c=await brand(dir),{scene,structure}=await compileComposition(flow(),c);
  const table=structuredClone(scene);table.slides[0].elements.push({id:'data_table',type:'table',x:48,y:300,width:400,height:80,rows:[['a','b'],['c','d']]});
  await assert.rejects(()=>emitNativePptx({scene:table,structure,brand:c,output:join(dir,'t.pptx')}),/data_table: the native emitter does not write table objects yet/);
  const plain=structuredClone(c);delete plain.design.nativeTemplate;plain.revision=contractRevision(plain);
  await assert.rejects(()=>emitNativePptx({scene,structure,brand:plain,output:join(dir,'p.pptx')}),/needs a brand contract with a native template/);
  await emitNativePptx({scene,structure,brand:c,output:join(dir,'once.pptx')});
  await assert.rejects(()=>emitNativePptx({scene,structure,brand:c,output:join(dir,'once.pptx')}),/exists/i);
});

test('compose render picks the native emitter for a branded folder and the generated deck otherwise',async t=>{
  const dir=await temporary(t),c=await brand(dir),brandFile=join(dir,'brand.json'),comp=join(dir,'composition.json');
  await writeFile(brandFile,JSON.stringify(c));await writeFile(comp,JSON.stringify(flow()));
  await exec('node',[cli,'compose','compile','--file',comp,'--brand',brandFile,'--output',join(dir,'branded')]);
  const native=JSON.parse((await exec('node',[cli,'compose','render','--file',join(dir,'branded'),'--output',join(dir,'branded.pptx')])).stdout);
  assert.equal(native.emitter,'native template');assert.equal(native.titlePlaceholder,'title');
  await exec('node',[cli,'compose','compile','--file',comp,'--output',join(dir,'neutral')]);
  const plain=JSON.parse((await exec('node',[cli,'compose','render','--file',join(dir,'neutral'),'--output',join(dir,'neutral.pptx')])).stdout);
  assert.match(plain.emitter,/no native template/);assert.equal(plain.slides,1);
});

test('preset shapes keep a small inset and a chevron pins its point depth to its width',async t=>{
  const comp={version:1,title:'Shapes',slides:[{id:'shape_slide',title:'Shapes',sources:['brief:test'],canvas:{type:'grid',columns:3,children:[
    {type:'box',id:'plain_rect',shape:'rect',text:'rect'},{type:'box',id:'wide_chevron',shape:'chevron',text:'next'},{type:'box',id:'inner_diamond',shape:'diamond',text:'ok'}]}}]};
  const {output}=await build(t,comp),xml=await part(output,'ppt/slides/harnessSlide1.xml'),shape=name=>xml.match(new RegExp(`<p:sp><p:nvSpPr><p:cNvPr id="\\d+" name="${name}"/>.*?</p:sp>`,'s'))[0];
  assert.match(shape('plain_rect'),/lIns="228600"/);assert.match(shape('inner_diamond'),/lIns="45720"/);
  // The cell is 276pt wide and 360pt tall, so a fifth of the width is 20000 units of the shorter side.
  assert.match(shape('wide_chevron'),/<a:gd name="adj" fmla="val 20000"\/>/);assert.match(shape('wide_chevron'),/lIns="45720"/);
});

// Package-level checks a strict reader would make.
async function audit(file) {
  const script=`import sys,zipfile,re,posixpath,json
from xml.dom import minidom
z=zipfile.ZipFile(sys.argv[1]);names=set(z.namelist());problems=[]
for n in names:
    if n.endswith('.xml') or n.endswith('.rels'):
        try: minidom.parseString(z.read(n))
        except Exception as e: problems.append('malformed '+n+': '+str(e))
types=z.read('[Content_Types].xml').decode()
seen=re.findall(r'PartName="/([^"]+)"',types)
problems+=['duplicate override '+p for p in set(seen) if seen.count(p)>1]
problems+=['override without part '+p for p in seen if p not in names]
for n in names:
    if not n.endswith('.rels'): continue
    folder=posixpath.dirname(posixpath.dirname(n))
    for tag in re.findall(r'<Relationship\\b[^>]*>',z.read(n).decode()):
        if 'TargetMode="External"' in tag: continue
        t=re.search(r'Target="([^"]*)"',tag).group(1)
        path=t[1:] if t.startswith('/') else posixpath.normpath(posixpath.join(folder,t))
        if path not in names: problems.append('dangling '+n+' -> '+path)
print(json.dumps(sorted(problems)))`;
  return JSON.parse((await exec('python3',['-c',script,file])).stdout);
}
// Rewrite template parts the way other producers write them.
async function rewrite(source,target,edits) {
  const script=`import sys,zipfile,json
src,dst,edits=sys.argv[1],sys.argv[2],json.loads(sys.argv[3])
with zipfile.ZipFile(src) as a, zipfile.ZipFile(dst,'x',zipfile.ZIP_DEFLATED) as b:
    for i in a.infolist():
        if i.filename in edits.get('drop',[]): continue
        data=a.read(i).decode('utf-8','surrogateescape') if i.filename.endswith(('.xml','.rels')) else a.read(i)
        for find,replace in edits.get('replace',{}).get(i.filename,[]): data=data.replace(find,replace)
        b.writestr(i,data.encode('utf-8','surrogateescape') if isinstance(data,str) else data)
    for name,text in edits.get('add',{}).items(): b.writestr(name,text)`;
  await exec('python3',['-c',script,source,target,JSON.stringify(edits)]);
}
async function rebrand(c,path) {
  const sha256=hash(await readFile(path)),next=structuredClone(c);
  next.sources=[{path,sha256}];Object.assign(next.design.nativeTemplate,{path,sha256});next.revision=contractRevision(next);return next;
}

test('the emitted package is well formed, with unique content types and no dangling relationships',async t=>{
  const {output}=await build(t);
  assert.deepEqual(await audit(output),[]);
  assert.ok((await names(output)).includes('ppt/slides/harnessSlide1.xml'));
});

test('templates written with paired tags, stale view relationships or no slides still emit a clean package',async t=>{
  const dir=await temporary(t),c=await brand(dir),source=c.design.nativeTemplate.path,{scene,structure}=await compileComposition(flow(),c);
  const rels=await part(source,'ppt/_rels/presentation.xml.rels'),types=await part(source,'[Content_Types].xml');
  const paired=join(dir,'paired.pptx');
  await rewrite(source,paired,{replace:{'ppt/_rels/presentation.xml.rels':[[rels,rels.replace(/<Relationship ([^>]*)\/>/g,'<Relationship $1></Relationship>')]],'[Content_Types].xml':[[types,types.replace(/<Override ([^>]*)\/>/g,'<Override $1></Override>')]]},
    add:{'ppt/_rels/viewProps.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>'}});
  const first=join(dir,'paired-out.pptx');await emitNativePptx({scene,structure,brand:await rebrand(c,paired),output:first,base:dir});
  assert.deepEqual(await audit(first),[]);
  assert.equal(((await part(first,'ppt/_rels/presentation.xml.rels')).match(/relationships\/slide"/g)??[]).length,1);
  const presentation=await part(source,'ppt/presentation.xml'),empty=join(dir,'empty.pptx');
  await rewrite(source,empty,{drop:['ppt/slides/slide1.xml','ppt/slides/slide2.xml','ppt/slides/_rels/slide1.xml.rels','ppt/slides/_rels/slide2.xml.rels'],
    replace:{'ppt/presentation.xml':[[presentation.match(/<p:sldIdLst>.*<\/p:sldIdLst>/s)[0],'']],'ppt/_rels/presentation.xml.rels':[[rels,rels.replace(/<Relationship [^>]*relationships\/slide"[^>]*\/>/g,'')]],'[Content_Types].xml':[[types,types.replace(/<Override [^>]*\/ppt\/slides\/[^>]*\/>/g,'')]]}});
  const second=join(dir,'empty-out.pptx');await emitNativePptx({scene,structure,brand:await rebrand(c,empty),output:second,base:dir});
  assert.deepEqual(await audit(second),[]);assert.match(await part(second,'ppt/presentation.xml'),/<p:sldIdLst><p:sldId id="256" r:id="rId\d+"\/><\/p:sldIdLst><p:sldSz/);
});

test('hand-edited structure that would corrupt the slide is refused, and failures leave no partial file',async t=>{
  const dir=await temporary(t),c=await brand(dir),{scene,structure}=await compileComposition(flow(),c),out=name=>join(dir,name);
  const emit=(groups,name)=>emitNativePptx({scene,structure:{...structure,groups},brand:c,output:out(name),base:dir});
  await assert.rejects(()=>emit([{slide:'flow_slide',id:'node_from',members:['node_card','card_head']}],'a.pptx'),/group ID node_from repeats an element ID/);
  await assert.rejects(()=>emit([{slide:'flow_slide',id:'title_group',members:['flow_slide_title','node_from']}],'b.pptx'),/title cannot be grouped/);
  await assert.rejects(()=>emit([{slide:'flow_slide',id:'gap_group',members:['node_from','card_body']}],'c.pptx'),/members must be consecutive/);
  await assert.rejects(()=>emit([{slide:'flow_slide',id:'ghost_group',members:['node_from','missing_node']}],'d.pptx'),/two or more elements of its slide/);
    const {readdir}=await import('node:fs/promises');assert.deepEqual((await readdir(dir)).filter(n=>/^[abcd]\.pptx$/.test(n)),[]);
});

test('image type comes from the file contents and alt text cannot break the slide',async t=>{
  const dir=await temporary(t);await writeFile(join(dir,'mislabelled.jpg'),png);
  const comp={version:1,title:'Images',slides:[{id:'image_slide',title:'An image',sources:['brief:test'],canvas:{type:'image',id:'odd_image',src:'mislabelled.jpg',alt:'Control \u0001 character'}}]};
  const c=await brand(dir),compiled=await compileComposition(comp,c),output=join(dir,'image.pptx');
  await emitNativePptx({...compiled,brand:c,output,base:dir});
  assert.deepEqual(await audit(output),[]);
  assert.equal((await names(output)).filter(n=>/^ppt\/media\/harness-[0-9a-f]{16}\.png$/.test(n)).length,1);
  assert.match(await part(output,'ppt/slides/harnessSlide1.xml'),/descr="Control  character"/);
});

// A one-slide "library" whose two shapes form one icon, with the index the brand would ship.
async function iconLibrary(dir) {
  const path=join(dir,'icons.pptx'),index=join(dir,'icon-index.json');
  await renderPptxScene({version:2,title:'Icons',mode:'new',canvas:{width:960,height:540},slides:[{id:'icon_page',title:'Icons',sources:['brief:test'],elements:[
    {id:'icon_ring',type:'shape',shape:'ellipse',x:100,y:100,width:80,height:40,fill:'#2867B2'},{id:'icon_core',type:'shape',shape:'rect',x:130,y:110,width:20,height:20,fill:'#FFFFFF'}]}]},path);
  const objects=(await pptxTool('inspect',[path])).slides[0].objects,ids=['icon_ring','icon_core'].map(name=>objects.find(o=>o.name===name).id);
  await writeFile(index,JSON.stringify({schemaVersion:1,sourceSha256:hash(await readFile(path)),entries:[
    {id:'fi-test-s001-l001',slide:1,labelIndex:1,label:'Test ring',shapeIds:ids,bounds:[100*12700,100*12700,80*12700,40*12700],native:true},
    {id:'fi-test-s001-l002',slide:1,labelIndex:2,label:'A picture',shapeIds:ids,bounds:[0,0,12700,12700],native:false}]}));
  return {path,index};
}
async function withIcons(dir,c) {
  const library=await iconLibrary(dir),next=structuredClone(c);
  next.design.slides.icon={size:54,library};
  for(const path of [library.path,library.index])next.sources.push({path,kind:'icon library',sha256:hash(await readFile(path))});
  next.revision=contractRevision(next);return next;
}
const iconDeck=icon=>({version:1,title:'Icons',slides:[{id:'icon_slide',title:'An icon',sources:['brief:test'],canvas:{type:'stack',direction:'row',children:[{type:'icon',id:'lead_icon',icon},{type:'box',id:'side_box',text:'Beside it',weight:3}]}}]});

test('icons are copied from the brand library as grouped native geometry, fitted and centred in their slot',async t=>{
  const dir=await temporary(t),c=await withIcons(dir,await brand(dir)),compiled=await compileComposition(iconDeck('fi-test-s001-l001'),c),output=join(dir,'icons-deck.pptx');
  assert.deepEqual(compiled.structure.icons.map(i=>[i.slide,i.id,i.icon,i.width,i.height,i.order]),[['icon_slide','lead_icon','fi-test-s001-l001',108,108,1]]);
  assert.ok(!compiled.scene.slides[0].elements.some(e=>e.id==='lead_icon'));
  const result=await emitNativePptx({...compiled,brand:c,output,base:dir}),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.deepEqual(result.icons,[{id:'lead_icon',icon:'fi-test-s001-l001',label:'Test ring'}]);assert.deepEqual(await audit(output),[]);
  const group=xml.match(/<p:grpSp(?: [^>]*)?>(?:(?!<\/p:grpSp>).)*name="lead_icon".*?<\/p:grpSp>/s)[0],slot=compiled.structure.icons[0];
  assert.match(group,/descr="Test ring"/);assert.match(group,/prst="ellipse"/);assert.doesNotMatch(group,/<p:pic>/);
  const [,x,y]=group.match(/<a:off x="(\d+)" y="(\d+)"/),[,cx,cy]=group.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  // The 2:1 icon fills the slot's width and is centred vertically in it.
  assert.equal(Math.round(cx/12700),108);assert.equal(Math.round(cy/12700),54);assert.equal(Math.round(x/12700),Math.round(slot.x));assert.equal(Math.round(y/12700),Math.round(slot.y+27));
  const ids=[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('icon problems are reported against the composition node and leave no output',async t=>{
  const dir=await temporary(t),plain=await brand(dir),c=await withIcons(dir,plain),{readdir}=await import('node:fs/promises');
  const emit=async(icon,contract,name)=>emitNativePptx({...await compileComposition(iconDeck(icon),contract),brand:contract,output:join(dir,name),base:dir});
  await assert.rejects(()=>emit('fi-test-s001-l001',plain,'a.pptx'),/names no icon library/);
  await assert.rejects(()=>emit('fi-missing',c,'b.pptx'),/lead_icon: unknown icon fi-missing/);
  await assert.rejects(()=>emit('fi-test-s001-l002',c,'c.pptx'),/lead_icon: icon fi-test-s001-l002 is a picture/);
  assert.deepEqual((await readdir(dir)).filter(n=>/^[abc]\.pptx$/.test(n)),[]);
  await assert.rejects(()=>compileComposition(iconDeck('not an id!'),c),/stable icon ID/);
  const narrow={version:1,title:'Icons',slides:[{id:'icon_slide',title:'t',sources:['brief:test'],canvas:{type:'grid',columns:6,gap:'wide',children:Array.from({length:6},(_,i)=>({type:'stack',direction:'row',gap:'wide',children:[{type:'icon',id:`tiny_icon${i}`,icon:'fi-test-s001-l001'},{type:'spacer'},{type:'spacer'}]}))}}]};
  await assert.rejects(()=>compileComposition(narrow,c),/needs 54pt of width for an icon/);
});

test('an icon inside a card joins the card group, keeps its own size in a column and is named after its node',async t=>{
  const dir=await temporary(t),c=await withIcons(dir,await brand(dir)),output=join(dir,'card.pptx');
  const comp={version:1,title:'Card',slides:[{id:'card_slide',title:'A card',sources:['brief:test'],notes:'Notes stay.',canvas:{type:'stack',direction:'row',gap:'none',children:[
    {type:'box',id:'node_from',text:'Start'},{type:'spacer',weight:.4},{type:'box',id:'icon_card',children:[{type:'icon',id:'card_icon',icon:'fi-test-s001-l001'},{type:'text',id:'card_text',text:'Caption'}]}]},connect:[{id:'edge_one',from:'node_from',to:'icon_card'}]}]};
  const compiled=await compileComposition(comp,c),icon=compiled.structure.icons[0],caption=compiled.scene.slides[0].elements.find(e=>e.id==='card_text');
  assert.equal(icon.height,54);assert.equal(Math.round(caption.y-(icon.y+icon.height)),18);
  assert.deepEqual(compiled.structure.groups,[{slide:'card_slide',id:'icon_card_group',members:['icon_card','card_icon','card_text']}]);
  const result=await emitNativePptx({...compiled,brand:c,output,base:dir}),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.deepEqual(await audit(output),[]);assert.deepEqual(result.native[0].attached,['edge_one']);
  const card=xml.match(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\d+" name="icon_card_group"\/>.*<\/p:grpSp>/s)[0];
  assert.match(card,/name="card_icon"/);assert.match(card,/name="card_icon_part1"/);assert.match(card,/name="card_text"/);
  assert.ok(card.indexOf('name="icon_card"')<card.indexOf('name="card_icon"')&&card.indexOf('name="card_icon"')<card.indexOf('name="card_text"'));
  const ids=[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('icons are refused rather than dropped when the brand has no native template',async t=>{
  const dir=await temporary(t),c=await withIcons(dir,await brand(dir)),{mkdir}=await import('node:fs/promises'),compiled=await compileComposition(iconDeck('fi-test-s001-l001'),c);
  const plain=structuredClone(c);delete plain.design.nativeTemplate;plain.revision=contractRevision(plain);
  const folder=join(dir,'compiled');await mkdir(folder);for(const [name,value] of [['scene.json',compiled.scene],['structure.json',compiled.structure],['brand-contract.json',plain]])await writeFile(join(folder,name),JSON.stringify(value));
  const {renderCompositionDir}=await import('../scripts/lib/compose-file.mjs');
  await assert.rejects(()=>renderCompositionDir({file:folder,output:join(dir,'dropped.pptx')}),/uses icons, which need a brand with a native template/);
});

test('several icon cards on one slide each keep their icon inside their own group',async t=>{
  const dir=await temporary(t),c=await withIcons(dir,await brand(dir)),output=join(dir,'cards.pptx');
  const card=n=>({type:'box',id:`card_${n}`,children:[{type:'icon',id:`icon_${n}`,icon:'fi-test-s001-l001'},{type:'text',id:`text_${n}`,text:`Card ${n}`}]});
  const compiled=await compileComposition({version:1,title:'Cards',slides:[{id:'cards_slide',title:'Cards',sources:['brief:test'],canvas:{type:'grid',columns:3,children:['one','two','three'].map(card)}}]},c);
  const result=await emitNativePptx({...compiled,brand:c,output,base:dir}),xml=await part(output,'ppt/slides/harnessSlide1.xml');
  assert.deepEqual(result.native[0].groups,['card_one_group','card_two_group','card_three_group']);assert.equal(result.icons.length,3);assert.deepEqual(await audit(output),[]);
  for(const n of ['one','two','three']){const group=xml.match(new RegExp(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\\d+" name="card_${n}_group"/>.*?name="text_${n}"`,'s'))[0];assert.match(group,new RegExp(`name="icon_${n}"`));}
});
