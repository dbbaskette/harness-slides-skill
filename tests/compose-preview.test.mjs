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
  const run=async(command,args)=>{calls.push([command,...(command==='pdftoppm'?args.slice(0,4):[])]);if(args[0]==='-v')return {stdout:''};if(command==='pdfinfo')return {stdout:`Title: x\nPages:          ${pages}\n`};if(command==='pdftoppm'){await writeFile(args.at(-1)+'.png','png');return {stdout:''};}throw Object.assign(new Error('spawn ENOENT'),{code:'ENOENT'});};
  return {calls,deps:{drive,run}};
}

test('screens flag relational prose, repeated layouts and unattached arrows without judging the slide',async t=>{
  const c=await brand(await temporary(t)),{scene,structure}=await compileComposition(deck(),c);
  const findings=await screenComposition({scene,structure,native:[{id:'flow_slide',unattached:['edge_one']}]}),codes=id=>findings.filter(f=>f.slide===id).map(f=>f.code);
  assert.ok(codes('prose_slide').includes('relational-text-only'));assert.ok(!codes('flow_slide').includes('relational-text-only'));
  assert.ok(codes('cards_two').includes('repeats-previous-layout'));assert.ok(!codes('cards_one').includes('repeats-previous-layout'));
  assert.deepEqual(findings.find(f=>f.code==='unattached-connector').object,'edge_one');
});

test('everyday wording is not mistaken for a relationship, and numbered boxes without edges are noted',async t=>{
  const c=await brand(await temporary(t)),one=canvas=>({version:1,title:'Words',slides:[slide('only_slide','A title',canvas)]});
  const codes=async canvas=>{const {scene,structure}=await compileComposition(one(canvas),c);return (await screenComposition({scene,structure})).map(f=>f.code);};
  for(const text of ['Revenue grew 4% after tax.','Our next quarter focus is the team that owns billing. Call us.','Before you start, read the guide.'])assert.ok(!(await codes({type:'text',id:'plain_text',text})).includes('relational-text-only'),text);
  for(const text of ['Login leads to a token, and then the router picks a backend.','Edge -> router -> app','The API depends on the cache.'])assert.ok((await codes({type:'text',id:'plain_text',text})).includes('relational-text-only'),text);
  assert.ok((await codes({type:'grid',columns:3,children:[1,2,3].map(n=>({type:'box',id:`step_box${n}`,text:`${n}. Do part ${n}`}))})).includes('sequence-without-edges'));
});

test('a preview builds the deck, imports it once, exports the render and returns images with findings',async t=>{
  const {dir,output}=await compiled(t),{calls,deps}=fakes(),result=await previewComposition({file:output,output:join(dir,'preview')},deps);
  assert.deepEqual(calls.slice(0,5),[['pdfinfo'],['pdftoppm','-v'],['import','Preview: Preview deck'],['pdf','drive_file_1'],['pdfinfo']]);
  assert.equal(result.fileId,'drive_file_1');assert.equal(result.slides.length,4);assert.equal(result.emitter,'native template');assert.match(result.next,/--file-id drive_file_1/);
  assert.deepEqual((await readdir(join(dir,'preview'))).sort(),['deck.pdf','deck.pptx','preview.json','slide-01.png','slide-02.png','slide-03.png','slide-04.png']);
  assert.ok(result.slides[0].findings.some(f=>f.code==='unattached-connector'));assert.ok(result.slides[1].findings.some(f=>f.code==='relational-text-only'));
  assert.deepEqual(JSON.parse(await readFile(join(dir,'preview','preview.json'),'utf8')).slides.map(s=>s.id),['flow_slide','prose_slide','cards_one','cards_two']);
});

test('a later preview updates the same Drive file and can render one slide',async t=>{
  const {dir,output}=await compiled(t),{calls,deps}=fakes(),result=await previewComposition({file:output,output:join(dir,'preview'),slide:'cards_one','file-id':'drive_file_9'},deps);
  assert.deepEqual(calls[2],['update','drive_file_9']);assert.ok(!calls.some(c=>c[0]==='import'));
  assert.deepEqual(result.slides.map(s=>[s.id,s.number]),[['cards_one',3]]);assert.deepEqual(calls.filter(c=>c[0]==='pdftoppm'&&c[1]!=='-v'),[['pdftoppm','-f','3','-l','3']]);
  assert.deepEqual((await readdir(join(dir,'preview'))).filter(n=>n.endsWith('.png')),['slide-03.png']);
});

test('a render with the wrong page count, an unknown slide or a missing renderer fails and leaves nothing behind',async t=>{
  const {dir,output}=await compiled(t);
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'short')},fakes(3).deps),/render has 3 pages for 4 slides.*preview deck is in Drive.*retry with --file-id drive_file_1/);
  const missing=fakes();missing.deps.run=async()=>{throw Object.assign(new Error('spawn pdfinfo ENOENT'),{code:'ENOENT'});};
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'tools')},missing.deps),/brew install poppler/);assert.deepEqual(missing.calls,[]);
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'unknown'),slide:'missing_slide'},fakes().deps),/No slide missing_slide/);
  await assert.rejects(()=>previewComposition({file:output,output:join(dir,'local'),renderer:'local'},fakes().deps),/LibreOffice \(soffice\) is not installed/);
  assert.deepEqual((await readdir(dir)).filter(n=>['short','unknown','local','tools'].includes(n)),[]);
});

test('Drive update and PDF export call the documented endpoints and check what comes back',async t=>{
  const dir=await temporary(t),pptx=join(dir,'deck.pptx'),seen=[];await writeFile(pptx,Buffer.from([0x50,0x4b,0x03,0x04,0,0]));
  const deps=body=>({tokenProvider:async()=>'token',fetcher:async(url,options)=>{seen.push([options?.method??'GET',String(url)]);return new Response(body,{status:200});}});
  const slides='application/vnd.google-apps.presentation';
  const updated=await updateDeck({fileId:'file_1',file:pptx},deps(JSON.stringify({id:'file_1',name:'Preview: Deck',mimeType:slides})));
  assert.equal(updated.id,'file_1');assert.deepEqual(seen.map(s=>s[0]),['GET','PATCH']);assert.match(seen[1][1],/upload\/drive\/v3\/files\/file_1\?uploadType=media/);
  // A real deck, or a file that is not Slides, is never overwritten: only the metadata read happens.
  for(const body of [{id:'file_1',name:'Quarterly review',mimeType:slides},{id:'file_1',name:'Preview: notes',mimeType:'application/pdf'}]){seen.length=0;await assert.rejects(()=>updateDeck({fileId:'file_1',file:pptx},deps(JSON.stringify(body))),/Refusing to overwrite/);assert.deepEqual(seen.map(s=>s[0]),['GET']);}
  await assert.rejects(()=>updateDeck({fileId:'bad id!',file:pptx},deps('{}')),/must be a Google Drive ID/);
  await exportPdf({fileId:'file_1',output:join(dir,'a.pdf')},deps('%PDF-1.7 content'));assert.match(seen.at(-1)[1],/files\/file_1\/export\?mimeType=application%2Fpdf/);
  await assert.rejects(()=>exportPdf({fileId:'file_1',output:join(dir,'b.pdf')},deps('<html>sign in</html>')),/did not return a PDF/);
});

test('text on a filled card is judged against the card, and an icon the color of its card is flagged',async t=>{
  const {contractRevision}=await import('../scripts/lib/brand-contract.mjs'),c=await brand(await temporary(t));c.design.slides.icon={size:54,library:{path:'/x',index:'/y'}};c.revision=contractRevision(c);
  const comp={version:1,title:'Deck',slides:[slide('card_slide','Cards',{type:'grid',columns:2,children:[
    {type:'box',id:'dark_card',fill:'headingPrimary',children:[{type:'icon',id:'dark_icon',icon:'fi-test'},{type:'text',id:'dark_text',text:'White on blue',color:'canvasPrimary'}]},
    {type:'box',id:'pale_card',fill:'canvasSecondary',children:[{type:'text',id:'pale_text',text:'White on grey',color:'canvasPrimary'}]}]})]};
  const {scene,structure}=await compileComposition(comp,c);
  const findings=await screenComposition({scene,structure,native:[{id:'card_slide',unattached:[],icons:[{id:'dark_icon',colors:['2867B2','FFFFFF']}]}]}),codes=id=>findings.filter(f=>f.object===id).map(f=>f.code);
  assert.deepEqual(codes('dark_text'),[]);assert.deepEqual(codes('pale_text'),['contrast']);assert.deepEqual(codes('dark_icon'),['icon-blends-into-fill']);
});

test('a filled box inside a card keeps its own contrast finding',async t=>{
  const c=await brand(await temporary(t)),comp={version:1,title:'Deck',slides:[slide('nest_slide','Nested',{type:'box',id:'outer_card',fill:'canvasSecondary',children:[{type:'box',id:'inner_box',fill:'headingPrimary',color:'inkDeep',text:'Dark on blue'}]})]};
  const {scene,structure}=await compileComposition(comp,c),findings=await screenComposition({scene,structure});
  assert.ok(findings.some(f=>f.object==='inner_box'&&f.code==='contrast'));
});

test('screens ask for a direction and briefs, and notice dense runs and label titles',async t=>{
  const c=await brand(await temporary(t)),canvas=n=>({type:'stack',direction:'row',children:[{type:'box',id:`left_${n}`,text:'A'},{type:'box',id:`right_${n}`,text:'B'}]});
  const page=(n,title,brief)=>({id:`slide_${n}`,title,sources:['brief:test'],canvas:canvas(n),...(brief?{brief}:{})});
  const plain={version:1,title:'Deck',slides:[page('aa','Overview')]},bare=await compileComposition(plain,c);
  const first=await screenComposition(bare),codes=(found,id)=>found.filter(f=>f.slide===id).map(f=>f.code);
  assert.ok(codes(first,'slide_aa').includes('no-direction'));assert.ok(codes(first,'slide_aa').includes('no-brief'));assert.ok(codes(first,'slide_aa').includes('label-title'));
  const direction={focal:'headingPrimary',neutral:'canvasSecondary'},dense={relation:'contrast',rhythm:'dense'};
  const run={version:1,title:'Deck',direction,slides:[...['aa','bb','cc','dd','ee'].map(n=>page(n,`Team ${n} owns one part of the system`,dense)),{...page('ff','A pause before the next part',{relation:'contrast',rhythm:'breathing'})}]};
  const found=await screenComposition(await compileComposition(run,c));
  assert.ok(!found.some(f=>['no-direction','no-brief','label-title'].includes(f.code)));
  assert.deepEqual(found.filter(f=>f.code==='dense-run').map(f=>f.slide),['slide_dd','slide_ee']);
});
