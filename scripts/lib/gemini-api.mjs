// Gemini API transport for images: one Interactions request per image, the key in a header.
// Written from Google's published request shape (ai.google.dev, read October 9, 2026) and
// exercised only against stubs. No live request has confirmed the model name or this shape.
export const endpoint = 'https://generativelanguage.googleapis.com/v1beta';
export const defaultModel = 'gemini-nano-banana-2.1';
export const aspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'];
export const imageSizes = ['1K', '2K', '4K'];
const neverConnected = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'];

// GOOGLE_API_KEY wins when both are set, as in Google's own libraries.
export function apiKey(env = process.env) {
  for (const name of ['GOOGLE_API_KEY', 'GEMINI_API_KEY']) if (env[name]?.trim()) return { name, value: env[name].trim() };
  return null;
}

// Outcomes, never exceptions: 'ok', 'refused' (an HTTP error: nothing generated or charged),
// 'unsent' (no connection was made) and 'uncertain' (Google may have received the request).
async function call(path, { key, body, timeout, fetcher = fetch }) {
  let response;
  try {
    // The key travels only in this header. Redirects are refused so it cannot follow one elsewhere.
    response = await fetcher(endpoint + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { 'x-goog-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch (e) {
    const causes = [e?.cause, ...(e?.cause?.errors ?? [])].map(c => c?.code).filter(Boolean);
    return { outcome: causes.length && causes.every(c => neverConnected.includes(c)) ? 'unsent' : 'uncertain' };
  }
  let data = null;
  try { data = await response.json(); } catch {}
  if (response.ok) return data ? { outcome: 'ok', data } : { outcome: 'uncertain' };
  // Interactions errors carry a snake_case code; older endpoints a numeric code and a status word.
  const error = data?.error ?? {}, code = [error.code, error.status].find(c => typeof c === 'string' && /^[A-Za-z_]{1,40}$/.test(c));
  const message = typeof error.message === 'string' ? error.message.replace(/[\x00-\x1f\x7f]+/g, ' ').split(key).join('[key]').slice(0, 300) : undefined;
  return { outcome: 'refused', http: response.status, code, message };
}

// The cheapest authenticated request: unbilled model metadata. It confirms the key and the model name, not billing.
export const checkModel = ({ key, model, fetcher }) => call('/models/' + model, { key, timeout: 30000, fetcher });

export async function generateImage({ key, model, text, references = [], aspectRatio, imageSize, fetcher }) {
  const result = await call('/interactions', { key, timeout: 300000, fetcher, body: { model,
    input: [{ type: 'text', text }, ...references.map(r => ({ type: 'image', mime_type: r.mimeType, data: r.bytes.toString('base64') }))],
    response_format: { type: 'image', aspect_ratio: aspectRatio, image_size: imageSize } } });
  if (result.outcome !== 'ok') return result;
  // Thought steps can carry draft images. Only model output counts, and its last image is the final one.
  const images = (result.data.steps ?? []).filter(s => s?.type === 'model_output').flatMap(s => s.content ?? []).filter(c => c?.type === 'image' && typeof c.data === 'string');
  return images.length ? { outcome: 'image', bytes: Buffer.from(images.at(-1).data, 'base64') } : { outcome: 'no_image' };
}
