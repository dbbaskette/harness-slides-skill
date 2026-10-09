import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Tiktoken } from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/cl100k_base';
const root = new URL('../', import.meta.url), exec = promisify(execFile);
export function readingPath(paths, files, helpers = {}, samples = []) {
  const selected = [...new Set(paths)].map(path => {
    if (!Object.hasOwn(files, path)) throw new Error(`Unknown instruction file: ${path}`);
    return { path, tokens: files[path] };
  });
  const results = [...new Set(samples)].map(name => {
    if (!Object.hasOwn(helpers, name)) throw new Error(`Unknown helper sample: ${name}`);
    return { name, tokens: helpers[name] };
  });
  return { files: selected, helpers: results, total: [...selected, ...results].reduce((n, x) => n + x.tokens, 0) };
}
export async function measureContext() {
  const encoder = new Tiktoken(ranks), count = source => encoder.encode(source).length;
  const refs = (await readdir(new URL('references/', root))).filter(name => name.endsWith('.md')).sort().map(name => 'references/' + name);
  const paths = ['bootstrap/SKILL.md', 'SKILL.md', ...refs, ...[]];
  const contents = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(new URL(path, root), 'utf8')])));
  const files = Object.fromEntries(paths.map(path => [path, count(contents[path])]));
  // Representative start response shape, normalized paths; no fetch or account access.
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const guidanceResult = JSON.stringify({ freshness: 'current-at-start', revision: createHash('sha256').update('sample guidance revision').digest('hex').slice(0, 40), task: createHash('sha256').update('sample guidance task').digest('hex').slice(0, 32), guidance: '<guidance>/SKILL.md', runtime: '<runtime>', runtimeVersion:pkg.version, runtimeDigest:createHash('sha256').update('sample runtime identity').digest('hex') }, null, 2) + '\n';
  const outputs = { guidanceStart: guidanceResult };
  outputs.sceneContract = (await exec(process.execPath, [fileURLToPath(new URL('scripts/harness-slides.mjs', root)), 'scene', 'contract'], { timeout: 30000 })).stdout;
  outputs.outlineContract = (await exec(process.execPath, [fileURLToPath(new URL('scripts/harness-slides.mjs', root)), 'outline', 'contract'], {timeout:30000})).stdout;
  outputs.composeContract = (await exec(process.execPath, [fileURLToPath(new URL('scripts/harness-slides.mjs', root)), 'compose', 'contract'], {timeout:30000})).stdout;
  outputs.comparisonContract = (await exec(process.execPath, [fileURLToPath(new URL('scripts/harness-slides.mjs', root)), 'deck', 'contract','--id','comparison'], {timeout:30000})).stdout;
  outputs.imageDownload = JSON.stringify({status:'downloaded',id:'deck-slide-04-v1',path:'<project>/assets/slide-04.png',width:1536,height:1024,sha256:createHash('sha256').update('sample image bytes').digest('hex'),metadata:'<project>/assets/slide-04.image.json'}) + '\n';
  const samples = Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, count(value)]));
  const path = (paths, helpers = []) => readingPath(paths, files, samples, helpers);
  const entry = ['SKILL.md'];
  const creative = [...entry, 'references/design.md', 'references/design-walkthrough.md'];
  const design = [...creative, 'references/authoring.md', 'references/design-records.md'];
  const review = 'references/review.md', google = 'references/google-slides.md';
  const readingPaths = {
    scopedPptx: path([...entry, 'references/editing.md', review]),
    scopedGoogle: path([...entry, google, review]),
    newPptxNative: path([...design, 'references/templates.md', 'references/native-critique.md', review]),
    newGoogleNative: path([...design, 'references/templates.md', google, 'references/native-critique.md', review]),
    newPptxScene: path([...design, 'references/authoring-pptx.md', review], ['sceneContract']),
    newGoogleScene: path([...design, 'references/authoring-google.md', google, review], ['sceneContract']),
    composedDeck: path([...creative,'references/draft.md','references/compositions.md'],['outlineContract','composeContract']),
    draftOnly: path([...creative,'references/draft.md'],['outlineContract']),
    parallelLead: path([...creative,'references/compositions.md','references/parallel-build.md'],['composeContract']),
    parallelWorker: path(['references/design.md','references/compositions.md','references/parallel-build.md'],['composeContract']),
    contentLedPptx: path([...design,'references/content-components.md','references/brand-addons.md','references/quality.md',review],['comparisonContract']),
    contentCritique: path([...entry,'references/quality.md',review]),
    intake: path([...entry, 'references/intake.md']),
    customImages: path([...entry, 'references/images.md'], ['imageDownload']),
  };
  const standalone = Object.fromEntries(Object.entries(readingPaths).map(([name, route]) => [name, path(['bootstrap/SKILL.md', ...route.files.map(x => x.path)], ['guidanceStart', ...route.helpers.map(x => x.name)])]));
  const description = contents['SKILL.md'].match(/^name:.*\n.*description:.*$/m)?.[0];
  if (!description) throw new Error('Missing skill metadata');
  const activation = files['bootstrap/SKILL.md'] + files['SKILL.md'];
  const routes = { 'Discovery metadata': count(description), 'Installed bootstrap': files['bootstrap/SKILL.md'], 'Bootstrap + current guidance entry': activation,
    ...Object.fromEntries(Object.entries({ scopedPptx: 'Scoped PPTX edit + final review', scopedGoogle: 'Scoped Google edit + final review', newPptxNative: 'New PPTX deck from native template + review', newGoogleNative: 'New Google deck from native template + review', draftOnly: 'Draft stage only: outline + contract', composedDeck: 'New composed deck: draft, then build', parallelLead: 'Parallel build, lead', parallelWorker: 'Parallel build, each worker', newPptxScene: 'New PPTX scene + contract + review', newGoogleScene: 'New Google scene + contract + review', contentLedPptx: 'Content-led PPTX + selected component + review', contentCritique:'Font screening + structured critique + review', customImages: 'Optional image guidance + download result' }).map(([name, label]) => [label, standalone[name].total])) };
  const hashes = Object.fromEntries(paths.map(path => [path, createHash('sha256').update(contents[path]).digest('hex')]));
  const inputDigest = createHash('sha256').update(JSON.stringify({ hashes, outputs, readingPaths, routes })).digest('hex');
  return { tokenizer: 'cl100k_base', inputDigest, files, samples, readingPaths, standalone, routes };
}
export function renderReport(data) {
  return 'Measured with `cl100k_base`; cumulative instruction counts, including a normalized\nrepresentative guidance-start response. Bootstrap activation is shown separately.\n\n| Reading path | Tokens |\n| --- | ---: |\n' + Object.entries(data.routes).map(([label, value]) => `| ${label} | ${value.toLocaleString('en-US')} |`).join('\n') + '\n\nIntake, workspace, brand integration and image guidance load only when needed. Native-template\nauthoring skips the scene contract; scene routes include its actual helper output.\nOnly the selected delivery format enters context. Brand contracts, source content,\nimage pixels, other helper results and conversation add separately. The image route\nincludes one normalized compact download result; it adds no provider code or logs. The JSON report\nalso exposes direct-handoff paths without the standalone bootstrap/start response.\n';
}
export async function main() {
  const args = process.argv.slice(2);
  if (args.some(x => !['--write', '--check', '--json'].includes(x)) || args.length > 1) throw new Error('Choose --write, --check or --json');
  const data = await measureContext();
  if (args.includes('--json')) { console.log(JSON.stringify(data, null, 2)); return; }
  const url = new URL('README.md', root), readme = await readFile(url, 'utf8');
  const pattern = /<!-- CONTEXT-USAGE:START -->[\s\S]*?<!-- CONTEXT-USAGE:END -->/;
  if (!pattern.test(readme) || (readme.match(/<!-- CONTEXT-USAGE:START -->/g) ?? []).length !== 1) throw new Error('Expected one context report marker pair');
  const next = readme.replace(pattern, `<!-- CONTEXT-USAGE:START -->\n${renderReport(data)}<!-- CONTEXT-USAGE:END -->`);
  if (args.includes('--write')) await writeFile(url, next);
  else if (readme !== next) throw new Error('Context counts changed; run npm run context:update');
  console.log(JSON.stringify({ routes: data.routes, inputDigest: data.inputDigest }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
