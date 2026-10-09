// Gemini API image provider with HTTP stubbed: no network, key or billing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath, stat, chmod, access, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { images } from '../scripts/lib/images.mjs';
import { apiKey, endpoint, defaultModel } from '../scripts/lib/gemini-api.mjs';

const exec = promisify(execFile), cli = new URL('../scripts/harness-slides.mjs', import.meta.url).pathname;
const key = 'stub-gemini-key-never-real-0123456789', sha = data => createHash('sha256').update(data).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffc0000b080002000301011100ffd9', 'hex');
const brief = 'A greenhouse on a ridge at dawn, wide negative space on the left.';
const json = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
// A thought step carries a draft; only the model output is the image.
const image = bytes => json({ id: 'v1_stub', status: 'completed', steps: [{ type: 'thought', summary: [{ type: 'image', data: 'ZHJhZnQ=' }] },
  { type: 'model_output', content: [{ type: 'image', mime_type: 'image/png', data: bytes.toString('base64') }] }] });
const dropped = code => () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error(`connection lost ${key}`), { code }) }); };
const code = expected => error => { assert.equal(error.code, expected); assert.ok(!error.message.includes(key) && !String(error.stack).includes(key)); return true; };

async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'slides-api-images-'))); t.after(() => rm(base, { recursive: true, force: true }));
  const f = { base, project: join(base, 'deck'), state: join(base, 'state'), promptFile: join(base, 'deck/brief.txt'), calls: [], reply: image(png) };
  await mkdir(f.project); await writeFile(f.promptFile, brief + '\n');
  f.deps = { env: { GEMINI_API_KEY: key }, fetch: async (url, init) => { f.calls.push({ url: String(url), init }); return f.reply(); } };
  f.slide = n => ({ id: `slide-0${n}-v1`, output: `assets/slide-0${n}.png` });
  f.generate = (extra = {}, deps = f.deps) => images('generate', { state: f.state, project: f.project, promptFile: f.promptFile, ...f.slide(4), ...extra }, deps);
  f.download = (id = 'slide-04-v1') => images('download', { state: f.state, project: f.project, id }, { env: {}, fetch: f.deps.fetch });
  f.sent = n => JSON.parse(f.calls[n].init.body);
  return f;
}
async function written(dir) {
  let all = '';
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) if (entry.isFile()) all += await readFile(join(entry.parentPath ?? entry.path, entry.name), 'latin1');
  return all;
}

test('one documented Interactions request saves the image and a sidecar of hashes', async t => {
  const f = await fixture(t), reference = join(f.project, 'reference.png'); await writeFile(reference, png);
  const result = await f.generate({ references: [reference] }), { url, init } = f.calls[0];
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
  assert.deepEqual(init.headers, { 'x-goog-api-key': key, 'content-type': 'application/json' });
  assert.deepEqual(f.sent(0), { model: 'gemini-nano-banana-2.1', input: [{ type: 'text', text: brief }, { type: 'image', mime_type: 'image/png', data: png.toString('base64') }],
    response_format: { type: 'image', aspect_ratio: '16:9', image_size: '2K' } });
  assert.deepEqual(result, { status: 'downloaded', id: 'slide-04-v1', path: join(f.project, 'assets/slide-04.png'), width: 1, height: 1, sha256: sha(png), metadata: join(f.project, 'assets/slide-04.image.json') });
  assert.deepEqual(await readFile(result.path), png);
  const sidecar = JSON.parse(await readFile(result.metadata, 'utf8'));
  assert.match(sidecar.created, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(sidecar, { provider: 'gemini-api', api: 'interactions', requestId: 'slide-04-v1', generated: true, model: defaultModel, created: sidecar.created, promptSha256: sha(brief),
    styleSha256: null, referenceSha256: [sha(png)], aspectRatio: '16:9', imageSize: '2K', format: 'png', width: 1, height: 1, sha256: sha(png) });
  for (const path of [result.path, result.metadata]) assert.equal((await stat(path)).mode & 0o077, 0);
  // The same ID and brief return the saved asset: no request, and no key needed.
  assert.deepEqual(await f.generate({ references: [reference] }, { ...f.deps, env: {} }), result);
  assert.deepEqual(await f.download(), result);
  await rm(result.metadata);
  assert.deepEqual(await f.download(), result);
  assert.equal(JSON.parse(await readFile(result.metadata, 'utf8')).sha256, sha(png));
  assert.equal(f.calls.length, 1);
  await writeFile(result.path, jpeg);
  await assert.rejects(f.generate({ references: [reference] }), code('downloaded_asset_changed'));
  const wide = await f.generate({ ...f.slide(5), aspect: '21:9', size: '4K', model: 'gemini-3-pro-image' });
  assert.deepEqual([f.sent(1).model, f.sent(1).response_format], ['gemini-3-pro-image', { type: 'image', aspect_ratio: '21:9', image_size: '4K' }]);
  assert.equal(JSON.parse(await readFile(wide.metadata, 'utf8')).model, 'gemini-3-pro-image');
});

test('an API error generates nothing, redacts the key and leaves the ID free', async t => {
  const f = await fixture(t);
  f.reply = json({ error: { code: 'rate_limit_exceeded', message: `Quota exceeded for ${key}\nRetry later.` } }, 429);
  await assert.rejects(f.generate(), error => code('rate_limited')(error) && /\(HTTP 429 rate_limit_exceeded: Quota exceeded for \[key\] Retry later\.\)$/.test(error.message));
  await assert.rejects(access(join(f.project, 'assets/slide-04.png')));
  for (const [status, body, expected] of [[401, { error: { code: 'authentication', message: 'The API key is invalid.' } }, 'key_rejected'], [403, {}, 'key_rejected'],
    [400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, 'key_rejected'],
    [402, { error: { code: 'payment_required' } }, 'billing_required'], [400, { error: { code: 'failed_precondition' } }, 'billing_required'],
    [404, { error: { code: 'model_not_found' } }, 'model_unavailable'], [400, { error: { code: 'parameter_unknown', message: 'x'.repeat(900) } }, 'api_refused'], [503, null, 'api_refused']]) {
    f.reply = body ? json(body, status) : () => new Response('upstream unavailable', { status });
    await assert.rejects(f.generate(), error => code(expected)(error) && error.message.length < 600);
  }
  // Google answered each time, so nothing was generated or charged and the same ID still works.
  f.reply = image(png);
  assert.equal((await f.generate()).status, 'downloaded');
  assert.equal(f.calls.length, 10);
});

test('a missing key stops with the AI Studio steps before anything is reserved or sent', async t => {
  const f = await fixture(t), none = { ...f.deps, env: { GEMINI_API_KEY: '  ' } };
  await assert.rejects(f.generate({}, none), error => code('key_required')(error) && /1\. Open https:\/\/aistudio\.google\.com\/apikey .* 2\. .*GEMINI_API_KEY.*Never paste it into chat\. 3\. Run images check\./.test(error.message));
  await assert.rejects(images('check', { state: f.state }, none), code('key_required'));
  const status = await images('status', { state: f.state }, none);
  assert.deepEqual([status.status, status.keyVariable, status.liveChecked, status.paid, status.steps.length], ['key_required', null, false, true, 3]);
  assert.deepEqual(await images('setup', { state: f.state }, none), status);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await readdir(join(f.state, 'api-jobs')), []);
  assert.equal((await f.generate()).status, 'downloaded');
});

test('an ID cannot be reused with a changed brief, style, reference, shape or model', async t => {
  const f = await fixture(t), first = await f.generate();
  await writeFile(f.promptFile, 'A different image.');
  await assert.rejects(f.generate(), code('request_id_conflict'));
  await writeFile(f.promptFile, `  ${brief}\n\n`);
  assert.deepEqual(await f.generate(), first);
  for (const change of [{ size: '4K' }, { aspect: '1:1' }, { model: 'gemini-3-pro-image' }, { references: [first.path] }, { style: f.promptFile }])
    await assert.rejects(f.generate(change), code('request_id_conflict'));
  await writeFile(join(f.project, 'art-style.txt'), 'Medium: ink wash.');
  await assert.rejects(f.generate(), code('request_id_conflict'));
  assert.equal(f.calls.length, 1);
  assert.deepEqual(await readFile(first.path), png);
  // The same ID in another project is a separate request.
  const other = join(f.base, 'other-deck'); await mkdir(other);
  assert.equal((await f.generate({ project: other })).path, join(other, 'assets/slide-04.png'));
});

test('the deck art style is prepended verbatim to every brief and its hash recorded', async t => {
  const f = await fixture(t), style = 'Medium: flat vector illustration.\nPalette: deep blue, jade, warm grey.\nLighting: soft and even.\nAvoid: text, logos, photorealism.';
  await writeFile(join(f.project, 'art-style.txt'), `\n${style}\n`);
  const sidecars = [];
  for (const n of [4, 5]) sidecars.push(JSON.parse(await readFile((await f.generate(f.slide(n))).metadata, 'utf8')));
  for (const n of [0, 1]) assert.equal(f.sent(n).input[0].text, `${style}\n\n${brief}`);
  assert.deepEqual(sidecars.map(s => [s.styleSha256, s.promptSha256]), [[sha(style), sha(brief)], [sha(style), sha(brief)]]);
  assert.ok(!/vector|greenhouse/.test(await written(join(f.project, 'assets'))));
  // --style names a block kept elsewhere, in place of the project's own file.
  const elsewhere = join(f.base, 'brand-style.txt'); await writeFile(elsewhere, 'Medium: ink wash.');
  const third = await f.generate({ ...f.slide(6), style: elsewhere });
  assert.equal(f.sent(2).input[0].text, `Medium: ink wash.\n\n${brief}`);
  assert.equal(JSON.parse(await readFile(third.metadata, 'utf8')).styleSha256, sha('Medium: ink wash.'));
  // An empty style file is a mistake to fix, not a deck without a style.
  await writeFile(join(f.project, 'art-style.txt'), ' \n');
  await assert.rejects(f.generate(f.slide(7)), code('empty_style'));
  await assert.rejects(f.generate({ ...f.slide(7), style: join(f.base, 'missing.txt') }), code('style_unreadable'));
  assert.equal(f.calls.length, 3);
});

test('an uncertain send is never replayed; a request that never connected can be', async t => {
  const f = await fixture(t);
  f.reply = dropped('UND_ERR_SOCKET');
  await assert.rejects(f.generate(), code('generation_uncertain'));
  f.reply = image(png);
  await assert.rejects(f.generate(), code('generation_uncertain'));
  await assert.rejects(f.download(), code('generation_uncertain'));
  await assert.rejects(access(join(f.project, 'assets/slide-04.png')));
  assert.equal(f.calls.length, 1);
  // A success status whose body cannot be read may still have been generated and charged.
  f.reply = () => new Response('<html>', { status: 200 });
  await assert.rejects(f.generate(f.slide(5)), code('generation_uncertain'));
  f.reply = image(png);
  await assert.rejects(f.generate(f.slide(5)), code('generation_uncertain'));
  assert.equal(f.calls.length, 2);
  f.reply = dropped('ENOTFOUND');
  await assert.rejects(f.generate(f.slide(6)), code('network_unavailable'));
  f.reply = image(png);
  assert.equal((await f.generate(f.slide(6))).status, 'downloaded');
  // Two callers with one ID: the first reserves it, so only one request leaves.
  const pair = await Promise.allSettled([f.generate(f.slide(7)), f.generate(f.slide(7))]);
  assert.deepEqual(pair.map(p => p.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(pair.find(p => p.reason).reason.code, 'generation_uncertain');
  assert.equal(f.calls.length, 5);
});

test('an answer without a usable image is not resent', async t => {
  const f = await fixture(t);
  // Draft images in thoughts and echoed input images are not the model's output.
  const block = { type: 'image', mime_type: 'image/png', data: png.toString('base64') };
  f.reply = json({ status: 'completed', steps: [{ type: 'thought', summary: [block] }, { type: 'model_output', content: [{ type: 'text', text: 'I cannot draw that.' }] }, { type: 'user_input', content: [block] }] });
  await assert.rejects(f.generate(), code('no_image_returned'));
  f.reply = image(png);
  await assert.rejects(f.generate(), code('no_image_returned'));
  await assert.rejects(f.download(), code('no_image_returned'));
  f.reply = image(Buffer.from('not an image'));
  await assert.rejects(f.generate(f.slide(5)), code('no_image_returned'));
  assert.equal(f.calls.length, 2);
});

test('a failed save keeps the paid image for download; a JPEG answer keeps its own extension', { skip: process.getuid?.() === 0 }, async t => {
  const f = await fixture(t), assets = join(f.project, 'assets');
  await mkdir(assets); await chmod(assets, 0o500);
  try { await assert.rejects(f.generate(), error => code('download_failed')(error) && /Retry images download/.test(error.message)); }
  finally { await chmod(assets, 0o700); }
  const result = await f.download();
  assert.deepEqual(await readFile(result.path), png);
  assert.deepEqual(await f.generate(), result);
  assert.ok(!(await readdir(join(f.state, 'api-jobs'))).some(name => name.endsWith('.image')));
  f.reply = image(jpeg);
  const photo = await f.generate(f.slide(5));
  assert.deepEqual([photo.path, photo.width, photo.height], [join(assets, 'slide-05.jpg'), 3, 2]);
  assert.deepEqual(await readFile(photo.path), jpeg);
  assert.equal(JSON.parse(await readFile(photo.metadata, 'utf8')).format, 'jpg');
  assert.equal(f.calls.length, 2);
  await assert.rejects(f.download('never-requested'), code('unknown_request'));
});

test('requests that fail local checks are never sent', async t => {
  const f = await fixture(t), text = join(f.base, 'not-an-image.png'), big = join(f.base, 'big.png');
  await writeFile(text, 'plain text'); await writeFile(big, Buffer.concat([png, Buffer.alloc(15 * 1024 * 1024)]));
  await mkdir(join(f.project, 'assets')); await writeFile(join(f.project, 'assets/taken.jpg'), jpeg);
  await symlink(f.base, join(f.project, 'assets/outside'));
  for (const [change, expected] of [[{ output: '../outside.png' }, 'output_must_be_in_assets'], [{ output: 'slide.png' }, 'output_must_be_in_assets'], [{ output: 'assets/slide.jpg' }, 'output_must_be_png'],
    [{ output: 'assets/outside/slide.png' }, 'unsafe_output'], [{ output: 'assets/taken.png' }, 'output_exists'], [{ aspect: '7:5' }, 'unsupported_aspect_or_size'], [{ size: '2k' }, 'unsupported_aspect_or_size'],
    [{ model: '../files' }, 'invalid_model'], [{ id: 'slide 04' }, 'request_id_required'], [{ id: undefined }, 'project_and_id_required'], [{ promptFile: undefined }, 'brief_and_output_required'],
    [{ promptFile: join(f.base, 'missing.txt') }, 'prompt_unreadable'], [{ project: join(f.base, 'missing') }, 'project_not_found'], [{ references: [text] }, 'invalid_image'],
    [{ references: [big] }, 'references_too_large'], [{ references: Array(6).fill(text) }, 'too_many_references']]) await assert.rejects(f.generate(change), code(expected));
  await writeFile(f.promptFile, ' \n');
  await assert.rejects(f.generate(), code('empty_prompt'));
  assert.equal(f.calls.length, 0);
});

test('status and check name the key variable, never its value; check is one unbilled metadata request', async t => {
  const f = await fixture(t);
  assert.deepEqual(apiKey({ GEMINI_API_KEY: 'gemini', GOOGLE_API_KEY: 'google' }), { name: 'GOOGLE_API_KEY', value: 'google' });
  assert.equal(apiKey({}), null);
  const summary = { provider: 'gemini-api', model: 'gemini-nano-banana-2.1', keyVariable: 'GEMINI_API_KEY' };
  assert.deepEqual(await images('status', { state: f.state }, f.deps), { status: 'configured', ...summary, liveChecked: false, paid: true });
  assert.equal(f.calls.length, 0);
  f.reply = json({ name: 'models/gemini-nano-banana-2.1' });
  assert.deepEqual(await images('check', { state: f.state }, f.deps), { status: 'ready', ...summary, liveChecked: true, billingChecked: false, paid: true });
  const { url, init } = f.calls[0];
  assert.equal(url, `${endpoint}/models/gemini-nano-banana-2.1`);
  assert.deepEqual([init.method, init.body, init.redirect, init.headers], ['GET', undefined, 'error', { 'x-goog-api-key': key }]);
  f.reply = json({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }, 400);
  await assert.rejects(images('check', { state: f.state }, f.deps), code('key_rejected'));
  f.reply = dropped('ECONNREFUSED');
  await assert.rejects(images('check', { state: f.state }, f.deps), code('network_unavailable'));
  await assert.rejects(access(f.state));
});

test('the key never reaches a result, an error, a file or a URL', async t => {
  const f = await fixture(t), seen = [], attempt = async run => { try { seen.push(JSON.stringify(await run())); } catch (error) { seen.push(`${error.message}\n${error.stack}\n${JSON.stringify(error)}`); } };
  await writeFile(join(f.project, 'art-style.txt'), 'Medium: ink wash.');
  for (const [n, reply] of [image(png), json({ error: { code: 'authentication', message: `Invalid key ${key}` } }, 401), dropped('ECONNRESET'), dropped('ENOTFOUND'), json({ status: 'failed', steps: [] }), () => new Response(key, { status: 200 })].entries()) {
    f.reply = reply;
    await attempt(() => f.generate(f.slide(n)));
    await attempt(() => f.generate(f.slide(n)));
    await attempt(() => f.download(`slide-0${n}-v1`));
  }
  for (const action of ['status', 'check', 'setup']) for (const reply of [json({ name: `models/${key}` }), json({ error: { message: key } }, 403), dropped('ECONNRESET')]) { f.reply = reply; await attempt(() => images(action, { state: f.state }, f.deps)); }
  assert.equal(seen.length, 27);
  assert.ok(!seen.join('\n').includes(key));
  assert.ok(!(await written(f.base)).includes(key));
  assert.ok(f.calls.length > 8 && f.calls.every(({ url, init }) => !url.includes(key) && !(init.body ?? '').includes(key) && init.headers['x-goog-api-key'] === key));
  // The command line prints which variable holds a key, and nothing sends without one.
  const { GEMINI_API_KEY, GOOGLE_API_KEY, ...clean } = process.env, env = { ...clean, HARNESS_IMAGE_STATE: f.state };
  const status = await exec(process.execPath, [cli, 'images', 'status'], { env: { ...env, GOOGLE_API_KEY: key } });
  assert.equal(JSON.parse(status.stdout).keyVariable, 'GOOGLE_API_KEY');
  assert.ok(!(status.stdout + status.stderr).includes(key));
  const args = ['images', 'generate', '--project', f.project, '--id', 'cli-01', '--prompt-file', f.promptFile, '--output', 'assets/cli.png', '--aspect', '4:3', '--size', '1K', '--style', join(f.project, 'art-style.txt')];
  await assert.rejects(exec(process.execPath, [cli, ...args], { env }), error => /aistudio\.google\.com\/apikey/.test(error.stderr) && error.stdout === '');
  await assert.rejects(exec(process.execPath, [cli, 'images', 'check'], { env }), /No Gemini API key is set/);
  await assert.rejects(exec(process.execPath, [cli, ...args.slice(0, -1), join(f.base, 'missing.txt')], { env }), /style_unreadable/);
  await assert.rejects(exec(process.execPath, [cli, ...args, '--size', '8K'], { env }), /unsupported_aspect_or_size/);
  await assert.rejects(exec(process.execPath, [cli, ...args, '--provider', 'gemini-web'], { env }), /apply only to the default Gemini API provider/);
});

test('an API-generated PNG and its sidecar satisfy the deck compiler\'s provenance check', async t => {
  const f = await fixture(t), { compileDeckFile } = await import('../scripts/lib/deck-plan.mjs'), { approveFixture } = await import('./design-fixtures.mjs');
  await writeFile(join(f.project, 'art-style.txt'), 'Medium: ink wash.');
  const art = await f.generate(), plan = JSON.parse(await readFile(new URL('../examples/quality-candidate.json', import.meta.url)));
  plan.slides = plan.slides.slice(3, 4);
  Object.assign(Object.values(plan.assets)[0], { src: art.path, metadata: art.metadata });
  const file = join(f.project, 'plan.json'); await writeFile(file, JSON.stringify(plan));
  await approveFixture(f.project, { schema: 1, title: plan.title, scope: 'new', slides: plan.slides.map(s => ({ id: s.id, title: s.title, sources: s.sources, intent: s.intent, visibleText: s.component.caption ?? s.title,
    composition: 'SCRIPTED FIXTURE: annotated image and editable explanation.', asset: { description: 'Stubbed API illustration with native labels.', disposition: 'selected', reason: 'Exercise API provenance without generating art.' } })) });
  await compileDeckFile({ file, output: join(f.project, 'built'), 'design-project': f.project });
  const { provenance } = JSON.parse(await readFile(join(f.project, 'built/design-report.json'), 'utf8')).inputs.assets[0];
  assert.deepEqual([provenance.provider, provenance.model, provenance.styleSha256, provenance.sha256], ['gemini-api', defaultModel, sha('Medium: ink wash.'), sha(png)]);
  await writeFile(art.metadata, (await readFile(art.metadata, 'utf8')).replace('gemini-api', 'elsewhere'));
  await assert.rejects(compileDeckFile({ file, output: join(f.project, 'unknown'), 'design-project': f.project }), /provenance/);
});
