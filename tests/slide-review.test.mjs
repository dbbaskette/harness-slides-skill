import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReview, markReview, renderPptx } from '../scripts/lib/slide-review.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=', 'base64');
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'harness-review-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const output = join(dir, 'review'), file = join(dir, 'deck.pptx');
  await writeFile(file, 'deck revision one');
  return { dir, output, file };
}
const pages = () => [1, 2].map(n => ({ number: n, id: `slide-${n}`, title: n === 1 ? '<script>title</script>' : 'Hidden reference', hidden: n === 2, fingerprint: `content-${n}` }));
function renderer(log) {
  return async ({ output, selected }) => {
    log.push(selected);
    for (const n of selected) await writeFile(join(output, `${n}.png`), png);
    return { count: 2, image: n => join(output, `${n}.png`) };
  };
}

test('review is pending until inspected; reuses unchanged renders but clears final coverage on any new revision', async t => {
  const f = await fixture(t), log = [];
  const options = { ...f, inventory: async () => ({ slides: pages() }), signature: async () => 'tools/fonts-v1', render: renderer(log) };
  const first = await prepareReview(options);
  assert.deepEqual(first.pending, [1, 2]);
  assert.equal(first.visualReviewComplete, false);
  const html = await readFile(first.contactSheet, 'utf8');
  assert.ok(html.includes('&lt;script&gt;title&lt;/script&gt;'));
  assert.ok(html.includes('(hidden)'));
  const checked = await markReview({ output: f.output, revision: first.revision, numbers: [1, 2], note: 'Fixture inspection' });
  assert.equal(checked.visualReviewComplete, true);
  assert.deepEqual((await prepareReview(options)).pending, []);
  assert.equal(log.length, 1);
  await writeFile(f.file, 'revision two: notes only');
  const changed = await prepareReview(options);
  assert.deepEqual(changed.changed, []);
  assert.deepEqual(changed.pending, [1, 2]);
  await assert.rejects(markReview({ output: f.output, revision: first.revision, numbers: [1], note: 'Stale' }), /revision changed/);
  await assert.rejects(markReview({ output: f.output, revision: changed.revision, numbers: [3], note: 'Invalid' }), /Unknown slide/);
});

test('content, dependencies, renderer, order and corrupted cached images invalidate inspection and rebuild affected slides', async t => {
  const f = await fixture(t), log = []; let current = pages(), signature = 'v1';
  const options = { ...f, inventory: async () => ({ slides: current }), signature: async () => signature, render: renderer(log) };
  await prepareReview(options);
  current[0].fingerprint = 'changed-theme-or-media';
  assert.deepEqual((await prepareReview(options)).changed, [1]);
  const record = JSON.parse(await readFile(join(f.output, 'review.json')));
  await writeFile(join(f.output, record.slides[1].image), 'damaged');
  assert.deepEqual((await prepareReview(options)).changed, [2]);
  assert.deepEqual(await readFile(join(f.output, record.slides[1].image)), png);
  signature = 'new fonts';
  assert.deepEqual((await prepareReview(options)).changed, [1, 2]);
  current = current.reverse().map((s, i) => ({ ...s, number: i + 1 }));
  assert.deepEqual((await prepareReview(options)).changed, [1, 2]);
  assert.deepEqual((await prepareReview({ ...options, refresh: true })).changed, [1, 2]);
});

test('failed initial preparation is retryable; incomplete renders and symlinked files are rejected', async t => {
  const f = await fixture(t), log = [];
  const base = { ...f, inventory: async () => ({ slides: pages() }), signature: async () => 'v1' };
  await assert.rejects(prepareReview({ ...base, render: async () => { throw new Error('renderer failed'); } }), /renderer failed/);
  await assert.rejects(prepareReview({ ...base, render: async () => ({ count: 1 }) }), /Hidden slides or export coverage/);
  const result = await prepareReview({ ...base, render: renderer(log) });
  assert.equal(result.slides, 2);
  await writeFile(f.file, 'changed after render');
  await assert.rejects(markReview({ output: f.output, revision: result.revision, numbers: [1], note: 'Stale' }), /Deck changed/);
  await symlink(f.file, join(f.dir, 'linked.pptx'));
  await assert.rejects(prepareReview({ ...base, file: join(f.dir, 'linked.pptx') }), /regular file/);
});

test('native manifest requires complete inventory and binds final coverage to the native revision and image bytes', async t => {
  const f = await fixture(t), manifest = join(f.dir, 'native.json');
  await writeFile(join(f.dir, 'one.png'), png);
  const data = { presentationId: 'native-id', revision: 'rev1', renderer: 'Google Slides', expectedSlideCount: 2,
    slides: pages().map(s => ({ ...s, image: 'one.png' })) };
  await writeFile(manifest, JSON.stringify(data));
  const options = { previews: manifest, output: f.output };
  const result = await prepareReview(options);
  await markReview({ output: f.output, revision: result.revision, numbers: [1, 2], note: 'Fixture inspection' });
  data.revision = 'rev2';
  await writeFile(manifest, JSON.stringify(data));
  assert.deepEqual((await prepareReview(options)).pending, [1, 2]);
  data.expectedSlideCount = 3;
  await writeFile(manifest, JSON.stringify(data));
  await assert.rejects(prepareReview(options), /complete slide inventory/);
  data.expectedSlideCount = 2; data.slides[1].id = data.slides[0].id;
  await writeFile(manifest, JSON.stringify(data));
  await assert.rejects(prepareReview(options), /unique slide IDs/);
});

test('local renderer requests hidden slides and rasterizes only invalidated pages', async t => {
  const f = await fixture(t), calls = [];
  const result = await renderPptx({ file: f.file, output: f.dir, selected: [2], run: async (cmd, args) => {
    calls.push([cmd, args]); return { stdout: cmd === 'pdfinfo' ? 'Pages: 3\n' : '', stderr: '' };
  } });
  assert.equal(result.count, 3);
  assert.ok(calls[0][1].some(a => a.includes('ExportHiddenSlides')));
  assert.deepEqual(calls[2][1].slice(0, 4), ['-f', '2', '-l', '2']);
});
