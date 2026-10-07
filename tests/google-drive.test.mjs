import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDriveAccess, exportDeck, importDeck, multipartPptx } from '../scripts/google-drive-deck.mjs';

const pptx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x12, 0x34]);
const tokenProvider = async () => 'fixture-token';
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => body });

test('gcloud Drive check reads account and advertised conversion without printing a token', async () => {
  let seen;
  const result = await checkDriveAccess({ tokenProvider, fetcher: async (url, options) => {
    seen = { url: new URL(url), options };
    return response({ user: { emailAddress: 'person@example.invalid' }, importFormats: {
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['application/vnd.google-apps.presentation'],
    } });
  } });
  assert.deepEqual(result, { account: 'person@example.invalid', pptxImportAdvertised: true });
  assert.equal(seen.url.pathname, '/drive/v3/about');
  assert.match(seen.url.searchParams.get('fields'), /importFormats/);
  assert.equal(seen.options.headers.Authorization, 'Bearer fixture-token');
});

test('export saves PPTX bytes once and never overwrites an existing file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'harness-drive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'deck.pptx');
  let requested;
  const deps = { tokenProvider, fetcher: async url => { requested = new URL(url); return response(pptx); } };
  assert.deepEqual(await exportDeck({ fileId: 'deck_123', output }, deps), { output, bytes: pptx.length });
  assert.deepEqual(await readFile(output), pptx);
  assert.equal(requested.pathname, '/drive/v3/files/deck_123/export');
  assert.ok(!requested.searchParams.has('supportsAllDrives'));
  await assert.rejects(exportDeck({ fileId: 'deck_123', output }, deps), /EEXIST/);
  assert.deepEqual(await readFile(output), pptx);
  await assert.rejects(exportDeck({ fileId: '../bad', output: join(root, 'bad.pptx') }, deps), /Drive ID/);
  await assert.rejects(exportDeck({ fileId: 'deck_123', output: join(root, 'error.pptx') }, { tokenProvider, fetcher: async () => response({}, 403) }), /HTTP 403/);
});

test('import sends multipart/related metadata and PPTX bytes, then confirms native Slides', async t => {
  const root = await mkdtemp(join(tmpdir(), 'harness-drive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'source.pptx');
  await writeFile(file, pptx);
  let seen;
  const result = await importDeck({ file, name: 'New deck', folderId: 'folder_123' }, {
    tokenProvider, fetcher: async (url, options) => { seen = { url: new URL(url), options }; return response({ id: 'new_123', name: 'New deck', mimeType: 'application/vnd.google-apps.presentation' }); },
  });
  assert.equal(result.url, 'https://docs.google.com/presentation/d/new_123/edit');
  assert.equal(seen.url.pathname, '/upload/drive/v3/files');
  assert.equal(seen.url.searchParams.get('uploadType'), 'multipart');
  assert.equal(seen.options.method, 'POST');
  assert.match(seen.options.headers['Content-Type'], /^multipart\/related; boundary=/);
  const body = seen.options.body;
  assert.ok(body.includes(pptx));
  assert.ok(body.indexOf(Buffer.from('"name":"New deck"')) < body.indexOf(pptx));
  assert.ok(body.includes(Buffer.from('"parents":["folder_123"]')));
  assert.ok(body.includes(Buffer.from('application/vnd.google-apps.presentation')));
  assert.ok(body.includes(Buffer.from('application/vnd.openxmlformats-officedocument.presentationml.presentation')));
  assert.ok(!seen.options.headers['Content-Type'].includes('form-data'));
  const fixed = multipartPptx(pptx, { name: 'Fixture' }, 'boundary_fixture');
  assert.ok(fixed.body.toString('utf8').endsWith('\r\n--boundary_fixture--\r\n'));
});

test('failed or ambiguous import never claims a converted file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'harness-drive-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'source.pptx');
  await writeFile(file, pptx);
  await assert.rejects(importDeck({ file }, { tokenProvider, fetcher: async () => response({}, 403) }), /Inspect Drive before retrying/);
  await assert.rejects(importDeck({ file }, { tokenProvider, fetcher: async () => response({ id: 'x', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }) }), /did not confirm a native/);
  await assert.rejects(importDeck({ file, folderId: '../bad' }, { tokenProvider, fetcher: async () => { throw new Error('should not fetch'); } }), /Drive ID/);
});


test('Google diagnostics distinguish unavailable native APIs and oversized exports without leaking provider text',async()=>{
 const {request}=await import('../scripts/google-drive-deck.mjs');
 for(const [reason,expected] of [['SERVICE_DISABLED',/OAuth client or quota project/],['exportSizeLimitExceeded',/export size limit/]]){
  await assert.rejects(request('https://slides.googleapis.com/v1/presentations/fixture',{}, {tokenProvider,fetcher:async()=>response({error:{message:'private URL or credential must not be echoed',details:[{reason}]}},403)}),e=>expected.test(e.message)&&!e.message.includes('private URL'));
 }
});
