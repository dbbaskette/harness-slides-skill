import { spawn } from 'node:child_process';
import { access, readFile, mkdir, mkdtemp, rename, rm, lstat, open, realpath } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, resolve, dirname, extname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { apiKey, defaultModel, aspectRatios, imageSizes, apis, checkModel, generateImage } from './gemini-api.mjs';

const helper = fileURLToPath(new URL('../images/worker.py', import.meta.url));
const requirements = fileURLToPath(new URL('../images/requirements.txt', import.meta.url));
export const defaultState = () => process.env.HARNESS_IMAGE_STATE ?? join(homedir(), '.harness-slides-images');
const styleFile = 'art-style.txt';
const keySteps = ['Open https://aistudio.google.com/apikey and choose Create API key.',
  'Put it in the environment as GEMINI_API_KEY (GOOGLE_API_KEY also works and wins if both are set). Never paste it into chat.',
  'Run images check.'];
const messages = {
  setup_required: 'Ask Harness Slides to setup images, then sign in to Google in its Chrome window.',
  auth_required: 'The Gemini session needs sign-in. Run setup images again.',
  busy: 'Another Slides image operation is running. Wait for it to finish.',
  generation_uncertain: 'Gemini may have received this request. It will not be resent. Check Gemini history (AI Studio logs for the API) before explicitly requesting a new image with a new ID.',
  download_failed: 'Generation is saved. Retry images download with the same project and ID; do not generate again.',
  expected_one_generated_image: 'Gemini did not return exactly one generated image. Web search images are rejected. Revise the brief and explicitly request a new image with a new ID.',
  python_311_required: 'Image setup needs Python 3.11 or newer. Ask the agent to prepare it and retry setup.',
  runtime_version_mismatch: 'The optional image runtime differs from the audited version. Run setup images from an updated trusted installation.',
  request_id_conflict: 'This ID already belongs to a different image request. Reuse its original brief or explicitly choose a new ID.',
  request_account_changed: 'This image belongs to a previous sign-in. Its download cannot be retried with a different saved session.',
  key_required: 'No Gemini API key is set. ' + keySteps.map((step, i) => `${i + 1}. ${step}`).join(' '),
  key_rejected: 'Google did not accept the API key for this request. Check the key and its project in AI Studio; never paste the key into chat. Nothing was generated.',
  billing_required: 'The key\'s Google Cloud project needs billing or credit; the image model has no free tier. Nothing was generated.',
  model_unavailable: 'This key cannot reach the requested image model. Nothing was generated.',
  rate_limited: 'Google rate-limited this key or its quota is spent. Nothing was generated; retry later with the same ID.',
  api_refused: 'The Gemini API refused the request. Nothing was generated; the same ID can be retried once the cause is fixed.',
  network_unavailable: 'The Gemini API could not be reached and nothing was sent. Retry with the same ID.',
  no_image_returned: 'The Gemini API answered without a usable image. It will not be resent. Revise the brief and explicitly request a new image with a new ID.',
  requires_api_provider: 'The art style block, --aspect, --size and --api apply only to the default Gemini API provider.',
  unsupported_api: 'Use --api interactions or --api generate-content.',
};
export class ImagesError extends Error {
  constructor(code, detail) { super((messages[code] ?? `Image operation failed (${code}).`) + (detail ? ` (${detail})` : '')); this.code = code; }
}

async function exists(path) { try { await access(path); return true; } catch { return false; } }
export async function privateDirectory(path) {
  path = resolve(path);
  for (let p = path; ; p = dirname(p)) {
    try { if ((await lstat(p)).isSymbolicLink()) throw new ImagesError('unsafe_state'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (p === dirname(p)) break;
  }
  await mkdir(path, { recursive: true, mode: 0o700 });
  const st = await lstat(path);
  if (!st.isDirectory() || (st.mode & 0o077) || (process.getuid && st.uid !== process.getuid())) throw new ImagesError('unsafe_state');
  return path;
}

// Capture only compact worker JSON. Provider logs and raw subprocess failures
// never enter the agent's output; setup progress goes to stderr.
export function runProcess(command, args, { input, timeout = 600000, progress = false, env = process.env } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', exceeded = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); fail(new ImagesError('operation_timeout')); }, timeout);
    child.stdout.on('data', chunk => {
      if (!input) return;
      stdout += chunk;
      if (Buffer.byteLength(stdout) > 32 * 1024) { exceeded = true; child.kill('SIGKILL'); }
    });
    child.stderr.on('data', () => {}); // Never echo cookies or upstream errors.
    child.stdin.on('error', () => {});
    child.once('error', () => { clearTimeout(timer); fail(new ImagesError('runtime_unavailable')); });
    child.once('close', code => {
      clearTimeout(timer);
      if (exceeded) return fail(new ImagesError('invalid_worker_response'));
      if (code && !input) return fail(new ImagesError('runtime_setup_failed'));
      if (!input) return ok(stdout);
      try {
        const result = JSON.parse(stdout);
        if (code || result.status === 'error') return fail(new ImagesError(result.code ?? 'image_operation_failed'));
        ok(result);
      } catch { fail(new ImagesError('invalid_worker_response')); }
    });
    child.stdin.end(input ? JSON.stringify(input) + '\n' : undefined);
    if (progress) process.stderr.write('Preparing optional image dependencies…\n');
  });
}

export async function runtimePath(state) {
  const pin = createHash('sha256').update(await readFile(requirements)).update('playwright@1.58.0').digest('hex').slice(0, 16);
  return join(state, 'runtimes', pin);
}
export async function installImageRuntime(state, deps = {}) {
  if (platform() === 'win32') throw new ImagesError('requires_macos_or_linux');
  const run = deps.run ?? runProcess;
  state = await privateDirectory(state);
  const runtime = await runtimePath(state);
  if (await exists(join(runtime, 'ready'))) return runtime;
  await privateDirectory(dirname(runtime));
  const temp = await mkdtemp(join(dirname(runtime), '.setup-'));
  try {
    const python = deps.python ?? process.env.HARNESS_IMAGE_PYTHON ?? 'python3';
    try { await run(python, ['-c', 'import sys; assert sys.version_info >= (3,11)'], { timeout: 10000 }); }
    catch { throw new ImagesError('python_311_required'); }
    await run(python, ['-m', 'venv', join(temp, 'venv')]);
    await run(join(temp, 'venv/bin/python'), ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements], { progress: true });
    await run('npm', ['install', '--prefix', join(temp, 'browser'), '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', 'playwright@1.58.0'], { progress: true });
    // Import/check versions before marking ready. No account or provider request.
    await run(join(temp, 'venv/bin/python'), ['-I', '-B', '-c', 'import gemini_webapi, PIL, curl_cffi']);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(temp, 'ready'), '1\n', { mode: 0o600 });
    try { await rename(temp, runtime); }
    catch (e) { if (!['EEXIST', 'ENOTEMPTY'].includes(e.code) || !await exists(join(runtime, 'ready'))) throw e; }
    return runtime;
  } catch (e) {
    if (e instanceof ImagesError) throw e;
    throw new ImagesError('runtime_setup_failed');
  } finally { await rm(temp, { recursive: true, force: true }); }
}

export async function signIn(state, runtime, deps = {}) {
  const profile = await privateDirectory(join(state, 'chrome-profile'));
  const chrome = process.env.HARNESS_IMAGE_CHROME ?? (platform() === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
  const run = deps.run ?? runProcess;
  process.stderr.write('Sign in to Google in the Slides Chrome window, then Quit this dedicated Chrome instance (Cmd+Q on Mac) to save the session. Closing a window is insufficient. Your normal Chrome profile is separate.\n');
  // Manual sign-in without automation flags; ordinary generation never opens Chrome.
  await run(chrome, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-mode', '--class=HarnessSlidesImages', '--password-store=basic', '--use-mock-keychain', 'https://gemini.google.com/app']);
  const { chromium } = deps.playwright ?? await import(pathToFileURL(join(runtime, 'browser/node_modules/playwright/index.mjs')).href);
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { executablePath: chrome, headless: true,
      args: ['--password-store=basic', '--use-mock-keychain'] });
    // Read the dedicated profile only. The worker verifies Gemini access after
    // export, without requiring automated navigation through Google's sign-in UI.
    const selected = Object.fromEntries((await context.cookies('https://gemini.google.com')).filter(c =>
      ['__Secure-1PSID', '__Secure-1PSIDTS'].includes(c.name)).map(c => [c.name, c.value]));
    if (!selected['__Secure-1PSID']) throw new ImagesError('auth_required');
    return selected;
  } catch { throw new ImagesError('auth_required'); }
  finally { if (context) await context.close(); }
}

const sha = data => createHash('sha256').update(data).digest('hex');
const kinds = { png: { mime: 'image/png', ext: '.png' }, jpg: { mime: 'image/jpeg', ext: '.jpg' }, webp: { mime: 'image/webp', ext: '.webp' } };
const isLink = async path => { try { return (await lstat(path)).isSymbolicLink(); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
// A receipt that cannot be parsed was caught mid-write by a crash or a second caller, so the send it guards is unknown.
const readJob = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e instanceof SyntaxError ? new ImagesError('generation_uncertain') : e; } };
// Reach the disk before the request leaves or the asset is reported: a crash must not forget a paid send.
async function durable(path, data, flags = 'w') {
  const file = await open(path, flags, 0o600);
  try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
}
const saveJob = async (path, job) => { await durable(path + '.tmp', JSON.stringify(job)); await rename(path + '.tmp', path); };
async function block(path, limit, name) {
  let text;
  try { text = await readFile(path, 'utf8'); } catch { throw new ImagesError(`${name}_unreadable`); }
  if (Buffer.byteLength(text) > limit) throw new ImagesError(`${name}_too_large`);
  if (!(text = text.trim())) throw new ImagesError(`empty_${name}`);
  return text;
}
// PNG, JPEG or WebP by content, with real dimensions. Nothing is decoded.
async function inspect(bytes) {
  try {
    const { imageSize } = await import('image-size'), { type, width, height } = imageSize(bytes);
    if (kinds[type] && width && height) return { type, width, height, sha256: sha(bytes) };
  } catch {}
  throw new ImagesError('invalid_image');
}
// Assets stay inside PROJECT/assets, never through a symlink. `stem` is the output path without its extension.
const projectRoot = path => realpath(resolve(path)).catch(() => { throw new ImagesError('project_not_found'); });
async function target(project, relative) {
  project = await projectRoot(project);
  const parts = String(relative).split(/[\\/]+/);
  if (isAbsolute(relative) || parts.includes('..') || parts.length < 2 || parts[0] !== 'assets') throw new ImagesError('output_must_be_in_assets');
  if (extname(relative).toLowerCase() !== '.png') throw new ImagesError('output_must_be_png');
  const output = join(project, ...parts), stem = output.slice(0, -4);
  for (let p = dirname(output); p !== project; p = dirname(p)) if (await isLink(p)) throw new ImagesError('unsafe_output');
  for (const path of [stem + '.image.json', ...Object.values(kinds).map(k => stem + k.ext)]) if (await isLink(path)) throw new ImagesError('unsafe_output');
  await mkdir(dirname(output), { recursive: true });
  if (await realpath(dirname(output)) !== dirname(output)) throw new ImagesError('unsafe_output');
  return { project, stem };
}
function refusal({ http, code, message }) {
  const detail = [`HTTP ${http}`, code].filter(Boolean).join(' ') + (message ? `: ${message}` : '');
  return new ImagesError([401, 403].includes(http) || /api.?key/i.test(message ?? '') ? 'key_rejected' : http === 402 || code === 'failed_precondition' ? 'billing_required'
    : http === 404 ? 'model_unavailable' : http === 429 ? 'rate_limited' : 'api_refused', detail);
}
const metadata = job => ({ provider: 'gemini-api', api: job.api ?? 'interactions', requestId: job.id, generated: true, model: job.model, created: job.created,
  promptSha256: job.promptSha256, styleSha256: job.styleSha256, referenceSha256: job.referenceSha256, aspectRatio: job.aspectRatio, imageSize: job.imageSize,
  format: job.image.type, width: job.image.width, height: job.image.height, sha256: job.image.sha256 });

// Copies the privately held image into the deck, or confirms the copy already there. Never contacts the API.
async function publish(job, base, stem) {
  if (['submitted', 'uncertain'].includes(job.status)) throw new ImagesError('generation_uncertain');
  if (job.status === 'rejected') throw new ImagesError('no_image_returned');
  // Google chooses the encoding, so the saved file takes the extension of what actually came back.
  const output = stem + kinds[job.image.type].ext, sidecar = stem + '.image.json';
  try {
    if (job.status === 'generated') {
      const bytes = await readFile(base + '.image');
      if (sha(bytes) !== job.image.sha256) throw new ImagesError('receipt_changed');
      // Exclusive: artwork already at this path is never overwritten.
      try { await durable(output, bytes, 'wx'); }
      catch (e) { if (e.code !== 'EEXIST') throw e; if (sha(await readFile(output)) !== job.image.sha256) throw new ImagesError('output_exists'); }
      job.result = { status: 'downloaded', id: job.id, path: output, width: job.image.width, height: job.image.height, sha256: job.image.sha256, metadata: sidecar };
      job.status = 'downloaded';
      await saveJob(base + '.json', job); await rm(base + '.image', { force: true });
    } else if (!await exists(output) || sha(await readFile(output)) !== job.image.sha256) throw new ImagesError('downloaded_asset_changed');
    // A sidecar lost in a crash is rewritten from the receipt; a different one is left alone.
    const record = JSON.stringify(metadata(job), null, 2) + '\n';
    if (!await exists(sidecar)) await durable(sidecar, record, 'wx');
    else if (await readFile(sidecar, 'utf8') !== record) throw new ImagesError('metadata_exists');
    return job.result;
  } catch (e) { throw e instanceof ImagesError ? e : new ImagesError('download_failed'); }
}

async function apiImages(action, options, deps, state) {
  const key = apiKey(deps.env), model = options.model ?? defaultModel, summary = { provider: 'gemini-api', model, keyVariable: key?.name ?? null };
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(model)) throw new ImagesError('invalid_model');
  if (['status', 'setup'].includes(action)) return { status: key ? 'configured' : 'key_required', ...summary, liveChecked: false, paid: true, ...(key ? {} : { steps: keySteps }) };
  if (action === 'check') {
    if (!key) throw new ImagesError('key_required');
    const reply = await checkModel({ key: key.value, model, fetcher: deps.fetch });
    if (reply.outcome === 'refused') throw refusal(reply);
    if (reply.outcome !== 'ok') throw new ImagesError('network_unavailable');
    return { status: 'ready', ...summary, liveChecked: true, billingChecked: false, paid: true };
  }
  if (!['generate', 'download'].includes(action)) throw new ImagesError('unknown_action');
  if (!options.project || !options.id) throw new ImagesError('project_and_id_required');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(options.id)) throw new ImagesError('request_id_required');
  const jobBase = async project => join(await privateDirectory(join(state, 'api-jobs')), `${sha(project).slice(0, 16)}-${options.id}`);
  if (action === 'download') {
    const base = await jobBase(await projectRoot(options.project)), job = await readJob(base + '.json');
    if (!job) throw new ImagesError('unknown_request');
    return publish(job, base, (await target(job.project, job.output)).stem);
  }
  if (!options.promptFile || !options.output) throw new ImagesError('brief_and_output_required');
  const aspectRatio = options.aspect ?? '16:9', imageSize = options.size ?? '2K';
  if (!aspectRatios.includes(aspectRatio) || !imageSizes.includes(imageSize)) throw new ImagesError('unsupported_aspect_or_size');
  const api = options.api ?? 'interactions';
  if (!apis.includes(api)) throw new ImagesError('unsupported_api');
  const { project, stem } = await target(options.project, options.output), base = await jobBase(project);
  const brief = await block(resolve(options.promptFile), 64 * 1024, 'prompt');
  const stylePath = options.style ? resolve(options.style) : join(project, styleFile);
  const style = options.style || await exists(stylePath) ? await block(stylePath, 8 * 1024, 'style') : null;
  if ((options.references ?? []).length > 5) throw new ImagesError('too_many_references');
  const references = [];
  for (const path of options.references ?? []) {
    const bytes = await readFile(resolve(path)).catch(() => { throw new ImagesError('reference_unreadable'); }), info = await inspect(bytes);
    references.push({ bytes, mimeType: kinds[info.type].mime, sha256: info.sha256 });
  }
  // Inline images count against the API's 20 MB request limit after base64 grows them by a third.
  if (references.reduce((n, r) => n + r.bytes.length, 0) > 14 * 1024 * 1024) throw new ImagesError('references_too_large');
  // The default shape is left out of the request record, so receipts written before --api existed still match.
  const request = { project, output: options.output, model, ...(api === 'interactions' ? {} : { api }), aspectRatio, imageSize, promptSha256: sha(brief), styleSha256: style && sha(style), referenceSha256: references.map(r => r.sha256) };
  const fingerprint = sha(JSON.stringify(request));
  let job = await readJob(base + '.json');
  if (job) {
    if (job.fingerprint !== fingerprint) throw new ImagesError('request_id_conflict');
    return publish(job, base, stem);
  }
  if (!key) throw new ImagesError('key_required');
  for (const path of [stem + '.image.json', ...Object.values(kinds).map(k => stem + k.ext)]) if (await exists(path)) throw new ImagesError('output_exists');
  job = { id: options.id, fingerprint, ...request, created: new Date().toISOString().slice(0, 19) + 'Z', status: 'submitted' };
  // Reserve the ID on disk first. A second caller, or a rerun after a crash, finds it and does not send again.
  try { await durable(base + '.json', JSON.stringify(job), 'wx'); } catch (e) { throw e.code === 'EEXIST' ? new ImagesError('generation_uncertain') : e; }
  const reply = await generateImage({ key: key.value, model, text: style ? `${style}\n\n${brief}` : brief, references, aspectRatio, imageSize, api, fetcher: deps.fetch });
  if (['unsent', 'refused'].includes(reply.outcome)) {
    // Google's answer was a definite no, or the request never left: nothing was generated or charged, so the ID is free again.
    await rm(base + '.json');
    throw reply.outcome === 'refused' ? refusal(reply) : new ImagesError('network_unavailable');
  }
  if (reply.outcome === 'image') job.image = await inspect(reply.bytes).catch(() => null);
  if (!job.image) {
    job.status = reply.outcome === 'uncertain' ? 'uncertain' : 'rejected';
    await saveJob(base + '.json', job);
    throw new ImagesError(job.status === 'uncertain' ? 'generation_uncertain' : 'no_image_returned');
  }
  // Hold the paid image privately before touching the deck, so a failed save is recovered by `download`.
  await durable(base + '.image', reply.bytes);
  job.status = 'generated';
  await saveJob(base + '.json', job);
  return publish(job, base, stem);
}

export async function images(action, options = {}, deps = {}) {
  const provider = options.provider ?? 'gemini-api', state = resolve(options.state ?? defaultState());
  if (provider === 'gemini-api') return apiImages(action, options, deps, state);
  if (provider !== 'gemini-web') throw new ImagesError('unknown_provider');
  if (action === 'generate' && options.project && (options.style || options.aspect || options.size || options.api || await exists(join(resolve(options.project), styleFile)))) throw new ImagesError('requires_api_provider');
  const runtime = await runtimePath(state);
  const run = deps.run ?? runProcess;
  if (action === 'status' && !await exists(state)) return { status: 'setup_required', provider: 'gemini-web', liveChecked: false };
  await privateDirectory(state);
  if (action === 'setup') {
    const installed = await (deps.install ?? installImageRuntime)(state, deps);
    await run(join(installed, 'venv/bin/python'), ['-I', '-B', helper], { input: { action: 'runtime', state } });
    const cookies = await (deps.signIn ?? signIn)(state, installed, deps);
    return run(join(installed, 'venv/bin/python'), ['-I', '-B', helper], { input: { action: 'auth', state, cookies } });
  }
  if (!await exists(join(runtime, 'ready'))) return action === 'status'
    ? { status: 'setup_required', provider: 'gemini-web', liveChecked: false }
    : Promise.reject(new ImagesError('setup_required'));
  const payload = { action, state };
  if (['generate', 'download'].includes(action)) {
    if (!options.project || !options.id) throw new ImagesError('project_and_id_required');
    Object.assign(payload, { project: resolve(options.project), id: options.id });
  }
  if (action === 'generate') {
    if (!options.promptFile || !options.output) throw new ImagesError('brief_and_output_required');
    Object.assign(payload, { promptFile: resolve(options.promptFile), output: options.output,
      references: (options.references ?? []).map(p => resolve(p)), ...(options.model ? { model: options.model } : {}) });
  }
  return run(join(runtime, 'venv/bin/python'), ['-I', '-B', helper], { input: payload });
}
