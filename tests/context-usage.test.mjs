import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { measureContext, renderReport, readingPath } from '../tools/context-usage.mjs';
const root = new URL('../', import.meta.url);

test('routed instruction links and sections resolve', async () => {
  const paths = ['SKILL.md', 'bootstrap/SKILL.md', ...(await readdir(new URL('references/', root))).filter(x => x.endsWith('.md')).map(x => 'references/' + x)];
  for (const path of paths) {
    const url = new URL(path, root), source = await readFile(url, 'utf8');
    for (const [, target] of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
      const [file, anchor] = target.split('#'), destination = new URL(file, url);
      await access(destination);
      if (anchor && destination.pathname.endsWith('.md')) {
        const text = await readFile(destination, 'utf8');
        const slugs = [...text.matchAll(/^#+ (.+)$/gm)].map(([, heading]) => heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-'));
        assert.ok(slugs.includes(anchor), `Missing section: ${path} -> ${target}`);
      }
    }
  }
});

test('reported paths count each input once and README reflects the tested instructions', async () => {
  const data = await measureContext(), readme = await readFile(new URL('README.md', root), 'utf8');
  assert.ok(readme.includes(renderReport(data)));
  for (const route of [...Object.values(data.readingPaths), ...Object.values(data.standalone)]) {
    assert.equal(new Set(route.files.map(x => x.path)).size, route.files.length);
    assert.equal(new Set(route.helpers.map(x => x.name)).size, route.helpers.length);
    assert.equal(route.total, [...route.files, ...route.helpers].reduce((n, x) => n + x.tokens, 0));
  }
  for (const [name, route] of Object.entries(data.readingPaths)) {
    assert.equal(route.files.some(x => x.path === 'references/images.md'), name === 'customImages');
    assert.equal(route.helpers.some(x => x.name === 'imageDownload'), name === 'customImages');
  }
  assert.equal(readingPath(['entry', 'entry'], { entry: 3 }).total, 3);
  assert.throws(() => readingPath(['missing'], {}), /Unknown instruction/);
  for (const name of ['newPptxNative', 'newGoogleNative']) assert.equal(data.readingPaths[name].helpers.some(x => x.name === 'sceneContract'), false);
  for (const name of ['newPptxScene', 'newGoogleScene']) assert.ok(data.readingPaths[name].helpers.some(x => x.name === 'sceneContract'));
  assert.equal(data.readingPaths.newPptxScene.files.some(x => /authoring-google|google-slides/.test(x.path)), false);
  assert.equal(data.readingPaths.newGoogleScene.files.some(x => x.path.includes('authoring-pptx')), false);
  assert.equal(data.readingPaths.scopedPptx.files.some(x => x.path.includes('templates')), false);
  assert.equal(data.readingPaths.scopedGoogle.files.some(x => x.path.includes('editing.md')), false);
});
