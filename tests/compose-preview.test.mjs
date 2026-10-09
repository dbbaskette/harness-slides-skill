import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {temporary} from './fixtures.mjs';
import {brand} from './native-fixtures.mjs';
import {compileCompositionFile} from '../scripts/lib/compose-file.mjs';
import {compileComposition} from '../scripts/lib/compose.mjs';
import {previewComposition,screenComposition} from '../scripts/lib/compose-preview.mjs';
import {updateDeck,exportPdf} from '../scripts/google-drive-deck.mjs';

const slide=(id,title,canvas,connect)=>({id,title,sources:['brief:test'],canvas,...(connect?{connect}:{})});
const deck=()=>({version:1,title:'Preview deck',slides:[
  slide('flow_slide','Requests move through stages',{type:'stack',direction:'row',gap:'none',children:[{type:'box',id:'node_from',text:'Edge'},{type:'spacer',weight:.4},{type:'box',id:'node_to',shape:'hexagon',text:'App'}]},[{id:'edge_one',from:'node_from',to:'node_to'}]),
  slide('prose_slide','How a request is handled',{type:'text',id:'prose_text',text:'The edge authenticates, then the router sends the request to a backend.'}),
  slide('cards_one','Three teams',{type:'grid',columns:3,children:['a','b','c'].map(n=>({type:'box',id:`one_${n}`,text:`Team ${n}`}))}),
  slide('cards_two','Three more teams',{type:'grid',columns:3,children:['a','b','c'].map(n=>({type:'box',id:`two_${n}`,text:`Team ${n}`}))})]});
async function compiled(t) {
  const dir=await temporary(t),c=await brand(dir),brandFile=join(dir,'brand.json'),file=join(dir,'composition.json'),output=join(dir,'compiled');
  await writeFile(brandFile,JSON.stringify(c));await writeFile(file,JSON.stringify(deck()));await compileCompositionFile({file,brand:brandFile,output});
  return {dir,c,output};
}
// Stand-ins for Drive and Poppler: record calls and write the files the real tools would.
function fakes(pages=4) {
  const calls=[],drive={
    importDeck:async({file,name})=>{calls.push(['import',name]);return {id:'drive_file_1',url:'https://docs.google.com/presentation/d/drive_file_1/edit'};},
    updateDeck:async({fileId})=>{calls.push(['update',fileId]);return {id:fileId,url:`https://docs.google.com/presentation/d/${fileId}/edit`};},
    exportPdf:async({fileId,output})=>{calls.push(['pdf',fileId]);await writeFile(output,'%PDF-1.7 fake');return {output};}};
  const run=async(command,args)=>{calls.push([command,...(command==='pdftoppm'?args.slice(0,4):[])]);if(command==='pdfinfo')return {stdout:`Title: x\nPages:          ${pages}\n`};if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png','png');return {stdout:''};}throw Object.assign(new Error('spawn ENOENT'),{code:'ENOENT'});};
  return {calls,deps:{drive,run}};
}

test('screens flag relational prose, repeated layouts and unattached arrows without judging the slide',async t=>{
  const c=await brand(await temporary(t)),{scene,structure}=await compileComposition(deck(),c);
  const findings=await screenComposition({scene,structure,native:[{id:'flow_slide',unattached:['edge_one']}]}),codes=id=>findings.filter(f=>f.slide===id).map(f=>f.code);
  assert.ok(codes('prose_slide').includes('relational-text-only'));assert.ok(!codes('flow_slide').includes('relational-text-only'));
  assert.ok(codes('cards_two').includes('repeats-previous-layout'));assert.ok(!codes('cards_one').includes('repeats-previous-layout'));
  assert.deepEqual(findings.find(f=>f.code==='unattached-connector').object,'edge_one');
});

test('a preview builds the deck, imports it once, exports the render and returns images with findings',async t=>{
  const {dir,output}=await compiled(t),{calls,deps}=fakes(),result=await previewComposition({file:output,output:join(dir,'preview')},deps);
  assert.deepEqual(calls.slice(0,3),[['import','Preview: Preview deck'],['pdf','drive_file_1'],['pdfinfo']]);
  assert.equal(result.fileId,'drive_file_1');assert.equal(result.slides.length,4);assert.equal(result.emitter,'native template');assert.match(result.next,/--file-id drive_file_1/);
  assert.deepEqual((await readdir(join(dir,'preview'))).sort(),['deck.pdf','deck.pptx','preview.json','slide-01.png','slide-02.png','slide-03.png','slide-04.png']);
  assert.ok(result.slides[0].findings.some(f=>f.code==='unattached-connector'));assert.ok(result.slides[1].findings.some(f=>f.code==='relational-text-only'));
  assert.deepEqual(JSON.parse(await readFile(join(dir,'preview','preview.json'),'utf8')).slides.map(s=>s.id),['flow_slide','prose_slide','cards_one','cards_two']);
});

test('a later preview updates the same Drive file and can render one slide',async t=>{
  const {dir,output}=await compiled(t),{calls,deps}=fakes(),result=await previewComposition({file:output,output:join(dir,'preview'),slide:'cards_one','file-id':'drive_file_9'},deps);
  assert.deepEqual(calls[0],['update','drive_file_9']);assert.ok(!calls.some(c=>c[0]==='import'));
  assert.deepEqual(result.slides.map(s=>[s.id,s.number]),[['cards_one',3]]);assert.deepEqual(calls.filter(c=>c[0]==='pdftoppm'),[['pdftoppm','-f','3','-l','3']]);
  assert.deepEqual((await readdir(join(dir,'preview'))).filter(n=>n.endsWith('.png')),['slide-03.png']);
});

test('a render with the wrong page count, an unknown slide or a missing renderer fails and leaves nothing behind',async t=>{
  const {dir,output}=await compiled(t);
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'short')},fakes(3).deps),/render has 3 pages for 4 slides/);
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'unknown'),slide:'missing_slide'},fakes().deps),/No slide missing_slide/);
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'local'),renderer:'local'},fakes().deps),/LibreOffice \(soffice\) is not installed/);
  assert.deepEqual((await readdir(dir)).filter(n=>['short','unknown','local'].includes(n)),[]);
});

test('Drive update and PDF export call the documented endpoints and check what comes back',async t=>{
  const dir=await temporary(t),pptx=join(dir,'deck.pptx'),seen=[];await writeFile(pptx,Buffer.from([0x50,0x4b,0x03,0x04,0,0]));
  const deps=body=>({tokenProvider:async()=>'token',fetcher:async(url,options)=>{seen.push([options.method??'GET',String(url)]);return new Response(body,{status:200});}});
  const updated=await updateDeck({fileId:'file_1',file:pptx},deps(JSON.stringify({id:'file_1',mimeType:'application/vnd.google-apps.presentation'})));
  assert.equal(updated.id,'file_1');assert.match(seen[0][1],/upload\/drive\/v3\/files\/file_1\?uploadType=media/);assert.equal(seen[0][0],'PATCH');
  await assert.rejects(()=>updateDeck({fileId:'file_1',file:pptx},deps(JSON.stringify({id:'file_1',mimeType:'application/pdf'}))),/did not confirm/);
  await exportPdf({fileId:'file_1',output:join(dir,'a.pdf')},deps('%PDF-1.7 content'));assert.match(seen.at(-1)[1],/files\/file_1\/export\?mimeType=application%2Fpdf/);
  await assert.rejects(()=>exportPdf({fileId:'file_1',output:join(dir,'b.pdf')},deps('<html>sign in</html>')),/did not return a PDF/);
});
