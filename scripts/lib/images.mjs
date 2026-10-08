import { spawn } from 'node:child_process';
import { access, readFile, mkdir, mkdtemp, rename, rm, lstat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const helper = fileURLToPath(new URL('../images/worker.py', import.meta.url));
const requirements = fileURLToPath(new URL('../images/requirements.txt', import.meta.url));
export const defaultState = () => join(homedir(), '.harness-slides-images');
const messages = {
  setup_required: 'Ask Harness Slides to setup images, then sign in to Google in its Chrome window.',
  auth_required: 'The Gemini session needs sign-in. Run setup images again.',
  busy: 'Another Slides image operation is running. Wait for it to finish.',
  generation_uncertain: 'Gemini may have received this request. It will not be resent. Check Gemini history before explicitly requesting a new image with a new ID.',
  download_failed: 'Generation is saved. Retry images download with the same project and ID; do not generate again.',
  expected_one_generated_image: 'Gemini did not return exactly one generated image. Web search images are rejected. Revise the brief and explicitly request a new image with a new ID.',
  python_311_required: 'Image setup needs Python 3.11 or newer. Ask the agent to prepare it and retry setup.',
  runtime_version_mismatch: 'The optional image runtime differs from the audited version. Run setup images from an updated trusted installation.',
  request_id_conflict: 'This ID already belongs to a different image request. Reuse its original brief or explicitly choose a new ID.',
  request_account_changed: 'This image belongs to a previous sign-in. Its download cannot be retried with a different saved session.',
};
export class ImagesError extends Error {
  constructor(code) { super(messages[code] ?? `Image operation failed (${code}).`); this.code = code; }
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
    await run(join(temp, 'venv/bin/python'), ['-I', '-c', 'import gemini_webapi, PIL, curl_cffi']);
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
  process.stderr.write('Sign in to Google in the Slides Chrome window, then close that window to save the session.\n');
  // Manual sign-in without automation flags; ordinary generation never opens Chrome.
  await run(chrome, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-mode', '--password-store=basic', '--use-mock-keychain', 'https://gemini.google.com/app']);
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

export async function images(action, options = {}, deps = {}) {
  const state = resolve(options.state ?? defaultState());
  const runtime = await runtimePath(state);
  const run = deps.run ?? runProcess;
  if (action === 'status' && !await exists(state)) return { status: 'setup_required', provider: 'gemini-web', liveChecked: false };
  await privateDirectory(state);
  if (action === 'setup') {
    const installed = await (deps.install ?? installImageRuntime)(state, deps);
    await run(join(installed, 'venv/bin/python'), ['-I', helper], { input: { action: 'runtime', state } });
    const cookies = await (deps.signIn ?? signIn)(state, installed, deps);
    return run(join(installed, 'venv/bin/python'), ['-I', helper], { input: { action: 'auth', state, cookies } });
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
  return run(join(runtime, 'venv/bin/python'), ['-I', helper], { input: payload });
}
