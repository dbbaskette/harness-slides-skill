import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareReview,markReview,finalizeReview,verifyReview} from '../scripts/lib/slide-review.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'inspection-reuse-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'deck.pptx'),output=join(dir,'review'),reviewContextFile=join(dir,'context.json');
 const context={schema:1,brand:'synthetic-brand-v1',fonts:'fonts-v1',layout:'layout-v1',questions:'questions-v1'};
 await writeFile(file,'revision1');await writeFile(reviewContextFile,JSON.stringify(context));
 const pages=Array.from({length:30},(_,i)=>({number:i+1,id:`slide-${i+1}`,hidden:false,title:`Slide ${i+1}`,fingerprint:`content-${i+1}`}));
 const renders=[];
 const options={file,output,reviewContextFile,inventory:async()=>({slides:pages}),signature:async()=>'renderer-fonts-v1',render:async({output,selected})=>{renders.push(selected);for(const n of selected)await writeFile(join(output,`${n}.png`),png);return {count:30,image:n=>join(output,`${n}.png`)}}};
 return {dir,file,output,reviewContextFile,context,pages,renders,options};
}
test('one of thirty changes: one render, three inspections, explicit exact-revision consistency',async t=>{
 const f=await fixture(t),first=await prepareReview(f.options);
 await markReview({output:f.output,revision:first.revision,numbers:f.pages.map(s=>s.number),note:'Synthetic full-size inspection'});
 assert.equal((await verifyReview(f.output)).readyForUserReview,false);
 assert.equal((await finalizeReview({output:f.output,revision:first.revision,note:'Synthetic whole-deck consistency'})).readyForUserReview,true);
 f.pages[14].fingerprint='changed slide';await writeFile(f.file,'revision2');
 const next=await prepareReview(f.options);
 assert.deepEqual(f.renders.at(-1),[15]);assert.deepEqual(next.draftPending,[14,15,16]);assert.equal(next.reusableInspections.length,27);
 assert.equal(next.readyForUserReview,false);assert.equal(next.finalConsistencyRequired,true);
 await assert.rejects(finalizeReview({output:f.output,revision:next.revision,note:'Too soon'}),/pending slides/);
 await markReview({output:f.output,revision:next.revision,numbers:next.draftPending,note:'Synthetic changed/neighbor inspection'});
 assert.equal((await verifyReview(f.output)).readyForUserReview,false);
 const final=await finalizeReview({output:f.output,revision:next.revision,note:'Inspected current whole-deck consistency'});
 assert.equal(final.readyForUserReview,true);
 const record=JSON.parse(await readFile(join(f.output,'review.json')));
 assert.equal(record.slides[0].finalReview.fromRevision,first.revision);
 await assert.rejects(finalizeReview({output:f.output,revision:first.revision,note:'Stale'}),/current/);
});
for(const field of ['brand','fonts','layout','questions'])test(`${field} changes invalidate every inspection`,async t=>{
 const f=await fixture(t),first=await prepareReview(f.options);
 await markReview({output:f.output,revision:first.revision,numbers:f.pages.map(s=>s.number),note:'Synthetic inspection'});
 f.context[field]+='changed';await writeFile(f.reviewContextFile,JSON.stringify(f.context));
 await assert.rejects(verifyReview(f.output),/context changed/);
 const next=await prepareReview(f.options);assert.equal(next.draftPending.length,30);assert.equal(next.reusableInspections.length,0);
});
test('order, renderer, refresh and corrupt images cannot carry inspection evidence',async t=>{
 const f=await fixture(t),first=await prepareReview(f.options);
 await markReview({output:f.output,revision:first.revision,numbers:f.pages.map(s=>s.number),note:'Synthetic inspection'});
 f.pages.reverse().forEach((s,i)=>s.number=i+1);await writeFile(f.file,'reordered');
 assert.equal((await prepareReview(f.options)).draftPending.length,30);
 assert.equal((await prepareReview({...f.options,signature:async()=>'renderer2'})).reusableInspections.length,0);
 assert.equal((await prepareReview({...f.options,refresh:true})).draftPending.length,30);
});
