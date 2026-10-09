import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink, realpath, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
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
  assert.equal(first.runtimeVersion,'0.2.0');assert.match(first.runtimeDigest,/^[a-f0-9]{64}$/);assert.equal(first.revision, f.first); assert.equal(first.runtime, f.runtime);
  const snapshot = join(first.guidance, '..');
  assert.deepEqual((await readdir(snapshot)).sort(), ['SKILL.md', 'pin.json', 'references']);
  await writeFile(join(f.source, 'SKILL.md'), `---\nname: ${skill}\n---\nSecond guidance\n`); const secondCommit = await f.commit();
  const second = await start(f); assert.equal(second.revision, secondCommit);
  await rm(f.source, { recursive: true });
  const continued = await resume({ ...f, task: first.task });
  assert.equal(continued.runtimeVersion,'0.2.0');assert.equal(continued.runtimeDigest,first.runtimeDigest);assert.equal(continued.freshness, 'pinned'); assert.equal(continued.revision, f.first);
  assert.match(await readFile(continued.guidance, 'utf8'), /First guidance/);
  const cached=await resume({ ...f, task: first.task, cached: true });assert.equal(cached.freshness, 'cached-by-choice');assert.equal(cached.runtimeVersion,'0.2.0');
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
  await assert.rejects(start(f), /requires 9\.0\.0 or newer; installed 0\.2\.0/);
  assert.deepEqual((await readdir(join(f.project, '.' + skill, 'guidance'))).sort(), ['repository.git']);
});
const guide = (f, text) => writeFile(join(f.source, 'SKILL.md'), `---\nname: ${skill}\n---\n${text} guidance\n`);
const needs = (f, minimumRuntime) => writeFile(join(f.source, 'guidance/manifest.json'), JSON.stringify({ schema: 1, skill, entry: 'SKILL.md', minimumRuntime }));
const index = (f, lastCompatible, extra = {}) => writeFile(join(f.source, 'guidance/compatibility.json'), JSON.stringify({ schema: 1, skill, lastCompatible, ...extra }));
const installed = (f, version) => writeFile(join(f.runtime, 'package.json'), JSON.stringify({ name: pkg.name, version }));
const cached = f => readdir(join(f.project, '.' + skill, 'guidance')), tasks = async f => (await readdir(join(f.project, '.' + skill, 'guidance/tasks'))).length;
const shallow = async f => (await exec('git', ['--git-dir=' + join(f.project, '.' + skill, 'guidance/repository.git'), 'rev-parse', '--is-shallow-repository'])).stdout.trim();
test('a runtime one minimum behind gets the last compatible guidance and is told an update exists', async t => {
  const f = await fixture(t); await guide(f, 'Second'); const last = await f.commit();
  await guide(f, 'Third'); await needs(f, '0.3.0'); await index(f, { '0.2.0': last }); await f.commit();
  const older = await start(f);
  assert.equal(older.revision, last); assert.equal(older.freshness, 'last-compatible'); assert.equal(older.runtimeVersion, '0.2.0'); assert.equal(older.currentMinimumRuntime, '0.3.0');
  assert.match(older.notice, /older guidance/i); assert.match(older.notice, /installed runtime is 0\.2\.0/); assert.match(older.notice, /needs 0\.3\.0 or newer/);
  assert.match(await readFile(older.guidance, 'utf8'), /Second guidance/);
  assert.deepEqual((await readdir(join(older.guidance, '..'))).sort(), ['SKILL.md', 'pin.json', 'references']);
  assert.equal((await resume({ ...f, task: older.task })).revision, last);
  assert.equal((await start(f)).revision, last);
  await installed(f, '0.3.0'); const current = await start(f);
  assert.equal(current.freshness, 'current-at-start'); assert.match(await readFile(current.guidance, 'utf8'), /Third guidance/);
});
test('a runtime that satisfies current guidance is unaffected by the compatibility index', async t => {
  const f = await fixture(t); await guide(f, 'Second'); await index(f, { '0.1.0': f.first }); const head = await f.commit();
  const result = await start(f);
  assert.equal(result.revision, head); assert.equal(result.freshness, 'current-at-start');
  assert.deepEqual(Object.keys(result).sort(), ['freshness', 'guidance', 'revision', 'runtime', 'runtimeDigest', 'runtimeVersion', 'task']);
  assert.deepEqual((await readdir(join(result.guidance, '..'))).sort(), ['SKILL.md', 'pin.json', 'references']);
  assert.equal(await shallow(f), 'true');
});
test('the newest entry the installed runtime satisfies is used; with none, the task is refused', async t => {
  const f = await fixture(t); await guide(f, 'Second'); await needs(f, '0.3.0'); const second = await f.commit();
  await guide(f, 'Third'); await needs(f, '0.10.0'); const third = await f.commit();
  await guide(f, 'Fourth'); await needs(f, '0.11.0'); await index(f, { '0.10.0': third, '0.2.0': f.first, '0.3.0': second }); await f.commit();
  for (const [version, revision] of [['0.2.0', f.first], ['0.2.9', f.first], ['0.3.0', second], ['0.9.9', second], ['0.10.0', third], ['0.10.4', third]]) {
    await installed(f, version); const result = await start(f);
    assert.equal(result.revision, revision); assert.equal(result.currentMinimumRuntime, '0.11.0'); assert.match(result.notice, new RegExp(`installed runtime is ${version.replaceAll('.', '\\.')} `));
  }
  await installed(f, '0.1.9'); const before = await tasks(f);
  await assert.rejects(start(f), error => /requires 0\.11\.0 or newer; installed 0\.1\.9/.test(error.message) && !/index/.test(error.message));
  assert.equal(await tasks(f), before);
});
test('a pinned revision is never swapped for older guidance', async t => {
  const f = await fixture(t); await guide(f, 'Second'); await needs(f, '0.3.0'); await index(f, { '0.2.0': f.first }); const head = await f.commit();
  await assert.rejects(start({ ...f, revision: head }), error => /requires 0\.3\.0 or newer; installed 0\.2\.0/.test(error.message) && !/index/.test(error.message));
  const pin = await start({ ...f, revision: f.first });
  assert.equal(pin.revision, f.first); assert.equal(pin.freshness, 'current-at-start'); assert.equal('notice' in pin, false);
});
test('a malformed compatibility index refuses rather than guessing', async t => {
  const f = await fixture(t), path = join(f.source, 'guidance/compatibility.json'); await guide(f, 'Second'); await needs(f, '0.3.0');
  const refused = /requires 0\.3\.0 or newer; installed 0\.2\.0.*compatibility index is invalid/;
  for (const raw of ['not json', 'null', '[]', JSON.stringify({ schema: 1, skill }), JSON.stringify({ schema: 2, skill, lastCompatible: { '0.2.0': f.first } }), JSON.stringify({ schema: 1, skill: 'another-skill', lastCompatible: { '0.2.0': f.first } }), JSON.stringify({ schema: 1, skill, lastCompatible: [f.first] })]) {
    await writeFile(path, raw); await f.commit(); await assert.rejects(start(f), refused, raw);
  }
  for (const [minimum, revision] of [['0.2.0', f.first.slice(0, 12)], ['0.2.0', f.first.toUpperCase()], ['0.2.0', 'main'], ['0.2.0', 'refs/heads/main'], ['0.2.0', '--upload-pack=sh'], ['0.2.0', f.first + '^'], ['0.2.0', [f.first]], ['0.2.0', null], ['v0.2.0', f.first], ['0.2', f.first], ['00.2.0', f.first], ['0.2.0-rc.1', f.first]]) {
    await index(f, { '0.1.0': f.first, [minimum]: revision }); await f.commit(); await assert.rejects(start(f), refused, JSON.stringify([minimum, revision]));
  }
  await index(f, { '0.2.0': f.first }); await chmod(path, 0o755); await f.commit(); await assert.rejects(start(f), refused);
  await rm(path); await symlink('manifest.json', path); await f.commit(); await assert.rejects(start(f), refused);
  assert.deepEqual(await cached(f), ['repository.git']); assert.equal(await shallow(f), 'true');
});
test('the compatibility index cannot select guidance outside the trusted main history', async t => {
  const f = await fixture(t), other = await fixture(t), refused = /requires 0\.3\.0 or newer; installed 0\.2\.0.*compatibility index is invalid/;
  await guide(other, 'Foreign'); const foreign = await other.commit();
  await exec('git', ['-C', f.source, 'checkout', '-q', '-b', 'unmerged']); await guide(f, 'Unmerged'); const unmerged = await f.commit();
  await exec('git', ['-C', f.source, 'checkout', '-q', 'main']); await guide(f, 'Withdrawn'); const withdrawn = await f.commit();
  assert.equal((await start(f)).revision, withdrawn); await exec('git', ['-C', f.source, 'reset', '-q', '--hard', f.first]);
  await guide(f, 'Second'); await needs(f, '0.3.0'); const tooNew = await f.commit(), before = await tasks(f);
  // None of the first four is on main: never merged, another repository's, unknown, and one this cache still
  // holds from before main was rewritten. The last is on main but needs a newer runtime.
  for (const [revision, extra] of [[unmerged], [foreign, { repository: other.source, source: other.source }], ['a'.repeat(40)], [withdrawn], [tooNew]]) {
    await guide(f, 'Latest ' + revision); await index(f, { '0.2.0': revision }, extra); await f.commit();
    await assert.rejects(start(f), refused, revision);
  }
  assert.equal(await tasks(f), before);
  await index(f, { '0.2.0': f.first }); await f.commit(); assert.equal((await start(f)).revision, f.first);
});
test('the published compatibility index names commits in this history that needed each earlier minimum', async () => {
  const read = async name => JSON.parse(await readFile(new URL('../guidance/' + name, import.meta.url))), published = await read('compatibility.json'), current = (await read('manifest.json')).minimumRuntime;
  assert.equal(published.schema, 1); assert.equal(published.skill, skill); assert.ok(Object.keys(published.lastCompatible).length);
  for (const [minimum, revision] of Object.entries(published.lastCompatible)) {
    assert.match(minimum, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/); assert.match(revision, /^[a-f0-9]{40}$/);
    assert.ok(minimum.localeCompare(current, 'en', { numeric: true }) < 0, `${minimum} is still the current minimum, so its last commit is not known yet`);
    // Checked where this checkout has the history; a release ZIP or shallow clone does not.
    const repository = fileURLToPath(new URL('../', import.meta.url)), then = await exec('git', ['-C', repository, 'show', `${revision}:guidance/manifest.json`]).catch(() => null);
    if (!then) continue;
    assert.equal(JSON.parse(then.stdout).minimumRuntime, minimum); await exec('git', ['-C', repository, 'merge-base', '--is-ancestor', revision, 'HEAD']);
  }
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
 assert.equal(result.runtimeVersion,pkg.version);
 const installed=JSON.parse((await exec(process.execPath,[join(result.runtime,'scripts/harness-slides.mjs'),'version'])).stdout);assert.equal(installed.runtimeVersion,pkg.version);assert.equal(installed.runtime,result.runtime);
 assert.equal((await exec(process.execPath,[join(dir,'home/.agents/skills/harness-slides/scripts/harness-slides.mjs'),'--version'])).stdout.trim(),'Harness Slides '+pkg.version);
 assert.equal(await readFile(join(result.runtime,'SKILL.md'),'utf8'),await readFile(new URL('../bootstrap/SKILL.md',import.meta.url),'utf8'));
 assert.notEqual(await readFile(join(result.runtime,'SKILL.md'),'utf8'),await readFile(new URL('../SKILL.md',import.meta.url),'utf8'));
 assert.match(await readFile(join(result.runtime,'scripts/sync-guidance.mjs'),'utf8'),/Refresh instructions only/);
});

test('resuming through a newer installation reports the saved executable version, not the new pointer',async t=>{const f=await fixture(t),pin=await start(f),newRuntime=join(f.dir,'new runtime'),current=join(f.dir,'current');await mkdir(join(newRuntime,'scripts'),{recursive:true});await writeFile(join(newRuntime,'package.json'),JSON.stringify({name:pkg.name,version:'0.3.0'}));await writeFile(join(newRuntime,'package-lock.json'),'{}');await writeFile(join(newRuntime,'scripts/helper.mjs'),'New installed helper');await symlink(newRuntime,current);const continued=await resume({project:f.project,task:pin.task,runtime:current});assert.equal(continued.runtime,f.runtime);assert.equal(continued.runtimeVersion,'0.2.0');assert.equal(continued.runtimeDigest,pin.runtimeDigest);});
