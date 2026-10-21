import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {poolPreview,poolStatus,poolRemoteCurrent,assertReceiptCurrent,parseReceipt,poolSize,poolFolderName,replacedMessage} from '../scripts/lib/preview-pool.mjs';
import {problemsOf} from '../scripts/lib/refusals.mjs';
import {fakeDrive} from './pool-fixtures.mjs';

const slides='application/vnd.google-apps.presentation',folderType='application/vnd.google-apps.folder';
const pptx=text=>Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),Buffer.from(text)]);
async function temporary(t){const dir=await mkdtemp(join(tmpdir(),'harness-pool-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

const depsFor=(drive,state,extra={})=>({tokenProvider:async()=>'token',fetcher:drive.fetcher,poolState:state,...extra});

test('three previews with a pool of two reuse two files in one folder, replacing contents in place',async t=>{
  const dir=await temporary(t),state=join(dir,'pool'),drive=fakeDrive(),deps=depsFor(drive,state),seen=[];
  let clock=1000;deps.now=()=>clock++;
  for(const [i,text] of ['first deck','second deck','third deck'].entries()){
    const file=join(dir,`deck-${i}.pptx`);await writeFile(file,pptx(text));
    const remote=await poolPreview({file,size:2,render:async r=>{seen.push([r.id,drive.files.get(r.id).content.slice(4)]);}},deps);
    seen.push(remote.pool.receipt);
  }
  const live=drive.live();
  assert.equal(live.length,2);assert.deepEqual(live.map(f=>f.name).sort(),['Harness Slides preview 1','Harness Slides preview 2']);
  const folder=[...drive.files.values()].find(f=>f.mimeType===folderType);
  assert.equal(folder.name,poolFolderName);assert.deepEqual(folder.appProperties,{harnessPreviewPool:'1'});assert.ok(live.every(f=>f.parents[0]===folder.id));
  // Previews one and two make the files; preview three replaces the least recently used one, file one, in place.
  assert.deepEqual(seen,[['pool_file_2','first deck'],'pool_file_2:1',['pool_file_3','second deck'],'pool_file_3:1',['pool_file_2','third deck'],'pool_file_2:2']);
  assert.equal(drive.calls.filter(c=>c[0]==='PATCH'&&c[2]==='media').length,1);assert.ok(!drive.calls.some(c=>c[0]==='DELETE'));
  const status=await poolStatus(deps);
  assert.deepEqual(status.pools[0].files.map(f=>[f.slot,f.fileId,f.generation,f.route]),[[1,'pool_file_2',2,'drive-update'],[2,'pool_file_3',1,'created']]);
  assert.equal(status.pools[0].folder.url,`https://drive.google.com/drive/folders/${folder.id}`);
});

test('a receipt for a replaced preview is refused, a current one reuses its own file, and a bare ID is only a name',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),deps=depsFor(drive,join(dir,'pool')),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const one=await poolPreview({file,size:2},deps),two=await poolPreview({file,size:2},deps),three=await poolPreview({file,size:2},deps);
  assert.equal(three.id,one.id);assert.notEqual(two.id,one.id);
  await assert.rejects(()=>poolPreview({file,size:2,fileId:one.pool.receipt},deps),error=>error.message===replacedMessage&&problemsOf(error)[0].code==='preview-replaced');
  await assert.rejects(()=>assertReceiptCurrent(one.pool.receipt,deps),new RegExp(replacedMessage.replace(/[.;]/g,'.')));
  assert.equal(await poolRemoteCurrent({fileId:one.id,pool:one.pool},deps),false);assert.equal(await poolRemoteCurrent({fileId:three.id,pool:three.pool},deps),true);
  // Asking for file two by its current receipt replaces file two, not the least recently used file.
  const again=await poolPreview({file,size:2,fileId:two.pool.receipt},deps);assert.equal(again.id,two.id);assert.equal(again.pool.generation,2);
  await assert.doesNotReject(()=>assertReceiptCurrent(again.pool.receipt,deps));
  await assert.rejects(()=>poolPreview({file,size:2,fileId:'someone_else_1:3'},deps),/not a preview pool file/);
  const bare=await poolPreview({file,size:2,fileId:again.id},deps);assert.equal(bare.id,three.id,'a bare ID takes the least recently used file');
  assert.throws(()=>parseReceipt('bad id!'),/Drive ID/);assert.deepEqual(parseReceipt('abc_1:4'),{fileId:'abc_1',generation:4});
});

test('when Drive will not convert in place, a new file takes the slot and the old one goes to the trash, never deleted',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),deps=depsFor(drive,join(dir,'pool')),file=join(dir,'deck.pptx');await writeFile(file,pptx('v1'));
  const first=await poolPreview({file,size:1},deps);
  const refusing=fakeDrive({refuseUpdate:true,files:drive.files,prefix:'new_'});await writeFile(file,pptx('v2'));
  const second=await poolPreview({file,size:1},depsFor(refusing,join(dir,'pool')));
  assert.notEqual(second.id,first.id);assert.equal(second.pool.route,'replace-and-trash');assert.deepEqual(second.pool.previousFile,{fileId:first.id,status:'trashed'});
  assert.equal(drive.files.get(first.id).trashed,true);assert.equal(drive.live().length,1);assert.equal(drive.live()[0].content.slice(4),'v2');
  assert.ok(![...drive.calls,...refusing.calls].some(c=>c[0]==='DELETE'));
  await assert.rejects(()=>poolPreview({file,size:1,fileId:first.pool.receipt},deps),/replaced by a newer one/);
});

test('a pool file the owner renamed or moved is left alone, and a lost state adopts the pool instead of duplicating it',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const one=await poolPreview({file,size:1},depsFor(drive,join(dir,'pool')));
  // A lost state finds the folder and file by their markers.
  const adopted=await poolPreview({file,size:1},depsFor(drive,join(dir,'fresh-state')));
  assert.equal(adopted.id,one.id);assert.equal(adopted.pool.route,'drive-update');assert.equal(drive.live().length,1);
  assert.equal([...drive.files.values()].filter(f=>f.mimeType===folderType).length,1);
  drive.files.get(one.id).name='Keep this one';
  const next=await poolPreview({file,size:1},depsFor(drive,join(dir,'pool')));
  assert.notEqual(next.id,one.id);assert.equal(next.pool.route,'created');
  assert.equal(drive.files.get(one.id).trashed,undefined);assert.equal(drive.files.get(one.id).content.slice(4),'deck');
});

test('two previews at once take different files, and a full pool waits for a free one',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),deps=depsFor(drive,join(dir,'pool'),{pollMs:5}),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  // Make both pool files first, so both previews below replace in place.
  await poolPreview({file,size:2},deps);await poolPreview({file,size:2},deps);
  let release;const gate=new Promise(r=>{release=r;}),order=[];
  const slow=poolPreview({file,size:2,render:async r=>{order.push(['slow',r.id]);await gate;}},deps);
  while(!order.length)await new Promise(r=>setTimeout(r,2));
  const fast=await poolPreview({file,size:2,render:async r=>{order.push(['fast',r.id]);}},deps);
  release();await slow;
  assert.notEqual(order[0][1],order[1][1]);assert.equal(fast.id,order[1][1]);
  // With one file and it in use, the next preview waits for it, then has its turn.
  const single=depsFor(drive,join(dir,'single'),{pollMs:5});let open;const held=new Promise(r=>{open=r;}),turns=[];
  const first=poolPreview({file,size:1,render:async()=>{turns.push('first');await held;turns.push('first done');}},single);
  while(!turns.length)await new Promise(r=>setTimeout(r,2));
  const second=poolPreview({file,size:1,render:async()=>{turns.push('second');}},single);
  await new Promise(r=>setTimeout(r,30));open();await Promise.all([first,second]);
  assert.deepEqual(turns,['first','first done','second']);
  await assert.rejects(()=>poolPreview({file,size:1,render:async()=>{await poolPreview({file,size:1},{...single,waitMs:20});}},single),/All 1 preview pool files are in use/);
});

test('the pool size comes from the option, then the environment, then four',t=>{
  const saved=process.env.HARNESS_PREVIEW_POOL_SIZE;t.after(()=>{if(saved===undefined)delete process.env.HARNESS_PREVIEW_POOL_SIZE;else process.env.HARNESS_PREVIEW_POOL_SIZE=saved;});
  delete process.env.HARNESS_PREVIEW_POOL_SIZE;assert.equal(poolSize(),4);
  process.env.HARNESS_PREVIEW_POOL_SIZE='3';assert.equal(poolSize(),3);assert.equal(poolSize('2'),2);
  for(const bad of ['0','21','1.5','many'])assert.throws(()=>poolSize(bad),/whole number from 1 to 20/);
});

test('pool state stays private on this computer, records no deck content and recovers from a stale lock',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),state=join(dir,'pool'),file=join(dir,'deck.pptx');await writeFile(file,pptx('secret words'));
  await poolPreview({file,size:2},depsFor(drive,state));
  const text=await readFile(join(state,'state.json'),'utf8');assert.ok(!text.includes('secret words'));assert.match(text,/"person@example.invalid"/);
  const {lstat}=await import('node:fs/promises');assert.equal((await lstat(state)).mode&0o077,0);assert.equal((await lstat(join(state,'state.json'))).mode&0o077,0);
  // A lock left behind by a stopped process does not block the next preview.
  await writeFile(join(state,'state.lock'),JSON.stringify({pid:2**22+12345,at:Date.now()}));
  assert.equal((await poolPreview({file,size:2},depsFor(drive,state))).pool.slot,2);
});

test('drive pool lists the folder and files from this computer\'s state without reaching Google',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),state=join(dir,'pool'),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const made=await poolPreview({file,size:2},depsFor(drive,state));
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),{fileURLToPath}=await import('node:url');
  const cli=fileURLToPath(new URL('../scripts/harness-slides.mjs',import.meta.url));
  const {stdout}=await promisify(execFile)(process.execPath,[cli,'drive','pool'],{env:{...process.env,HARNESS_PREVIEW_POOL_STATE:state,PATH:''}});
  const listed=JSON.parse(stdout);
  assert.equal(listed.pools[0].folder.url,made.pool.folder.url);assert.deepEqual(listed.pools[0].files.map(f=>[f.slot,f.receipt,f.inUse]),[[1,made.pool.receipt,false]]);
});

test('one sign-in serves the whole preview: a token that changes halfway does not mix two accounts\' pools',async t=>{
  const dir=await temporary(t),state=join(dir,'pool'),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const drive=fakeDrive({accountFor:auth=>auth==='Bearer first-token'?'first@example.invalid':'second@example.invalid'});
  let asked=0;const tokenProvider=async()=>++asked===1?'first-token':'second-token';
  const remote=await poolPreview({file,size:2,render:async(r,google)=>{await (await import('../scripts/google-drive-deck.mjs')).exportPdf({fileId:r.id,output:join(dir,'deck.pdf')},google);}},{tokenProvider,fetcher:drive.fetcher,poolState:state});
  assert.equal(asked,1);assert.ok(drive.calls.every(c=>c[3]==='Bearer first-token'));
  assert.deepEqual((await poolStatus({poolState:state})).pools.map(p=>p.account),['first@example.invalid']);assert.equal(remote.pool.generation,1);
});

test('a write from another computer while the render is read back is refused, and Drive server errors are retried',async t=>{
  const dir=await temporary(t),file=join(dir,'deck.pptx');await writeFile(file,pptx('mine'));
  let other=null;const drive=fakeDrive({onExport:async id=>{if(other)drive.writeAsAnother(id,other);}}),deps=depsFor(drive,join(dir,'pool'),{retryMs:1});
  const exportIt=async(r,google)=>{await (await import('../scripts/google-drive-deck.mjs')).exportPdf({fileId:r.id,output:join(dir,`${r.pool.generation}.pdf`)},google);};
  await poolPreview({file,size:1,render:exportIt},deps);
  other='theirs';
  const error=await poolPreview({file,size:1,render:exportIt},deps).catch(e=>e);
  assert.equal(error.message,'The preview deck changed while it was being read; preview again.');assert.deepEqual([problemsOf(error)[0].code,problemsOf(error)[0].provider],['provider-failed','google']);
  other=null;drive.state.serverErrors=2;
  const retried=await poolPreview({file,size:1,render:exportIt},deps);assert.equal(retried.pool.route,'drive-update');assert.equal(drive.live().length,1);
});

test('the generation rises before Drive is touched, so a failed or uncertain replacement still retires older receipts',async t=>{
  const dir=await temporary(t),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const drive=fakeDrive(),deps=depsFor(drive,join(dir,'pool'),{retryMs:1});
  const first=await poolPreview({file,size:1},deps);
  // The upload may have landed although Drive answered with errors, and the fallback could not create a file either.
  const failing=fakeDrive({files:drive.files,serverErrors:9,refuseCreate:true,prefix:'x_'});
  await assert.rejects(()=>poolPreview({file,size:1},depsFor(failing,join(dir,'pool'),{retryMs:1})),/HTTP 500/);
  await assert.rejects(()=>assertReceiptCurrent(first.pool.receipt,deps),/replaced by a newer one/);
  // A render that fails after the upload leaves a receipt for exactly that upload, which retry advice names.
  const broken=await poolPreview({file,size:1,render:async()=>{throw new Error('export failed');}},deps).catch(e=>e);assert.match(broken.message,/export failed/);
  const status=(await poolStatus(deps)).pools[0].files[0];assert.equal(status.generation,3);
  await assert.doesNotReject(()=>assertReceiptCurrent(status.receipt,deps));
  const again=await poolPreview({file,size:1,fileId:status.receipt},deps);assert.equal(again.id,first.id);assert.equal(again.pool.generation,4);
  assert.equal(drive.files.get(first.id).appProperties.harnessPreviewGeneration,'4');
});

test('a lease held by a stopped process on this computer expires at once, and a lost state continues Drive\'s generations',async t=>{
  const dir=await temporary(t),state=join(dir,'pool'),drive=fakeDrive(),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const first=await poolPreview({file,size:1},depsFor(drive,state));await poolPreview({file,size:1},depsFor(drive,state));
  const {hostname}=await import('node:os'),saved=JSON.parse(await readFile(join(state,'state.json'),'utf8')),slot=Object.values(saved.pools)[0].slots[1];
  slot.lease={token:'gone',until:Date.now()+60_000,pid:2**22+12345,host:hostname()};await writeFile(join(state,'state.json'),JSON.stringify(saved));
  const taken=await poolPreview({file,size:1},depsFor(drive,state,{waitMs:50,pollMs:5}));assert.equal(taken.id,first.id);assert.equal(taken.pool.generation,3);
  // A computer with no state adopts the file and carries on from the generation Drive records.
  const adopted=await poolPreview({file,size:1},depsFor(drive,join(dir,'other-computer')));assert.equal(adopted.id,first.id);assert.equal(adopted.pool.generation,4);
  // Its receipt is unknown to the first computer's state, and Drive says the file has moved on from it.
  await assert.rejects(()=>assertReceiptCurrent(taken.pool.receipt,depsFor(drive,join(dir,'third-computer'))),/replaced by a newer one/);
});

test('a pool file moved out of the folder is left alone and a new file takes its place',async t=>{
  const dir=await temporary(t),drive=fakeDrive(),deps=depsFor(drive,join(dir,'pool')),file=join(dir,'deck.pptx');await writeFile(file,pptx('kept'));
  const first=await poolPreview({file,size:1},deps);drive.files.get(first.id).parents=['somewhere_else'];
  await writeFile(file,pptx('next'));const next=await poolPreview({file,size:1},deps);
  assert.notEqual(next.id,first.id);assert.equal(next.pool.route,'created');assert.equal(drive.files.get(first.id).content.slice(4),'kept');assert.equal(drive.files.get(first.id).trashed,undefined);
  await assert.rejects(()=>assertReceiptCurrent(first.pool.receipt,deps),/replaced by a newer one/);
});

test('when the end of a preview cannot be recorded it is retried, then reported, and older receipts stay refused',async t=>{
  const dir=await temporary(t),state=join(dir,'pool'),drive=fakeDrive(),deps=depsFor(drive,state),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const first=await poolPreview({file,size:1},deps);
  const {chmod}=await import('node:fs/promises'),warnings=[],warn=w=>warnings.push(String(w.message));process.on('warning',warn);
  t.after(async()=>{process.off('warning',warn);await chmod(state,0o700).catch(()=>{});});
  const second=await poolPreview({file,size:1,render:async()=>{await chmod(state,0o500);}},deps);
  await new Promise(r=>setImmediate(r));
  assert.equal(second.pool.generation,2);assert.equal(warnings.length,1);assert.match(warnings[0],/could not record the end of a preview/);
  await chmod(state,0o700);
  await assert.rejects(()=>assertReceiptCurrent(first.pool.receipt,deps),/replaced by a newer one/);
});

test('a review render that fails after the upload names the pool file by its receipt, in the wording runners parse',async t=>{
  const dir=await temporary(t),file=join(dir,'deck.pptx');await writeFile(file,pptx('deck'));
  const {renderGoogle}=await import('../scripts/lib/slide-review.mjs'),{poolStub}=await import('./pool-fixtures.mjs');
  const drive={poolPreview:poolStub([],{id:'pool_file_7',generation:3}),exportPdf:async()=>{throw new Error('Drive did not return a PDF; no output was saved.');}};
  const error=await renderGoogle({file,output:dir,selected:[1],title:'Deck',drive,run:async()=>({stdout:''})}).catch(e=>e);
  assert.match(error.message,/The review deck is in Drive \(https:\/\/docs.google.com\/presentation\/d\/pool_file_7\/edit\); retry with --renderer google --file-id pool_file_7:3\.$/);
  assert.match(error.message,/(?:--renderer google )?--file-id (\S+?)\.$/);
});
