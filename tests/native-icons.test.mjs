// End to end: a composition with library icons and an editable diagram, through compose compile and compose render,
// keeps each icon's vector geometry and identity and every diagram shape as a native, attached, editable object.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {temporary} from './fixtures.mjs';
import {iconBrand,iconComposition,part,audit,geometry} from './native-fixtures.mjs';
import {pptxTool} from '../scripts/lib/presentation-tools.mjs';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {hash} from '../scripts/lib/common.mjs';
import {compileComposition} from '../scripts/lib/compose.mjs';
import {emitNativePptx} from '../scripts/lib/pptx-native.mjs';

const exec=promisify(execFile),cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url)),emu=pt=>Math.round(pt*12700);
const run=async(...args)=>JSON.parse((await exec('node',[cli,...args],{maxBuffer:16*1024*1024})).stdout);
const numbers=xml=>[...xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)].reduce((all,[,id,name])=>({...all,[name]:id}),{});
// An icon group holds only shapes, so its first close tag ends it. Copied library groups repeat their namespace declarations.
const iconGroup=(xml,id)=>xml.match(new RegExp(`<p:grpSp(?: [^>]*)?><p:nvGrpSpPr><p:cNvPr id="\\d+" name="${id}"[^>]*>.*?</p:grpSp>`,'s'))?.[0];
const frame=(xml,tag)=>{const m=xml.match(new RegExp(`<a:${tag} (?:x|cx)="(-?\\d+)" (?:y|cy)="(-?\\d+)" ?/>`));return m&&[Number(m[1]),Number(m[2])];};

test('icons and an editable diagram compile to native PPTX with their geometry, identities and connections intact',async t=>{
  const dir=await temporary(t),{contract,icons}=await iconBrand(dir),byLabel=Object.fromEntries(icons.map(i=>[i.label,i]));
  const id=Object.fromEntries(icons.map(i=>[i.label,i.entry.id])),library=await part(contract.design.slides.icon.library.path,'ppt/slides/slide1.xml');
  for(const icon of icons)assert.ok(icon.entry?.native,`${icon.label} is indexed as native geometry`);
  // The label table shares a shape ID with the first icon's disc, as generated decks can. It is not part of the icon and must not be copied.
  assert.equal(library.match(/<p:graphicFrame>.*?<p:cNvPr id="(\d+)"/s)[1],icons[0].entry.shapeIds[0]);
  const brandFile=join(dir,'brand.json'),compFile=join(dir,'composition.json'),compiled=join(dir,'compiled'),deck=join(dir,'deck.pptx');
  await writeFile(brandFile,JSON.stringify(contract));await writeFile(compFile,JSON.stringify(iconComposition(id)));

  const summary=await run('compose','compile','--file',compFile,'--brand',brandFile,'--output',compiled);
  assert.equal(summary.slides,2);assert.equal(summary.icons,6);assert.equal(summary.connectors,2);
  const structure=JSON.parse(await readFile(join(compiled,'structure.json'),'utf8')),result=await run('compose','render','--file',compiled,'--output',deck);
  assert.equal(result.emitter,'native template');assert.equal(result.editable,true);assert.deepEqual(await audit(deck),[]);

  // Identity: every icon node is named in the deck after its composition node, carries the library label as alt text,
  // and the render report and compiled structure both tie that node to its library icon ID.
  const placed={client_icon:'Gateway',queue_icon:'Queue',store_icon:'Database',solid_icon:'Database',ring_icon:'Gateway',bare_icon:'Queue'};
  assert.deepEqual(Object.fromEntries(result.icons.map(i=>[i.id,[i.icon,i.label]])),Object.fromEntries(Object.entries(placed).map(([node,label])=>[node,[id[label],label]])));
  assert.deepEqual(Object.fromEntries(structure.icons.map(i=>[i.id,i.icon])),Object.fromEntries(Object.entries(placed).map(([node,label])=>[node,id[label]])));

  const slides=[await part(deck,'ppt/slides/harnessSlide1.xml'),await part(deck,'ppt/slides/harnessSlide2.xml')];
  for(const xml of slides){const ids=[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'shape IDs are unique on each slide');}
  // Nothing is flattened: the deck carries no pictures or media at all.
  assert.deepEqual((await exec('unzip',['-Z1',deck])).stdout.split('\n').filter(n=>n.startsWith('ppt/media/')),[]);
  for(const xml of slides)assert.doesNotMatch(xml,/<p:pic>|r:embed=|r:link=/);

  // Geometry: each icon is one group of native shapes whose drawing is the source SVG path, point for point,
  // whose child frame is the indexed library bounds, and whose outer frame is fitted to the compiled slot.
  for(const slot of structure.icons) {
    const xml=slides[slot.slide==='pipeline_slide'?0:1],group=iconGroup(xml,slot.id),icon=byLabel[placed[slot.id]],plain=slot.style==='plain';
    assert.ok(group,`${slot.id} is a group in the deck`);
    assert.match(group,new RegExp(`name="${slot.id}" descr="${icon.label}"`));
    assert.deepEqual(geometry(group),[{w:icon.size,h:icon.size,commands:icon.commands}],`${slot.id} keeps the ${icon.label} drawing`);
    assert.equal((group.match(/<p:sp>/g)??[]).length,plain?1:2,`${slot.id} has ${plain?'no disc':'its disc'}`);
    if(!plain)assert.match(group,new RegExp(`name="${slot.id}_part1" ?/>.*?<a:prstGeom prst="ellipse">`,'s'));
    const drawing=library.match(new RegExp(`name="${icon.name}_drawing".*?</p:sp>`,'s'))[0],copied=group.match(/<p:sp>(?:(?!<\/p:sp>).)*<a:custGeom>.*?<\/p:sp>/s)[0];
    assert.deepEqual([frame(copied,'off'),frame(copied,'ext')],[frame(drawing,'off'),frame(drawing,'ext')],`${slot.id} keeps the drawing where the library puts it`);
    const [bx,by,bw,bh]=icon.entry.bounds,keep=plain?.7:1;
    assert.deepEqual([frame(group,'chOff'),frame(group,'chExt')],[[Math.round(bx+bw*(1-keep)/2),Math.round(by+bh*(1-keep)/2)],[Math.round(bw*keep),Math.round(bh*keep)]]);
    // The library icons are square, so each fills its square slot exactly.
    assert.equal(slot.width,slot.height);
    assert.deepEqual([frame(group,'off'),frame(group,'ext')],[[emu(slot.x),emu(slot.y)],[emu(slot.width),emu(slot.height)]],`${slot.id} fills its slot`);
  }

  // The diagram: cards are native groups of a shape and its words, and both arrows are connectors attached at each end,
  // one end on the standalone icon's disc, so they follow when someone moves a node.
  const [diagram]=slides,named=numbers(diagram),top=(await pptxTool('inspect',[deck])).slides[0].objects;
  assert.deepEqual(top.map(o=>[o.name,o.type]).filter(([name])=>name!=='pipeline_slide_title'),[['client_card_group','grpSp'],['queue_icon','grpSp'],['store_card_group','grpSp'],['edge_in','cxnSp'],['edge_in_label','sp'],['edge_out','cxnSp']]);
  for(const [card,words] of [['client','API gateway'],['store','Database']]) {
    const group=diagram.match(new RegExp(`<p:grpSp><p:nvGrpSpPr><p:cNvPr id="\\d+" name="${card}_card_group"/>.*?name="${card}_text".*?</p:sp>`,'s'))[0];
    assert.match(group,new RegExp(`<p:sp><p:nvSpPr><p:cNvPr id="\\d+" name="${card}_card"/>`));assert.match(group,new RegExp(`name="${card}_icon"`));
    assert.match(group,new RegExp(`name="${card}_text".*<a:t>${words}</a:t>`,'s'));
  }
  assert.match(diagram,/name="edge_in_label".*<a:t>enqueue<\/a:t>/s);
  const ends=edge=>{const c=diagram.match(new RegExp(`<p:cxnSp>(?:(?!</p:cxnSp>).)*name="${edge}".*?</p:cxnSp>`,'s'))[0];return [c.match(/<a:stCxn id="(\d+)"/)?.[1],c.match(/<a:endCxn id="(\d+)"/)?.[1]];};
  assert.deepEqual(ends('edge_in'),[named.client_card,named.queue_icon_part1]);
  assert.deepEqual(ends('edge_out'),[named.queue_icon_part1,named.store_card]);
  assert.deepEqual(result.native[0].attached.sort(),['edge_in','edge_out']);assert.deepEqual(result.native[0].unattached,[]);
  assert.match((await exec('unzip',['-p',deck,'ppt/notesSlides/*.xml'])).stdout,/The queue absorbs bursts\./);
});

test('a lettered icon is indexed with its glyph and not its caption, and its copy draws the letters',async t=>{
  const dir=await temporary(t),{contract,library,icons}=await iconBrand(dir),vm=icons.find(i=>i.lettered),xml=await part(library.path,'ppt/slides/slide1.xml'),named=numbers(xml);
  // The glyph group holds text; it is inside the disc, so it is part of the icon. The caption under the disc is in the region but outside the icon.
  assert.deepEqual(vm.entry.shapeIds,[named.vm_disc,named.vm_glyph]);
  assert.ok(named.vm_caption&&!vm.entry.shapeIds.includes(named.vm_caption),'the caption text box is not part of the icon');
  assert.deepEqual(vm.entry.bounds,[480,90,80,80].map(v=>v*12700),'the icon is the disc, not the disc and its caption');
  assert.ok(vm.entry.native);
  const listing=JSON.parse(await readFile(library.index,'utf8'));
  assert.deepEqual(listing.entries.filter(e=>e.shapeIds.length<2).map(e=>e.id),[],'no entry lists a disc alone');

  // The diagnostic: entries with fewer shapes than their region holds, and entries that list a disc alone.
  const check=await pptxTool('icon-index',[library.path,library.catalog,'--check']);
  assert.deepEqual(check,{entries:4,short:[{id:vm.entry.id,label:'Virtual Machine',listed:2,region:3,left:[{id:named.vm_caption,text:'Caption'}]}],discOnly:[]});
  // Without --check the indexer's output is the index itself.
  assert.deepEqual(await pptxTool('icon-index',[library.path,library.catalog]),listing);

  // The native copy, through compose and render, carries the letters and the bar on the disc.
  const comp={version:1,title:'Icons',slides:[{id:'icon_slide',title:'A lettered icon',sources:['brief:test'],canvas:{type:'stack',direction:'row',children:[{type:'icon',id:'vm_icon',icon:vm.entry.id},{type:'box',id:'side_box',text:'Beside it',weight:3}]}}]};
  const deck=join(dir,'deck.pptx');await emitNativePptx({...await compileComposition(comp,contract),brand:contract,output:deck,base:dir});
  const group=iconGroup(await part(deck,'ppt/slides/harnessSlide1.xml'),'vm_icon');
  assert.ok(group,'the icon is a group in the deck');
  assert.match(group,/<a:prstGeom prst="ellipse">.*<p:grpSp>.*<a:t>VM<\/a:t>.*<\/p:sp><p:sp>.*<a:prstGeom prst="rect">/s,'the copy draws the disc, then the lettering and the bar');
  // The standalone copy draws the letters too.
  const single=join(dir,'vm.pptx');await pptxTool('icon-copy',[JSON.stringify({source:library.path,index:library.index,ident:vm.entry.id,output:single})]);
  assert.match(await part(single,'ppt/slides/slide1.xml'),/<a:t>VM<\/a:t>/);
});

// The lettering of a copied icon, in slide coordinates: the copy's scale, its run sizes, and the frames of its disc and its text box.
function lettering(xml) {
  const [ox,oy]=frame(xml,'off'),[ex,ey]=frame(xml,'ext'),[cx,cy]=frame(xml,'chOff'),[wx,wy]=frame(xml,'chExt'),scale=Math.min(ex/wx,ey/wy);
  const place=sp=>{const [x,y]=frame(sp,'off'),[w,h]=frame(sp,'ext');return [ox+(x-cx)*ex/wx,oy+(y-cy)*ey/wy,w*ex/wx,h*ey/wy];};
  const disc=xml.match(/<p:sp>(?:(?!<\/p:sp>).)*<a:prstGeom prst="ellipse">.*?<\/p:sp>/s)[0],text=xml.match(/<p:sp>(?:(?!<\/p:sp>).)*<a:t>VM<\/a:t>.*?<\/p:sp>/s)[0];
  const insets=Object.fromEntries(['lIns','tIns','rIns','bIns'].map(k=>[k,Number(text.match(new RegExp(`${k}="(\\d+)"`))[1])]));
  return {scale,sizes:[...text.matchAll(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*? sz="(\d+)"/g)].map(m=>Number(m[1])),disc:place(disc),text:place(text),insets};
}
const within=([x,y,w,h],[X,Y,W,H])=>x>=X-1&&y>=Y-1&&x+w<=X+W+1&&y+h<=Y+H+1;

test('a lettered icon copied at another size scales its text with its drawing, and stays on its disc',async t=>{
  const dir=await temporary(t),{contract,library,icons}=await iconBrand(dir),vm=icons.find(i=>i.lettered),size=vm.entry.bounds[2]/914400;
  for(const factor of [.5,1,2]) {
    const output=join(dir,`vm-${factor}.pptx`);
    await pptxTool('icon-copy',[JSON.stringify({source:library.path,index:library.index,ident:vm.entry.id,output,width:size*factor})]);
    const l=lettering(await part(output,'ppt/slides/slide1.xml'));
    assert.ok(Math.abs(l.scale-factor)<.001,`copied at ${factor} of the library size`);
    // The library letters are 14 pt with no insets; they scale with the drawing, in whole hundredths of a point.
    assert.deepEqual(l.sizes,[Math.round(1400*l.scale)],`the letters at ${factor} are ${14*factor} pt`);
    assert.deepEqual(l.insets,{lIns:0,tIns:0,rIns:0,bIns:0});
    assert.ok(within(l.text,l.disc),`the text box at ${factor} lies on the disc`);
    // One line of the scaled letters fits the scaled text box.
    assert.ok(l.sizes[0]/100*12700*1.2<=l.text[3]+1,`the letters at ${factor} fit their box`);
  }
  // In a composition the icon fills its slot, and its letters scale with it; text outside the icon keeps its size.
  const comp={version:1,title:'Icons',slides:[{id:'icon_slide',title:'A lettered icon',sources:['brief:test'],canvas:{type:'stack',direction:'row',children:[{type:'icon',id:'vm_icon',icon:vm.entry.id},{type:'box',id:'side_box',text:'Beside it',weight:3}]}}]};
  const deck=join(dir,'deck.pptx'),compiled=await compileComposition(comp,contract);await emitNativePptx({...compiled,brand:contract,output:deck,base:dir});
  const slide=await part(deck,'ppt/slides/harnessSlide1.xml'),l=lettering(iconGroup(slide,'vm_icon')),beside=compiled.scene.slides[0].elements.find(e=>e.id==='side_box');
  assert.ok(l.scale<1,'the slot is smaller than the library icon');
  assert.deepEqual(l.sizes,[Math.round(1400*l.scale)]);assert.ok(within(l.text,l.disc));
  assert.match(slide,new RegExp(`name="side_box".*?sz="${Math.round(beside.fontSize*100)}"`,'s'),'the box beside the icon keeps its own size');
});

test('an icon whose library slide repeats one of its shape IDs is refused by name rather than copied wrong',async t=>{
  const dir=await temporary(t),{contract,library,icons}=await iconBrand(dir),[database,gateway]=icons,repeated=join(dir,'repeated.pptx'),catalog=join(dir,'repeated-catalog.json');
  // Give the gateway's disc the database disc's ID, then index and hash the changed library as a brand would.
  const script=`import sys,zipfile
src,dst,find,to=sys.argv[1:]
with zipfile.ZipFile(src) as a, zipfile.ZipFile(dst,'x',zipfile.ZIP_DEFLATED) as b:
    for i in a.infolist(): b.writestr(i,a.read(i).replace(find.encode(),to.encode()) if i.filename=='ppt/slides/slide1.xml' else a.read(i))`;
  await exec('python3',['-c',script,library.path,repeated,`id="${gateway.entry.shapeIds[0]}" name="gateway_disc"`,`id="${database.entry.shapeIds[0]}" name="gateway_disc"`]);
  await writeFile(catalog,JSON.stringify({source:{sha256:hash(await readFile(repeated))},catalogPages:[{slide:1,labels:icons.map(i=>i.label)}]}));
  const index=await pptxTool('icon-index',[repeated,catalog]);await writeFile(library.index,JSON.stringify(index));
  const c=structuredClone(contract);c.design.slides.icon.library.path=repeated;
  c.sources=c.sources.filter(s=>s.kind!=='icon library');for(const path of [repeated,library.index])c.sources.push({path,kind:'icon library',sha256:hash(await readFile(path))});c.revision=contractRevision(c);
  const id=index.entries.find(e=>e.label==='Database').id,comp={version:1,title:'Icons',slides:[{id:'icon_slide',title:'An icon',sources:['brief:test'],canvas:{type:'stack',direction:'row',children:[{type:'icon',id:'lead_icon',icon:id},{type:'box',id:'side_box',text:'Beside it',weight:3}]}}]};
  await assert.rejects(async()=>emitNativePptx({...await compileComposition(comp,c),brand:c,output:join(dir,'deck.pptx'),base:dir}),new RegExp(`Icon ${id}: library slide 1 has more than one shape with ID ${database.entry.shapeIds[0]}; give each shape its own ID and rebuild the index`));
});

test('the Google import acceptance deck is prepared locally from the same fixtures, with what must survive',async t=>{
  const dir=await temporary(t),output=join(dir,'acceptance'),script=fileURLToPath(new URL('../scripts/acceptance/native-icons.mjs',import.meta.url));
  const result=JSON.parse((await exec('node',[script,'prepare',output])).stdout),expected=JSON.parse(await readFile(result.expected,'utf8'));
  assert.equal(result.slides,2);assert.equal(expected.deckSha256,hash(await readFile(result.deck)));assert.deepEqual(await audit(result.deck),[]);
  assert.deepEqual(expected.icons.map(i=>[i.slide,i.node,i.label,i.style,i.shapes]),[[1,'client_icon','Gateway','solid',2],[1,'queue_icon','Queue','solid',2],[1,'store_icon','Database','solid',2],[2,'solid_icon','Database','solid',2],[2,'ring_icon','Gateway','outline',2],[2,'bare_icon','Queue','plain',1]]);
  assert.deepEqual(expected.connectors.map(c=>[c.slide,c.id,c.from,c.to]),[[1,'edge_in','client_card','queue_icon'],[1,'edge_out','queue_icon','store_card']]);
  assert.deepEqual(expected.attached.map(a=>a.edge).sort(),['edge_in','edge_out']);
  await assert.rejects(()=>exec('node',[script,'prepare',output]),/EEXIST/);
});
