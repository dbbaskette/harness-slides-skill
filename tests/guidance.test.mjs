import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, realpath, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { install } from '../scripts/install.mjs';
import { start, resume } from '../scripts/sync-guidance.mjs';
const exec = promisify(execFile), pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url))), skill = pkg.name === 'harness-slides' ? 'harness-slides' : 'harness-research';
async function fixture(t) {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'harness-guidance-'))); t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source'), runtime = join(dir, 'runtime'), project = join(dir, 'content');
  for (const path of [source, runtime, project, join(source, 'references'), join(source, 'guidance'), join(source, 'scripts'), join(runtime, 'scripts')]) await mkdir(path, { recursive: true });
  await writeFile(join(runtime, 'package.json'), JSON.stringify({ name: pkg.name, version: '0.2.0' }));
  await writeFile(join(runtime, 'package-lock.json'), '{}'); await writeFile(join(runtime, 'scripts/helper.mjs'), "throw new Error('Never execute fetched helpers');");
  await writeFile(join(source, 'SKILL.md'), `---\nname: ${skill}\n---\nFirst guidance\n`);
  await writeFile(join(source, 'references/design.md'), 'First reference');
  await writeFile(join(source, 'scripts/helper.mjs'), "throw new Error('Remote helper must not execute');");
  await writeFile(join(source, 'guidance/manifest.json'), JSON.stringify({ schema: 1, skill, entry: 'SKILL.md', minimumRuntime: '0.2.0' }));
  await exec('git', ['init', '-q', '--initial-branch=main', source]);
  const commit = async () => { await exec('git', ['-C', source, 'add', '.']); await exec('git', ['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture update']); return (await exec('git', ['-C', source, 'rev-parse', 'HEAD'])).stdout.trim(); };
  return { dir, source, runtime, project, commit, first: await commit() };
}
test('new work sees main advancement; resumed work retains guidance and installed runtime without network', async t => {
  const f = await fixture(t), first = await start(f);
  assert.equal(first.revision, f.first); assert.equal(first.runtime, f.runtime);
  const snapshot = join(first.guidance, '..');
  assert.deepEqual((await readdir(snapshot)).sort(), ['SKILL.md', 'pin.json', 'references']);
  await writeFile(join(f.source, 'SKILL.md'), `---\nname: ${skill}\n---\nSecond guidance\n`); const secondCommit = await f.commit();
  const second = await start(f); assert.equal(second.revision, secondCommit);
  await rm(f.source, { recursive: true });
  const continued = await resume({ ...f, task: first.task });
  assert.equal(continued.freshness, 'pinned'); assert.equal(continued.revision, f.first);
  assert.match(await readFile(continued.guidance, 'utf8'), /First guidance/);
  assert.equal((await resume({ ...f, task: first.task, cached: true })).freshness, 'cached-by-choice');
});
test('guidance and executable changes are detected when resuming saved work', async t => {
  const f = await fixture(t), pin = await start(f);
  await chmod(join(pin.guidance, '../references/design.md'), 0o600);
  await writeFile(join(pin.guidance, '../references/design.md'), 'Changed');
  await assert.rejects(resume({ ...f, task: pin.task }), /guidance changed/);
  const second = await start(f); await writeFile(join(f.runtime, 'scripts/helper.mjs'), 'Changed runtime');
  await assert.rejects(resume({ ...f, task: second.task }), /runtime changed/);
});
test('incompatible guidance does not create a task and releases the refresh lock', async t => {
  const f = await fixture(t);
  await writeFile(join(f.source, 'guidance/manifest.json'), JSON.stringify({ schema: 1, skill, entry: 'SKILL.md', minimumRuntime: '9.0.0' })); await f.commit();
  await assert.rejects(start(f), /newer installed runtime/);
  assert.deepEqual((await readdir(join(f.project, '.' + skill, 'guidance'))).sort(), ['repository.git']);
});
test('fetch failures preserve existing tasks and never claim current guidance', async t => {
  const f = await fixture(t), pin = await start(f);
  await assert.rejects(start({ ...f, source: join(f.dir, 'missing') }), /fetch failed/);
  assert.equal((await resume({ ...f, task: pin.task })).revision, f.first);
});
test('rejects symlink or executable guidance and unsafe caches', async t => {
  const f = await fixture(t);
  await symlink('../SKILL.md', join(f.source, 'references/link.md')); await f.commit();
  await assert.rejects(start(f), /regular non-executable/);
  await rm(join(f.source, 'references/link.md'));
  await chmod(join(f.source, 'references/design.md'), 0o755); await f.commit();
  await assert.rejects(start(f), /regular non-executable/);
  const cache = join(f.project, '.' + skill, 'guidance'); await rm(cache, { recursive: true });
  await symlink(f.runtime, cache); await assert.rejects(start(f), /Unsafe guidance directory/);
});
test('pins an approved ancestor explicitly and rejects other commits or malformed task IDs', async t => {
  const f = await fixture(t); await writeFile(join(f.source, 'references/design.md'), 'New'); await f.commit();
  const pin = await start({ ...f, revision: f.first }); assert.equal(pin.revision, f.first);
  await assert.rejects(start({ ...f, revision: 'a'.repeat(40) }), /fetch failed/);
  await assert.rejects(resume({ ...f, task: '../escape' }), /Invalid saved task/);
});
test('refresh lock refuses concurrent updates without deleting another owner’s lock', async t => {
  const f = await fixture(t), cache = join(f.project, '.' + skill, 'guidance'); await mkdir(cache, { recursive: true });
  await writeFile(join(cache, '.sync-lock'), 'owner'); await assert.rejects(start(f), /Another guidance refresh/);
  assert.equal(await readFile(join(cache, '.sync-lock'), 'utf8'), 'owner');
});

test('installed discovery entry is the small bootstrap while executable helpers stay local', async t => {
 const dir=await realpath(await mkdtemp(join(tmpdir(),'harness-bootstrap-install-')));t.after(()=>rm(dir,{recursive:true,force:true}));
 const result=await install({home:join(dir,'home'),shared:join(dir,'shared')});
 assert.equal(await readFile(join(result.runtime,'SKILL.md'),'utf8'),await readFile(new URL('../bootstrap/SKILL.md',import.meta.url),'utf8'));
 assert.notEqual(await readFile(join(result.runtime,'SKILL.md'),'utf8'),await readFile(new URL('../SKILL.md',import.meta.url),'utf8'));
 assert.match(await readFile(join(result.runtime,'scripts/sync-guidance.mjs'),'utf8'),/Refresh instructions only/);
});
