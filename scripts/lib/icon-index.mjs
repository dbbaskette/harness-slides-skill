import {readFile} from 'node:fs/promises';

// One lazy read per operation, including when an invalid library is reported for several slides.
export function iconIndexFor(brand) {
  let pending;
  return () => pending ??= loadIndex(brand);
}

async function loadIndex(brand) {
  const library = brand.design.slides.icon?.library;
  if (!library?.path || !library?.index || ![library.path, library.index].every(path => brand.sources.some(s => s.path === path))) {
    throw new Error('This composition uses icons, but the brand contract names no hashed icon library and index');
  }
  const index = JSON.parse(await readFile(library.index, 'utf8'));
  const entries = new Map();
  for (const entry of index.entries) {
    if (!entries.has(entry.id)) entries.set(entry.id, entry);
  }
  return {library, entries, indexSha256: brand.sources.find(s => s.path === library.index).sha256};
}

export function nativeIcon(index, id, icon) {
  const entry = index.entries.get(icon);
  if (!entry) throw new Error(`${id}: unknown icon ${icon}; search the brand icon library for a current ID`);
  if (!entry.native || !(entry.bounds?.[2] > 0) || !(entry.bounds?.[3] > 0)) {
    throw new Error(`${id}: icon ${icon} is a picture, not native geometry; choose another`);
  }
  if (Array.isArray(entry.shapeIds) && entry.shapeIds.length < 2) {
    throw new Error(`${id}: icon ${icon} has no drawing in the library index, only its disc; choose another`);
  }
  return entry;
}
