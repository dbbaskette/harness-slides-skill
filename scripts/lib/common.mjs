import { createHash } from 'node:crypto';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const digest = value => hash(JSON.stringify(value));
export const json = async file => JSON.parse(await readFile(file, 'utf8'));
export const saveJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function inside(root, file) {
  const path = resolve(root, file), rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path must stay inside the workspace');
  return path;
}
export async function regularInside(root, file) {
  const path = inside(root, file), stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular workspace file');
  const actual = await realpath(path), base = await realpath(root);
  inside(base, actual);
  return path;
}
