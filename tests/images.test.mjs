import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, access, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { images, runtimePath, signIn, runProcess, privateDirectory } from '../scripts/lib/images.mjs';
const exec = promisify(execFile);
const helper = new URL('../scripts/harness-slides.mjs', import.meta.url).pathname;

test('image worker generation, recovery, validation and privacy fixtures', async () => {
  const r = await exec(process.env.HARNESS_IMAGE_TEST_PYTHON ?? 'python3', ['-B', 'tests/images-worker.py'], { timeout: 30000 });
  assert.match(r.stderr, /OK/);
});

test('the cookie route is an explicit provider: offline status, one sign-in, a short-lived worker', async t => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'slides-images-'))); t.after(() => rm(base, { recursive: true, force: true }));
  const state = join(base, 'private'), provider = 'gemini-web';
  assert.equal((await images('status', { state, provider })).status, 'setup_required');
  await assert.rejects(access(state));
  await privateDirectory(state);
  const runtime = await runtimePath(state);
  await mkdir(runtime, { recursive: true }); await writeFile(join(runtime, 'ready'), '1');
  const calls = [];
  const deps = { run: async (cmd, args, options) => { calls.push({ cmd, args, options }); return { status: 'ready' }; },
    install: async () => runtime, signIn: async () => ({ '__Secure-1PSID': 'private-cookie' }) };
  await images('setup', { state, provider }, deps);
  assert.equal(calls[0].options.input.action, 'runtime');
  calls.shift();
  assert.equal(calls[0].options.input.action, 'auth');
  const request = { state, provider, project: base, id: 'slide-04', promptFile: 'brief.txt', output: 'assets/image.png', references: ['reference.png'] };
  await images('generate', request, deps);
  assert.equal(calls[1].options.input.action, 'generate');
  assert.equal(calls[1].options.input.references.length, 1);
  assert.deepEqual(calls[1].args.slice(0, 2), ['-I','-B']);
  assert.equal(calls[1].options.input.cookies, undefined);
  await images('download', { state, provider, project: base, id: 'slide-04' }, deps);
  assert.equal(calls[2].options.input.action, 'download');
  await assert.rejects(images('generate', { state, provider }, deps), /project_and_id_required/);
  // The worker cannot apply a deck art style, so it refuses rather than break the deck's shared style.
  await assert.rejects(images('generate', { ...request, aspect: '1:1' }, deps), e => e.code === 'requires_api_provider');
  await writeFile(join(base, 'art-style.txt'), 'Medium: ink wash.');
  await assert.rejects(images('generate', request, deps), e => e.code === 'requires_api_provider');
  await assert.rejects(images('status', { state, provider: 'other' }), e => e.code === 'unknown_provider');
  assert.equal(calls.length, 3);
});

test('Chrome setup exports only required cookies and closes its context', async t => {
  const state = await realpath(await mkdtemp(join(tmpdir(), 'slides-login-'))); t.after(() => rm(state, { recursive: true, force: true }));
  let closed = 0, browserOptions;
  const context = {
    cookies: async () => [{ name: '__Secure-1PSID', value: 'private' }, { name: '__Secure-1PSIDTS', value: 'timestamp' }, { name: 'OTHER', value: 'excluded' }],
    close: async () => { closed++; }
  };
  const deps = { run: async (_cmd,args) => {assert.ok(args.some(a=>a.startsWith('--user-data-dir=')));assert.ok(args.includes('--disable-background-mode'));}, playwright: { chromium: { launchPersistentContext: async (profile, options) => { browserOptions = options; return context; } } } };
  const cookies = await signIn(state, '/unused/runtime', deps);
  assert.deepEqual(Object.keys(cookies), ['__Secure-1PSID', '__Secure-1PSIDTS']);
  assert.equal(browserOptions.headless, true); assert.equal(closed, 1);
  context.cookies = async () => [];
  await assert.rejects(signIn(state, '/unused/runtime', deps), /session needs sign-in/);
  assert.equal(closed, 2);
});

test('subprocess responses remain bounded and sanitized; helper exits', async t => {
  const base=await realpath(await mkdtemp(join(tmpdir(),'slides-cli-image-state-')));t.after(()=>rm(base,{recursive:true,force:true}));const env={...process.env,HARNESS_IMAGE_STATE:join(base,'absent')};
  await assert.rejects(runProcess(process.execPath, ['-e', 'console.error("private-cookie"); console.log("bad JSON"); process.exit(1)'], { input: { action: 'generate' } }), error => !error.message.includes('private-cookie'));
  await assert.rejects(runProcess(process.execPath, ['-e', 'console.log("x".repeat(40000))'], { input: {} }), /invalid_worker_response/);
  assert.deepEqual(await runProcess(process.execPath, ['-e', 'console.log(JSON.stringify({status:"ready"}))'], { input: {} }), { status: 'ready' });
  const { stdout } = await exec(process.execPath, [helper, 'images', 'status'],{env});
  assert.equal(JSON.parse(stdout).liveChecked, false);
  await assert.rejects(exec(process.execPath, [helper, 'images', 'status', '--model', 'unexpected'],{env}), /not valid/);
});
