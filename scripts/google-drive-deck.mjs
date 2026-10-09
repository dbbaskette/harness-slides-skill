#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const pptxType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const slidesType = 'application/vnd.google-apps.presentation';
const idPattern = /^[A-Za-z0-9_-]+$/;

export async function gcloudToken(run = exec) {
  const { stdout } = await run('gcloud', ['auth', 'print-access-token'], { timeout: 30_000 });
  const token = stdout.trim();
  if (!token) throw new Error('gcloud returned no access token. Run gcloud auth login --enable-gdrive-access --force.');
  return token;
}

export async function request(url, options, { tokenProvider = gcloudToken, fetcher = fetch } = {}) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || !['www.googleapis.com','slides.googleapis.com'].includes(endpoint.hostname)) throw new Error('OAuth requests must target a known Google API host');
  const token = await tokenProvider();
  if (!token) throw new Error('No gcloud access token is available. Run gcloud auth login --enable-gdrive-access --force.');
  const response = await fetcher(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    let error;
    try { error = (await response.json()).error; } catch { /* Non-JSON failures use the generic diagnostic. */ }
    const reasons = new Set([...(error?.errors ?? []).map(x=>x.reason), ...(error?.details ?? []).map(x=>x.reason)]);
    // Classify known reasons without echoing arbitrary provider text or private URLs.
    const guidance = reasons.has('exportSizeLimitExceeded')
      ? 'File exceeds the Drive export size limit. Use the documented Drive files.download operation or download from the authorized browser.'
      : reasons.has('SERVICE_DISABLED') || reasons.has('API_DISABLED') || reasons.has('CONSUMER_INVALID')
        ? 'The API is unavailable to this OAuth client or quota project. Drive access does not prove native Slides API access. Use an authorized connector/browser or the Drive/PPTX path; repeating login will not enable the API.'
        : 'Check account, Drive scopes, file access, and organization policy.';
    throw new Error(`Google API request failed (HTTP ${response.status}). ${guidance}`);
  }
  return response;
}

function validId(id, label) {
  if (!idPattern.test(id ?? '')) throw new Error(`${label} must be a Google Drive ID.`);
  return id;
}

function isZip(bytes) {
  return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

export async function checkDriveAccess(deps = {}) {
  const url = new URL('https://www.googleapis.com/drive/v3/about');
  url.searchParams.set('fields', 'user(emailAddress,displayName),importFormats');
  const response = await request(url, {}, deps);
  const about = await response.json();
  if (!about.user?.emailAddress) throw new Error('Drive did not return an account. Access is unverified.');
  return {
    account: about.user.emailAddress,
    pptxImportAdvertised: about.importFormats?.[pptxType]?.includes(slidesType) ?? false,
  };
}

// Read-only probes; an advertised permission is not a successful edit test.
export async function probeGooglePresentation(fileId, deps = {}) {
  validId(fileId, 'Presentation ID');
  const checks = [];
  const probe = async (name, url, inspect) => {
    try {
      const data = await (await request(url, {}, deps)).json();
      checks.push({ name, status: 'available', detail: inspect(data) });
      return data;
    } catch {
      checks.push({ name, status: 'unverified', next: 'Check account, file access, API scopes, and organization policy in the intended authoring tool.' });
      return null;
    }
  };
  await probe('google-file', `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true&fields=id,mimeType,capabilities(canEdit)`, data => {
    if (data.mimeType !== slidesType) throw new Error('Not native Slides');
    return data.capabilities?.canEdit ? 'Native Slides; edit permission advertised, editing untested.' : 'Native Slides; edit permission unconfirmed.';
  });
  const deck = await probe('google-objects', `https://slides.googleapis.com/v1/presentations/${fileId}?fields=presentationId,slides(objectId)`, data => {
    if (!Array.isArray(data.slides)) throw new Error('No inventory');
    return `${data.slides.length} native slides read.`;
  });
  const page = deck?.slides[0]?.objectId;
  if (page && /^[A-Za-z0-9_-]+$/.test(page)) {
    await probe('google-preview', `https://slides.googleapis.com/v1/presentations/${fileId}/pages/${page}/thumbnail`, data => {
      if (!data.contentUrl) throw new Error('No preview');
      return 'Preview endpoint responded. The agent must open the image to verify visibility.';
    });
  } else checks.push({ name: 'google-preview', status: 'unverified', next: 'Obtain a viewable slide preview through the authoring tool.' });
  return checks;
}

export async function exportDeck({ fileId, output }, deps = {}) {
  validId(fileId, 'Presentation ID');
  if (!output?.toLowerCase().endsWith('.pptx')) throw new Error('Output must be a .pptx path.');
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/export`);
  url.searchParams.set('mimeType', pptxType);
  const response = await request(url, {}, deps);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isZip(bytes)) throw new Error('Drive did not return a PPTX ZIP; no output was saved.');
  await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
  return { output: resolve(output), bytes: bytes.length };
}

export function multipartPptx(bytes, metadata, boundary = `harness-${randomUUID()}`) {
  const before = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${pptxType}\r\n\r\n`,
  );
  const after = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([before, bytes, after]), contentType: `multipart/related; boundary=${boundary}` };
}

export async function importDeck({ file, name, folderId }, deps = {}) {
  if (!file?.toLowerCase().endsWith('.pptx')) throw new Error('Input must be a .pptx path.');
  if (folderId) validId(folderId, 'Folder ID');
  const bytes = await readFile(file);
  if (!isZip(bytes)) throw new Error('Input is not a PPTX ZIP.');
  const title = name ?? basename(file).replace(/\.pptx$/i, '');
  if (!title.trim()) throw new Error('Presentation name must not be empty.');
  const metadata = { name: title, mimeType: slidesType, ...(folderId ? { parents: [folderId] } : {}) };
  const { body, contentType } = multipartPptx(bytes, metadata);
  const url = new URL('https://www.googleapis.com/upload/drive/v3/files');
  url.searchParams.set('uploadType', 'multipart');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,name,mimeType,webViewLink');
  let response;
  try {
    response = await request(url, { method: 'POST', headers: { 'Content-Type': contentType }, body }, deps);
  } catch (error) {
    throw new Error(`${error.message} Inspect Drive before retrying; an uncertain upload can create a duplicate.`, { cause: error });
  }
  let created;
  try { created = await response.json(); }
  catch { throw new Error('Drive returned an unreadable upload response. Inspect Drive before retrying.'); }
  if (!created.id || created.mimeType !== slidesType) throw new Error('Upload response did not confirm a native Google Slides file. Inspect Drive before retrying.');
  return { id: created.id, name: created.name ?? title, url: created.webViewLink ?? `https://docs.google.com/presentation/d/${created.id}/edit` };
}

// Replace an existing native deck's content in place, so repeated previews reuse one Drive file.
export async function updateDeck({ fileId, file }, deps = {}) {
  validId(fileId, 'Presentation ID');
  if (!file?.toLowerCase().endsWith('.pptx')) throw new Error('Input must be a .pptx path.');
  const bytes = await readFile(file);
  if (!isZip(bytes)) throw new Error('Input is not a PPTX ZIP.');
  const url = new URL(`https://www.googleapis.com/upload/drive/v3/files/${fileId}`);
  url.searchParams.set('uploadType', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('fields', 'id,name,mimeType,webViewLink');
  const response = await request(url, { method: 'PATCH', headers: { 'Content-Type': pptxType }, body: bytes }, deps);
  const updated = await response.json();
  if (updated.id !== fileId || updated.mimeType !== slidesType) throw new Error('Drive did not confirm the native Google Slides file was updated. Inspect Drive before retrying.');
  return { id: updated.id, name: updated.name, url: updated.webViewLink ?? `https://docs.google.com/presentation/d/${updated.id}/edit` };
}

// Google's own render of a native deck, as PDF.
export async function exportPdf({ fileId, output }, deps = {}) {
  validId(fileId, 'Presentation ID');
  if (!output?.toLowerCase().endsWith('.pdf')) throw new Error('Output must be a .pdf path.');
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}/export`);
  url.searchParams.set('mimeType', 'application/pdf');
  const bytes = Buffer.from(await (await request(url, {}, deps)).arrayBuffer());
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Drive did not return a PDF; no output was saved.');
  await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
  return { output: resolve(output), bytes: bytes.length };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { 'file-id': { type: 'string' }, output: { type: 'string' }, file: { type: 'string' }, name: { type: 'string' }, 'folder-id': { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    allowPositionals: true,
  });
  const [action, ...extra] = positionals;
  if (values.help || !action) {
    console.log('Usage: harness-slides drive check | export --file-id ID --output deck.pptx | import --file deck.pptx [--name TITLE] [--folder-id ID]');
    return;
  }
  if (extra.length) throw new Error('Expected one Drive action.');
  const allowed = action === 'check' ? [] : action === 'export' ? ['file-id', 'output'] : action === 'import' ? ['file', 'name', 'folder-id'] : null;
  if (!allowed) throw new Error('Drive action must be check, export, or import.');
  for (const key of Object.keys(values)) if (key !== 'help' && !allowed.includes(key)) throw new Error(`--${key} is not valid for drive ${action}.`);
  let result;
  if (action === 'check') result = await checkDriveAccess();
  else if (action === 'export') result = await exportDeck({ fileId: values['file-id'], output: values.output });
  else result = await importDeck({ file: values.file, name: values.name, folderId: values['folder-id'] });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
