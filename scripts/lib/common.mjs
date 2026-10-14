import { createHash } from 'node:crypto';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const digest = value => hash(JSON.stringify(value));
// The same content gives the same digest whatever order its object keys were written in, for values that callers
// write or re-serialise (Python's sort_keys, an agent). Array order still counts.
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' && typeof value.toJSON !== 'function' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalDigest = value => digest(canonical(value));
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
// Paths a record keeps. Inside a project, a record names a file relative to its own folder, with '/', so the project can move,
// or be committed and opened elsewhere, and the record names no home folder. A path outside the project, or a record kept
// outside it, stays absolute: a relative path to a place that does not move with the project breaks whichever side moves.
const within=(root,path)=>{const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${sep}`);};
export function recordedPath(base,target,project){
  base=resolve(base);target=resolve(target);
  if(!project||!within(resolve(project),base)||!within(resolve(project),target))return target;
  return relative(base,target).split(sep).join('/')||'.';
}
// The file a record names, resolved against the record's folder. An absolute path, as earlier records kept, is returned as it is.
export const recordedLocation=(base,path)=>typeof path==='string'?resolve(base,path):path;
