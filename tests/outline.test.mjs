import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {temporary} from './fixtures.mjs';
import {brand} from './native-fixtures.mjs';
import {contractRevision} from '../scripts/lib/brand-contract.mjs';
import {validateComposition} from '../scripts/lib/compose.mjs';
import {checkOutline,draftOutline,outlineContract} from '../scripts/lib/outline.mjs';

const exec=promisify(execFile),cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url));
const live=async dir=>{const c=await brand(dir);c.medium.delivery='live';c.revision=contractRevision(c);return c;};
const content=(id,extra={})=>({id,kind:'content',title:'A claim',understand:'What to take away.',relation:'parallel',points:[{label:'One',text:'First thing'},{label:'Two',text:'Second thing'}],sources:['s1'],...extra});
const outline=(slides,extra={})=>({version:1,title:'Deck',delivery:'live',slides,...extra});

test('the outline contract names its fields and relations',()=>{
  assert.match(outlineContract,/Outline v1/);assert.match(outlineContract,/understand/);assert.match(outlineContract,/order\|dependency\|hierarchy\|membership\|contrast\|parallel\|overlap\|quantity\|none/);
});

test('an outline reports every structure problem together',async t=>{
  const c=await live(await temporary(t));
  const broken=outline([{id:'cover_slide',kind:'cover',title:'Open',points:[]},content('slide_one',{understand:undefined,sources:[]}),content('slide_two',{relation:'contrast',points:[{label:'Alone'}]}),content('slide_two'),{id:'odd',kind:'aside',title:'x'}],{mood:'bold'});
  const message=await checkOutline(broken,c).then(()=>'',e=>e.message);
  for(const part of [/outline: unsupported field mood/,/cover_slide: a cover slide has no points/,/slide_one: say in one sentence what the audience must understand/,/slide_one: provide sources/,/slide_two: relation "contrast" needs at least 2 points; it has 1/,/slide_two: invalid or repeated ID/,/odd: invalid or repeated ID/,/odd: kind is one of cover\|section\|content\|closing/])assert.match(message,part);
  await assert.rejects(()=>checkOutline(outline([content('slide_one')],{delivery:'reading'}),c),/delivery is reading, but the brand contract was exported for live/);
  await assert.rejects(()=>checkOutline(outline([content('slide_one')],{direction:{focal:'nope',neutral:'canvasSecondary'}}),c),/direction\.focal must be a brand color role/);
});

test('an outline that is sound returns findings about the words',async t=>{
  const c=await live(await temporary(t)),long='word '.repeat(70).trim();
  const deck=outline([{id:'cover_slide',kind:'cover',title:'Open'},content('slide_one',{title:'A very long claim that keeps going well past what one title line can hold. '.repeat(3)}),content('slide_two',{title:'Claim two',points:[{label:'One',text:long},{label:'Two'}]}),content('slide_three',{title:'Claim three'}),content('slide_four',{title:'Claim four',relation:'order'}),content('slide_five',{title:'claim TWO',rhythm:'breathing'})]);
  const {findings,counts,budget,delivery}=await checkOutline(deck,c),codes=id=>findings.filter(f=>f.slide===id).map(f=>f.code);
  assert.equal(delivery,'live');assert.equal(budget,60);assert.equal(counts.slide_two,72);
  assert.deepEqual(codes('slide_one'),['title-too-long']);assert.deepEqual(codes('slide_two'),['over-budget']);
  assert.deepEqual(codes('slide_four'),['dense-run','no-focal']);assert.ok(codes('slide_five').includes('repeated-title'));
  // Layouts are a build matter, so a draft does not report them.
  assert.deepEqual(codes('cover_slide'),[]);assert.deepEqual(codes('slide_three'),[]);
});

test('a draft is one self-contained wireframe page that never fails on length',async t=>{
  const c=await live(await temporary(t)),long='word '.repeat(200).trim();
  const deck=outline([{id:'cover_slide',kind:'cover',title:'Open',subtitle:'Sub'},
    content('order_slide',{relation:'order',focal:'Decide first',points:[{label:'Then this'},{label:'Then that'}]}),
    content('hub_slide',{relation:'dependency',focal:'One',points:[{label:'One'},{label:'Two'},{label:'Three'}]}),
    content('overlap_slide',{relation:'overlap',focal:'Shared part'}),
    content('figure_slide',{relation:'quantity',points:[{label:'42%',text:'of something'}]}),
    content('long_slide',{points:[{label:'One',text:long},{label:'Two',text:'<b>tag</b>'}],caveat:'A caveat'}),
    {id:'close_slide',kind:'closing',title:'End',notes:'Thank the room.'}],{minutes:20,direction:{focal:'headingPrimary',neutral:'canvasSecondary',meanings:{accentAqua:'the product'}}});
  const {html,slides,words}=await draftOutline(deck,c);
  assert.equal(slides,7);assert.ok(words>200);assert.match(html,/^<!doctype html><!-- harness-slides draft -->/);
  assert.equal((html.match(/<figure /g)??[]).length,7);assert.match(html,/Draft: wording and structure only/);
  assert.doesNotMatch(html,/https?:\/\//);assert.doesNotMatch(html,/<b>tag<\/b>/);assert.match(html,/&lt;b&gt;tag&lt;\/b&gt;/);
  // A focal that is one of the points marks that point; a focal of its own becomes the source node or a band.
  const figure=id=>html.match(new RegExp(`<figure id="${id}">.*?</figure>`,'s'))[0],focal=id=>(figure(id).match(/class="shape fit [^"]*focal/g)??[]).length;
  assert.equal(focal('order_slide'),1);assert.equal((figure('order_slide').match(/<line /g)??[]).length,1);
  assert.equal(focal('hub_slide'),1);assert.equal((figure('hub_slide').match(/<line /g)??[]).length,2);
  assert.equal(focal('overlap_slide'),1);assert.equal((figure('overlap_slide').match(/ round/g)??[]).length,2);
  assert.match(figure('close_slide'),/Notes: Thank the room\./);assert.match(html,/20 minutes, about 4\.0 a content slide/);assert.match(html,/headingPrimary marks the point of a slide, on canvasSecondary panels; accentAqua means the product/);
  assert.match(figure('figure_slide'),/figure/);assert.match(figure('long_slide'),/<mark>over-budget<\/mark>/);assert.match(figure('long_slide'),/A caveat/);
  assert.doesNotMatch(html,/#(?!fff|ddd|bbb|999|777|555|222|f4f4f4)[0-9a-f]{3,6}\b/i,'a draft uses no brand color');
});

test('outline check, draft and start work from the command line and feed the build',async t=>{
  const dir=await temporary(t),c=await live(dir),brandFile=join(dir,'brand-contract.json'),file=join(dir,'outline.json');
  await writeFile(brandFile,JSON.stringify(c));
  const direction={focal:'headingPrimary',neutral:'canvasSecondary',meanings:{accentAqua:'the product'}};
  const deck=outline([{id:'cover_slide',kind:'cover',title:'Open',subtitle:'Sub'},...['a','b','c','d','e'].map(n=>content(`slide_${n}x`,{title:`Claim ${n}`,focal:'One'})),{id:'part_two',kind:'section',title:'Part two'},content('slide_last',{title:'Last claim'}),{id:'close_slide',kind:'closing',title:'End'}],
    {direction,layouts:{cover:'Cover',section:'Section',closing:'Closing'},house:['Blue marks the product.'],material:['notes.md'],audience:'architects'});
  await writeFile(file,JSON.stringify(deck));
  const run=async(...args)=>JSON.parse((await exec('node',[cli,'outline',...args])).stdout);
  const checked=await run('check','--file',file,'--brand',brandFile);
  assert.equal(checked.status,'sound; look at the findings');assert.deepEqual(checked.findings.map(f=>f.code),['dense-run']);assert.match(checked.outlineSha256,/^[a-f0-9]{64}$/);
  const page=join(dir,'draft.html'),drafted=await run('draft','--file',file,'--brand',brandFile,'--output',page);
  assert.equal(drafted.slides,9);assert.match(await readFile(page,'utf8'),/harness-slides draft/);
  await run('draft','--file',file,'--brand',brandFile,'--output',page); // a later round replaces its own page
  await writeFile(join(dir,'notes.html'),'<p>mine</p>');
  await assert.rejects(()=>run('draft','--file',file,'--brand',brandFile,'--output',join(dir,'notes.html')),e=>/exists and is not a draft page/.test(e.stderr));
  const out=join(dir,'build'),started=await run('start','--file',file,'--brand',brandFile,'--output',out);
  // Five slides become sections of three and two; the run after the break is its own section.
  assert.deepEqual(started.parts,['lead-1.json','section-1.json','section-2.json','lead-2.json','section-3.json','lead-3.json']);assert.equal(started.sections,3);
  assert.deepEqual((await readdir(out)).sort(),['briefs','lead-1.json','lead-2.json','lead-3.json','outline.json','parts.json','presentation-brief.md']);
  const lead=JSON.parse(await readFile(join(out,'lead-1.json')));
  assert.deepEqual(lead.direction,direction);assert.deepEqual(lead.slides.map(s=>[s.id,s.layout,s.subtitle]),[['cover_slide','Cover','Sub']]);validateComposition(lead,c);
  const brief=await readFile(join(out,'briefs','section-2.md'),'utf8');
  for(const part of [/# Section 2 of Deck/,/`slide_dx`: "Claim d"/,/`slide_ex`: "Claim e"/,/The audience must understand: What to take away\./,/Prefix every node and edge ID you create with `s2_`/,/Blue marks the product\./,/Source material: notes\.md/,/"focal":"headingPrimary"/,/Before your section comes the slide "Claim c", built by another worker; after it comes a section slide/,/- One: First thing/])assert.match(brief,part);
  assert.doesNotMatch(brief,/slide_ax/);
  assert.match(await readFile(join(out,'presentation-brief.md'),'utf8'),new RegExp(`SHA-256 \`${started.outlineSha256}\``));
  // Sections written by builders merge with the lead's files in the order start laid down.
  for(const [n,ids] of [[1,['slide_ax','slide_bx','slide_cx']],[2,['slide_dx','slide_ex']],[3,['slide_last']]])await writeFile(join(out,`section-${n}.json`),JSON.stringify({version:1,title:'Deck',direction,slides:ids.map(id=>({id,title:'T',sources:['s1'],canvas:{type:'box',id:`s${n}_${id}`,text:'x'}}))}));
  const merged=JSON.parse((await exec('node',[cli,'compose','merge','--file',join(out,'parts.json'),'--output',join(out,'composition.json')])).stdout);
  assert.equal(merged.slides,9);assert.deepEqual(JSON.parse(await readFile(join(out,'composition.json'))).slides.map(s=>s.id),deck.slides.map(s=>s.id));
  // A build cannot start from an outline that names no layouts or no direction.
  await writeFile(file,JSON.stringify({...deck,layouts:undefined}));
  await assert.rejects(()=>run('start','--file',file,'--brand',brandFile,'--output',join(dir,'b2')),e=>/3 problems to fix:/.test(e.stderr)&&/name the template layout for cover slides in layouts\.cover/.test(e.stderr));
  await writeFile(file,JSON.stringify({...deck,direction:undefined}));
  await assert.rejects(()=>run('start','--file',file,'--brand',brandFile,'--output',join(dir,'b3')),e=>/the build needs a direction/.test(e.stderr));
});
