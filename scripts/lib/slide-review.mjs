import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, lstat, mkdir, mkdtemp, open, rename, rm, readdir } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { getApprovedDesign, requireSceneDesign } from './design-session.mjs';
import {auditNativeReview,assessNativeCritique,auditCompositionReview,categorizeReview} from './native-quality.mjs';
import {refuse,refuseAll} from './refusals.mjs';
import {verifyBuiltAssets} from './assets.mjs';
import {digest,canonicalDigest,recordedPath,recordedLocation} from './common.mjs';
import { pptxTool } from './presentation-tools.mjs';
import { importDeck, updateDeck, exportPdf, previewPrefix } from '../google-drive-deck.mjs';
const exec = promisify(execFile);
const hash = data => createHash('sha256').update(data).digest('hex');
const pngMagic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function regularFile(file) {
  const s = await lstat(file);
  if (!s.isFile() || s.isSymbolicLink()) throw new Error(`Expected regular file: ${file}`);
}
async function bytes(file) { await regularFile(file); return readFile(file); }
const stale=message=>refuse(message,{code:'review-stale'});
// A compiled composition, read with the hash of each file so the review can tell when the build changed under it.
const buildFiles=['scene.json','structure.json','compose-report.json','brand-contract.json'];
async function readBuild(dir){
  dir=resolve(dir);const files={},values={};
  for(const name of buildFiles){
    let data;try{data=await bytes(join(dir,name));}catch(error){if(error.code==='ENOENT')throw refuse(`${dir} is not a compiled composition: ${name} is missing. Compile it with compose compile --output`,{code:'input-missing'});throw error;}
    files[name]=hash(data);values[name]=JSON.parse(data);
  }
  return {dir,files,binding:digest(files),scene:values['scene.json'],structure:values['structure.json'],report:values['compose-report.json']};
}
async function readRecord(output) {
  try {
    const record = JSON.parse(await bytes(join(output, 'review.json')));
    // Accept the prior record identifier when migrating the extracted brand tool.
    if (record.schemaVersion !== 1 || !['harness-slides-review','tanzu-brand-review'].includes(record.tool) || !Array.isArray(record.slides)) throw new Error('Not a Harness Slides review record');
    return record;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function locked(output, action) {
  output = resolve(output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const stat = await lstat(output);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Review output must be a real directory');
  const existing = await readdir(output);
  const marker = join(output, '.harness-review');
  if (existing.length && !existing.includes('review.json')) {
    let owned = false;
    try { owned = (await bytes(marker)).toString() === 'harness-slides-review-v1\n'; } catch {}
    if (!owned) throw new Error('Choose an empty directory or an existing Harness Slides review directory');
  }
  const lock = await open(join(output, '.review-lock'), 'wx', 0o600);
  try {
    // Persist ownership before writing images so a failed first render is retryable.
    if (!existing.length) await writeFile(marker, 'harness-slides-review-v1\n', { flag: 'wx', mode: 0o600 });
    return await action(output, await readRecord(output));
  }
  finally { await lock.close(); await rm(join(output, '.review-lock')); }
}
async function atomic(file, content) {
  try { await regularFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, { flag: 'wx', mode: 0o600 }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
async function saveImage(output, number, data) {
  if (!data.subarray(0, 8).equals(pngMagic)) throw new Error('Preview must be a PNG image');
  const digest = hash(data), image = `slide-${String(number).padStart(3, '0')}-${digest.slice(0, 16)}.png`;
  try { await writeFile(join(output, image), data, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (hash(await bytes(join(output, image))) !== digest) await atomic(join(output, image), data);
  }
  return { image, imageSha256: digest };
}
// The record names the reviewed deck, the design project, the build and the native snapshot relative to the review folder when
// they and the folder lie in the design project (or, without one, in the review folder), so the project can move. Writing migrates older records.
function relativePaths(output, record) {
  const at = p => recordedLocation(output, p), project = record.designProject ? at(record.designProject) : output, keep = p => recordedPath(output, at(p), project);
  if (record.source.file) record.source.file = keep(record.source.file);
  for (const key of ['designProject', 'nativeSnapshot']) if (record[key]) record[key] = keep(record[key]);
  if (record.compiled) record.compiled.dir = keep(record.compiled.dir);
}
async function save(output, record) {
  relativePaths(output, record);
  record.pending = record.slides.filter(s => s.finalReview?.revision !== record.revision || s.finalReview?.status !== 'reviewed').map(s => s.number);
  record.visualReviewComplete = !record.pending.length;
  record.creativeReviewComplete = Boolean(record.creativeQuality && record.creativeAssessment && assessNativeCritique(record.creativeQuality,record.creativeAssessment).complete);
  record.readyForUserReview = record.visualReviewComplete && (!record.creativeReviewRequired || record.creativeReviewComplete);
  const figures = record.slides.map(s => `<figure><a href="${s.image}"><img src="${s.image}" alt="${escape(s.title || `Slide ${s.number}`)}"></a><figcaption>${s.number}. ${escape(s.title)}${s.hidden ? ' (hidden)' : ''}<br>${s.finalReview?.status === 'reviewed' ? 'Reviewed' : 'Needs final review'}</figcaption></figure>`).join('\n');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Slide review</title><style>body{font:16px Arial,sans-serif;margin:24px;color:#1b1d36;background:#eee}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}figure{margin:0;background:white;padding:12px}img{width:100%;height:auto}figcaption{padding-top:8px}code{overflow-wrap:anywhere}</style><h1>Slide review</h1><p>${record.slides.length} slides · ${record.pending.length} pending · ${escape(record.renderer)}</p><p>Revision: <code>${escape(record.revision)}</code></p><p>Open each image at full size. Rendering does not certify visual quality or native editability.</p><main>${figures}</main></html>`;
  await atomic(join(output, 'contact-sheet.html'), html);
  await atomic(join(output, 'review.json'), `${JSON.stringify(record, null, 2)}\n`);
  return { output, record: join(output, 'review.json'), contactSheet: join(output, 'contact-sheet.html'), revision: record.revision, renderer: record.renderer,
    ...(record.remote ? { fileId: record.remote.fileId, url: record.remote.url, next: `Reuse this Drive file for the next Google render: --file-id ${record.remote.fileId}` } : {}),
    slides: record.slides.length, changed: record.slides.filter(s => !s.reused).map(s => s.number), pending: record.pending,
    visualReviewComplete: record.visualReviewComplete, creativeReviewRequired:record.creativeReviewRequired??false, creativeReviewComplete:record.creativeReviewComplete, readyForUserReview:record.readyForUserReview, ...(record.creativeQuality?{designReview:categorizeReview(record.creativeQuality,record.creativeAssessment),qualityRevision:record.creativeQuality.revision,assessmentBinding:{schema:1,sceneDigest:record.creativeQuality.sceneDigest,qualityRevision:record.creativeQuality.revision,artifactDigest:record.creativeQuality.artifactDigest},qualityReport:join(output,'review.json')}:{} ) };
}

export async function renderPptx({ file, output, selected, run = exec, soffice = process.env.HARNESS_SOFFICE || 'soffice', pdftoppm = process.env.HARNESS_PDFTOPPM || 'pdftoppm', pdfinfo = process.env.HARNESS_PDFINFO || 'pdfinfo' }) {
  const profile = await mkdtemp(join(tmpdir(), 'harness-render-profile-'));
  try {
    const filter = 'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}';
    await run(soffice, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--convert-to', filter, '--outdir', output, file], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const pdf = join(output, 'snapshot.pdf');
    const { stdout } = await run(pdfinfo, [pdf], { timeout: 10000 });
    const count = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Renderer did not report a page count');
    for (const number of selected) {
      await run(pdftoppm, ['-f', String(number), '-l', String(number), '-singlefile', '-scale-to', '1600', '-png', pdf, join(output, `page-${number}`)], { timeout: 60000, maxBuffer: 1024 * 1024 });
    }
    return { count, image: number => join(output, `page-${number}.png`) };
  } finally { await rm(profile, { recursive: true, force: true }); }
}

// Google Slides draws the deck by the route compose preview --renderer google takes: the exact bytes the review hashes are
// uploaded (or replace a "Preview: …" file given by fileId), exported as a PDF and cut into pictures with Poppler. The Drive
// copy only carries the render: the reviewed deck is still REVIEW/deck.pptx, so the receipts bind the same bytes.
export async function renderGoogle({ file, output, selected, title, fileId, drive = {}, google, run = exec, pdftoppm = process.env.HARNESS_PDFTOPPM || 'pdftoppm', pdfinfo = process.env.HARNESS_PDFINFO || 'pdfinfo' }) {
  const d = { importDeck, updateDeck, exportPdf, ...drive }, pdf = join(output, 'snapshot.pdf');
  let remote = null;
  try {
    try {
      remote = fileId ? await d.updateDeck({ fileId, file }, google) : await d.importDeck({ file, name: `${previewPrefix}${title || 'Review'}`, preview: true }, google);
      await d.exportPdf({ fileId: remote.id, output: pdf }, google);
    } catch (error) { throw refuse(`Google Slides could not render the deck: ${String(error.message).split('\n')[0]}`, { code: 'provider-failed', provider: 'google' }); }
    const { stdout } = await run(pdfinfo, [pdf], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const count = Number(/^Pages:\s+(\d+)/m.exec(stdout)?.[1]);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Renderer did not report a page count');
    for (const number of selected) await run(pdftoppm, ['-f', String(number), '-l', String(number), '-singlefile', '-scale-to', '1600', '-png', pdf, join(output, `page-${number}`)], { timeout: 60000, maxBuffer: 1024 * 1024 });
    return { count, image: number => join(output, `page-${number}.png`), remote: { provider: 'google', fileId: remote.id, url: remote.url } };
  } catch (error) { throw stranded(error, remote); }
}
// The upload already happened: say where it is, so a retry reuses it instead of creating another file.
function stranded(error, remote) {
  if (remote && !String(error.message).includes(`--file-id ${remote.id}`)) error.message += ` The review deck is in Drive (${remote.url}); retry with --renderer google --file-id ${remote.id}.`;
  return error;
}

export async function renderSignature(options) {
  const run = options.run ?? exec, google = options.renderer === 'google';
  const versions = [];
  const poppler = [[options.pdftoppm || process.env.HARNESS_PDFTOPPM || 'pdftoppm', ['-v'], 'poppler'], [options.pdfinfo || process.env.HARNESS_PDFINFO || 'pdfinfo', ['-v'], 'poppler']];
  const office=[options.soffice || process.env.HARNESS_SOFFICE || 'soffice', ['--version'], 'libreoffice'];
  for (const [name, args, provider] of google ? poppler : options.popplerFirst?[...poppler,office]:[office,...poppler]) {
    // A missing renderer is named before anything is rendered or uploaded, so the caller can install it and retry.
    const result = await run(name, args, { timeout: 10000 }).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      throw google ? refuse(`${name} is not installed. A Google render still needs Poppler (pdftoppm, pdfinfo) to turn its PDF into pictures`, { code: 'renderer-unavailable', provider, next: 'Install Poppler (brew install poppler), then prepare the review again' })
        : refuse(`${name} is not installed. Review renders PPTX with LibreOffice (soffice) and Poppler (pdftoppm, pdfinfo)`, { code: 'renderer-unavailable', provider, next: provider === 'libreoffice' ? 'Install LibreOffice, or render through Google Drive with --renderer google' : 'Install Poppler (brew install poppler), then prepare the review again' });
    });
    versions.push([name, result.stdout, result.stderr]);
  }
  // Google draws with its own fonts, so the fonts installed here do not change its pictures.
  if (google) return hash(JSON.stringify(['google-slides-pdf-export', versions]));
  try {
    const { stdout } = await run('fc-list', ['-f', '%{file}\n'], { timeout: 10000 });
    const files = [...new Set(stdout.trim().split('\n').filter(Boolean))].sort();
    if (!files.length) throw new Error('No font inventory');
    for (const file of files) {
      const info = await lstat(file);
      versions.push([file, info.size, info.mtimeMs]);
    }
  } catch {
    if(process.platform==='darwin'){
      const fonts=[];const walk=async dir=>{for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const file=join(dir,e.name);if(e.isDirectory())await walk(file);else if(e.isFile()&&/\.(ttf|otf|ttc|dfont)$/i.test(e.name)){const s=await lstat(file);fonts.push([file,s.size,s.mtimeMs]);}}};
      for(const dir of ['/System/Library/Fonts','/Library/Fonts',join(homedir(),'Library/Fonts')])await walk(dir);
      versions.push(...(fonts.length?fonts.sort((a,b)=>a[0].localeCompare(b[0])):[['font inventory unavailable',randomUUID()]]));
    }else versions.push(['font inventory unavailable',randomUUID()]);
  }
  return hash(JSON.stringify(versions));
}

export async function prepareReview({ file, previews, compiled, output, designProject, nativeSnapshot, decisions, qualityReport, refresh = false, renderer = 'local', fileId, render, inventory = file => pptxTool('inventory', [file]), signature = renderSignature, renderComposition, screen, ...options }) {
  if ([file, previews, compiled].filter(Boolean).length !== 1 || !output) throw refuse('Provide --output and exactly one of --file, --previews or --compiled', { code: 'input-invalid' });
  renderer ??= 'local';
  if (!['local', 'google'].includes(renderer)) throw refuse('--renderer is local (LibreOffice) or google (Google Slides through Drive)', { code: 'input-invalid' });
  if (previews && renderer !== 'local') throw refuse('--previews are already rendered: --renderer applies to --file and --compiled', { code: 'input-invalid' });
  if (fileId && renderer !== 'google') throw refuse('--file-id names the Drive file a Google render reuses: give it with --renderer google', { code: 'input-invalid' });
  if (compiled && !designProject) throw refuse('--compiled needs --design-project: a composition review is checked against the approved design', { code: 'input-invalid' });
  if (compiled && (nativeSnapshot || decisions || qualityReport)) throw refuse('--compiled takes no --native-snapshot, --decisions or --quality-report: the compiled build supplies them', { code: 'input-invalid' });
  return locked(output, async (dir, previous) => {
    if(previous?.creativeReviewRequired&&!designProject)throw new Error('Retain the design project and native/scene quality inputs; creative review cannot be downgraded');
    let source, revision, label, pages, images, rendererKey, remote;
    let temp, build, bundleTemp, bundlePreview;
    try {
      if (compiled) {
        // Review renders the build itself, so the deck it reviews is the deck it binds. An unchanged build keeps its deck and receipts.
        build = await readBuild(compiled);
        if (!build.report.designRevision) throw refuse('This build was compiled without --design-project, so it is not bound to a design. Compile it with --design-project, then review it', { code: 'design-missing', next: 'Compile the composition with --design-project, then prepare the review' });
        if (build.report.designScope === 'section') throw refuse('This build is a section. Review the whole deck: merge the sections with compose merge, compile the merged deck with --design-project, then review it', { code: 'input-invalid' });
        const approved = await getApprovedDesign(designProject);
        if (build.report.designRevision !== approved.revision) throw refuse('This build was compiled against an older design revision. Compile the composition again against the approved design, then review it', { code: 'review-stale', next: 'Compile the composition again with --design-project, then prepare the review' });
        await requireSceneDesign(build.scene, designProject, approved.revision);
        await verifyBuiltAssets(build.dir);
        if(!render&&!renderComposition)await signature({...options,renderer});
        file = join(dir, 'deck.pptx');
        let current = null; try { current = hash(await bytes(file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        build.native = previous?.compiled?.binding === build.binding && recordedLocation(dir, previous.source?.file) === file && current === previous.source.sha256 ? previous.compiled.native : null;
        if (!build.native) {
          const scratch = await mkdtemp(join(tmpdir(), 'harness-compose-review-'));
          try {
            let built;
            if(!render&&!renderComposition){
              // Composition preview and review consume exactly one editable
              // artifact and its verified native pixels, across output folders.
              bundleTemp=await mkdtemp(join(tmpdir(),'harness-bundle-review-'));
              bundlePreview=await (await import('./compose-preview.mjs')).previewComposition({file:build.dir,output:join(bundleTemp,'render'),renderer,'file-id':fileId,'design-project':designProject,fonts:options.fonts,soffice:options.soffice,pdftoppm:options.pdftoppm,pdfinfo:options.pdfinfo,register:false},{run:options.run,drive:options.drive,google:options.google});
              built={...bundlePreview,sha256:bundlePreview.deckSha256};
              await writeFile(join(scratch,'deck.pptx'),await bytes(bundlePreview.deck));
            }else{
              const draw = renderComposition ?? (await import('./compose-file.mjs')).renderCompositionDir;
              built = await draw({ file: build.dir, output: join(scratch, 'deck.pptx') });
            }
            build.native = built.native ?? [];
            await atomic(file, await bytes(join(scratch, 'deck.pptx')));
          } finally { await rm(scratch, { recursive: true, force: true }); }
        }
      }
      if (file) {
        file = resolve(file);
        const data = await bytes(file);
        temp = await mkdtemp(join(tmpdir(), 'harness-review-'));
        const snapshot = join(temp, 'snapshot.pptx');
        await writeFile(snapshot, data, { mode: 0o600 });
        const deck = await inventory(snapshot);
        if (!deck.slides.length || deck.slides.length > 500) throw new Error('Review requires 1–500 slides');
        revision = hash(data);
        source = { type: 'pptx', file, sha256: revision };
        rendererKey = await signature({ ...options, renderer });
        label = renderer === 'google' ? 'Google Slides PDF export / Poppler; verify fidelity in the target editor' : 'LibreOffice PDF / Poppler; verify fidelity in the target editor';
        pages = deck.slides;
        images = async selected => {
          if(bundlePreview){if(bundlePreview.fileId)remote={provider:'google',fileId:bundlePreview.fileId,url:bundlePreview.url};return number=>bundlePreview.slides.find(s=>s.number===number).image;}
          const draw = render ?? (renderer === 'google' ? renderGoogle : renderPptx);
          const result = await draw({ file: snapshot, output: temp, selected, ...options, ...(renderer === 'google' ? { title: build?.scene.title ?? basename(file).replace(/\.pptx$/i, ''), fileId } : {}) });
          remote = result.remote;
          if (result.count !== pages.length) throw stranded(new Error(`Rendered ${result.count} pages for ${pages.length} slides. Hidden slides or export coverage are missing.`), remote && { id: remote.fileId, url: remote.url });
          return result.image;
        };
      } else {
        const manifestPath = resolve(previews);
        const m = JSON.parse(await bytes(manifestPath));
        if (!m.presentationId || !m.revision || !m.renderer || !Array.isArray(m.slides) || !m.slides.length || m.slides.length > 500 || m.expectedSlideCount !== m.slides.length) throw new Error('Native preview manifest needs presentationId, revision, renderer, expectedSlideCount and a complete slide inventory');
        if (new Set(m.slides.map(s => s.id)).size !== m.slides.length || m.slides.some(s => typeof s.id !== 'string' || !s.id || typeof s.hidden !== 'boolean')) throw new Error('Native previews require unique slide IDs and explicit hidden flags');
        source = { type: 'google-slides', presentationId: m.presentationId, nativeRevision: m.revision };
        label = String(m.renderer);
        rendererKey = hash(label);
        const prepared = await Promise.all(m.slides.map(async (s, i) => {
          const data = await bytes(resolve(dirname(manifestPath), s.image));
          return { number: i + 1, id: s.id, hidden: s.hidden, title: s.title ?? '', fingerprint: hash(data), data };
        }));
        revision = hash(JSON.stringify([source, prepared.map(s => [s.id, s.hidden, s.fingerprint])]));
        pages = prepared;
      }
      const sameSource = previous?.source?.type === source.type && (source.type === 'pptx' ? recordedLocation(dir, previous.source.file) === source.file : previous.source.presentationId === source.presentationId);
      const resultPages = [];
      const changed = [];
      for (const page of pages) {
        const old = sameSource && previous?.rendererKey === rendererKey && previous.slides.find(s => s.id === page.id && s.fingerprint === page.fingerprint && s.number === page.number && s.hidden === page.hidden);
        let reuse = !refresh && old && /^slide-\d+-[a-f0-9]+\.png$/.test(old.image);
        if (reuse) {
          try { reuse = hash(await bytes(join(dir, old.image))) === old.imageSha256; } catch { reuse = false; }
        }
        if (!reuse) changed.push(page.number);
        const { data, ...metadata } = page;
        resultPages.push({ ...metadata, reused: Boolean(reuse),
          ...(reuse ? { image: old.image, imageSha256: old.imageSha256, iterationReview: old.finalReview ?? old.iterationReview } : {}),
          finalReview: reuse && previous.revision === revision ? old.finalReview ?? null : null });
      }
      const imagePath = file && changed.length ? await images(changed) : null;
      for (const page of resultPages.filter(s => !s.reused)) {
        Object.assign(page, await saveImage(dir, page.number, file ? await bytes(imagePath(page.number)) : pages[page.number - 1].data));
      }
      const record={schemaVersion:1,tool:'harness-slides-review',source,revision,renderer:label,rendererKey,slides:resultPages};
      // The Drive file a Google render used, kept while the pictures it drew are, so a later render can reuse it.
      const drawn=remote??(renderer==='google'&&previous?.rendererKey===rendererKey?previous.remote:null);if(drawn)record.remote=drawn;
      if(designProject){
        const approved=await getApprovedDesign(designProject);record.designProject=resolve(designProject);record.designRevision=approved.revision;record.creativeReviewRequired=true;
        if(build){
          if(pages.length!==approved.plan.slides.length)throw new Error('The rendered deck and the approved design have different slide counts');
          const screens=await (screen??(await import('./compose-preview.mjs')).screenComposition)({scene:build.scene,structure:build.structure,native:build.native});
          record.compiled={dir:build.dir,binding:build.binding,files:build.files,native:build.native};
          record.creativeQuality=auditCompositionReview({scene:build.scene,structure:build.structure,report:build.report,plan:approved.plan,designRevision:approved.revision,screens,binding:build.binding,renderer,builtArtifactDigest:digest({'deck.pptx':source.sha256}),artifactDigest:digest(record.slides.map(s=>[s.id,s.imageSha256]))});
          record.designBinding=pages.map((p,i)=>({nativeId:p.id,planId:approved.plan.slides[i].id}));
        }else if(previews){
          if(!nativeSnapshot||!decisions||qualityReport)throw new Error('Native creative review needs --native-snapshot and --decisions');
          const snapshot=JSON.parse(await bytes(resolve(nativeSnapshot))),mapping=JSON.parse(await bytes(resolve(decisions)));
          record.nativeSnapshot=resolve(nativeSnapshot);record.nativeSnapshotDigest=digest(snapshot);
          record.creativeQuality=auditNativeReview({snapshot,record,plan:approved.plan,designRevision:approved.revision,mapping});record.designBinding=record.creativeQuality.bindings;
        }else{
          if(!qualityReport||nativeSnapshot||decisions)throw new Error('PPTX creative review needs its built --quality-report');
          const q=JSON.parse(await bytes(resolve(qualityReport))),{revision:qr,...payload}=q;
          if(qr!==digest(payload)||q.artifactDigest!==digest({'deck.pptx':source.sha256})||q.prompts.length!==pages.length||q.prompts.some((p,i)=>p.slide!==approved.plan.slides[i].id||p.title!==approved.plan.slides[i].title||canonicalDigest(p.intent)!==canonicalDigest(approved.plan.slides[i].intent)))throw new Error('Scene quality, built artifact and approved design differ');
          record.creativeQuality={...q,builtArtifactDigest:q.artifactDigest,artifactDigest:digest(record.slides.map(s=>[s.id,s.imageSha256])),designRevision:approved.revision};
          record.creativeQuality.prompts=q.prompts.map((p,i)=>({...p,approvedCopy:approved.plan.slides[i].visibleText,approvedComposition:approved.plan.slides[i].composition,assetCandidate:approved.plan.slides[i].asset,criteria:[...p.criteria,...['composition-decision','explanatory-value','focal-hierarchy','asset-purpose','rendered-text-completeness','approved-design'].filter(id=>!p.criteria.some(c=>c.id===id)).map(id=>({id,question:id==='rendered-text-completeness'?'Compare approved text and native/export pixels, including complete heading prefixes and labels.':'Judge the actual delivered slide against its approved content and asset decision.'}))]}));
          delete record.creativeQuality.revision;record.creativeQuality.revision=digest(record.creativeQuality);
          record.designBinding=pages.map((p,i)=>({nativeId:p.id,planId:approved.plan.slides[i].id}));
        }
        if(previous?.revision===record.revision&&previous?.creativeQuality?.revision===record.creativeQuality.revision)record.creativeAssessment=previous.creativeAssessment;
      }else if(nativeSnapshot||decisions||qualityReport)throw new Error('Creative inputs need --design-project');
      const result=await save(dir,record);
      if(compiled)await (await import('./composition-project.mjs')).recordCompositionArtifact(resolve(compiled,build.report.project??'.'),compiled,'review',{path:dir});
      return result;
    } finally { if (temp) await rm(temp, { recursive: true, force: true }); if(bundleTemp)await rm(bundleTemp,{recursive:true,force:true}); }
  });
}

export async function markReview({ output, revision, numbers, status = 'reviewed', note }) {
  if (!revision || !note?.trim() || !['reviewed', 'unresolved'].includes(status) || !numbers?.length) throw new Error('Provide revision, slide numbers, status, and an inspection note');
  return locked(output, async (dir, record) => {
    if (!record || record.revision !== revision) throw new Error('Review revision changed; inspect the current previews first');
    await verifyReview(dir,record);
    for (const number of numbers) if (!Number.isInteger(number) || !record.slides.some(s => s.number === number)) throw new Error('Unknown slide number');
    for (const slide of record.slides.filter(s => numbers.includes(s.number))) {
      slide.finalReview = { revision, status, note: note.trim(), checkedAt: new Date().toISOString() };
    }
    return save(dir, record);
  });
}

export async function verifyReview(output,record){
  output=resolve(output);const at=p=>recordedLocation(output,p);
  if(!record)record=await readRecord(output);
  if(!record)throw refuse(`Prepare native review first: ${output} holds no review`,{code:'input-invalid',next:'Prepare the review first (review --compiled COMPILED --output DIR --design-project DIR, or --file or --previews), then inspect, mark and assess it'});
  if(record.source.type==='pptx'&&hash(await bytes(at(record.source.file)))!==record.source.sha256)throw stale('Deck changed after rendering; prepare review again');
  for(const slide of record.slides)if(!/^slide-\d+-[a-f0-9]+\.png$/.test(slide.image)||hash(await bytes(join(output,slide.image)))!==slide.imageSha256)throw stale('Preview changed; prepare review again');
  if(record.creativeReviewRequired){
    try{await getApprovedDesign(at(record.designProject),{revision:record.designRevision});}catch(error){if(/Approved design revision changed/.test(error.message))throw stale('Approved design revision changed after this review was prepared; build the current design and prepare review again');throw error;}
    if(record.compiled){
      let now;try{now=await readBuild(at(record.compiled.dir));}catch(error){throw stale(`The compiled build changed after this review was prepared (${error.message}); prepare review again`);}
      if(now.binding!==record.compiled.binding)throw stale('The compiled build changed after this review was prepared; prepare review again');
      await verifyBuiltAssets(at(record.compiled.dir));
    }
    if(record.nativeSnapshot&&digest(JSON.parse(await bytes(at(record.nativeSnapshot))))!==record.nativeSnapshotDigest)throw stale('Native snapshot changed; prepare current review');
    if(!record.creativeQuality)throw new Error('Creative report is missing');
    const {revision,...payload}=record.creativeQuality;
    if(revision!==digest(payload)||record.creativeQuality.artifactDigest!==digest(record.slides.map(s=>[s.id,s.imageSha256]))||record.source.type==='pptx'&&record.creativeQuality.builtArtifactDigest!==digest({'deck.pptx':record.source.sha256})||record.compiled&&record.creativeQuality.build!==record.compiled.binding)throw stale('Creative quality binding changed');
    if(record.creativeAssessment)assessNativeCritique(record.creativeQuality,record.creativeAssessment);
  }
  // Derive readiness from bound receipts rather than trusting stored summary flags.
  record.visualReviewComplete=record.slides.every(s=>s.finalReview?.revision===record.revision&&s.finalReview?.status==='reviewed');
  record.creativeReviewComplete=Boolean(record.creativeQuality&&record.creativeAssessment&&assessNativeCritique(record.creativeQuality,record.creativeAssessment).complete);
  record.readyForUserReview=record.visualReviewComplete&&(!record.creativeReviewRequired||record.creativeReviewComplete);
  return record;
}
export async function assessReview({output,revision,assessment}){
  return locked(output,async(dir,record)=>{
    if(!record||record.revision!==revision||!record.creativeReviewRequired)throw new Error('Assess the current creative review revision');
    await verifyReview(dir,record);
    assessment=withSlideSources(record.creativeQuality,assessment);
    const receipt=assessNativeCritique(record.creativeQuality,assessment);record.creativeAssessment=assessment;
    return {...await save(dir,record),unresolved:receipt.unresolved};
  });
}

export async function inspectReview({output,slide}){
  const record=await verifyReview(resolve(output)),quality=record.creativeQuality;
  if(!quality)throw noPacket();
  const prompt=quality.prompts.find(p=>p.slide===slide||record.designBinding?.some(b=>b.planId===slide&&b.nativeId===p.slide));
  if(!prompt)throw refuse(`Unknown creative review slide ${slide}`,{code:'input-invalid',slide:slide??null,next:'Name a slide of this review; review --packets lists them'});
  return {revision:record.revision,assessmentBinding:{schema:1,sceneDigest:quality.sceneDigest,qualityRevision:quality.revision,artifactDigest:quality.artifactDigest},slide:prompt,findings:quality.findings.filter(f=>f.slide===prompt.slide),deckReview:quality.deckReview};
}
const noPacket=()=>refuse('Prepare structured creative review first: this review is not bound to a design',{code:'input-invalid',next:'Prepare the review with --design-project, then inspect it'});
const planIdOf=(record,id)=>record.designBinding?.find(b=>b.nativeId===id)?.planId??id;
// Every slide's packet in one call: what --slide returns for each, with its picture, its plan ID and its pixel mark.
export async function reviewPackets({output}){
  output=resolve(output);const record=await verifyReview(output),quality=record.creativeQuality;
  if(!quality)throw noPacket();
  const slides=record.slides.map(s=>{
    const planId=planIdOf(record,s.id),packet=quality.prompts.find(p=>p.slide===s.id||p.slide===planId);
    return {number:s.number,id:s.id,planId,title:s.title,hidden:s.hidden,image:join(output,s.image),imageSha256:s.imageSha256,mark:s.finalReview??null,packet,findings:quality.findings.filter(f=>f.slide===packet?.slide)};
  });
  return {schema:1,output,revision:record.revision,designRevision:record.designRevision??null,renderer:record.renderer,
    assessmentBinding:{schema:1,sceneDigest:quality.sceneDigest,qualityRevision:quality.revision,artifactDigest:quality.artifactDigest},contactSheet:join(output,'contact-sheet.html'),
    deckReview:quality.deckReview,designReview:categorizeReview(quality,record.creativeAssessment),
    visualReviewComplete:record.visualReviewComplete,creativeReviewComplete:record.creativeReviewComplete,readyForUserReview:record.readyForUserReview,slides};
}
// The assessment's unresolved items by plan slide ID: what design present --accept-findings lists for the person. Null without an assessment.
export function reviewFindings(record){
  if(!record.creativeQuality||!record.creativeAssessment)return null;
  return assessNativeCritique(record.creativeQuality,record.creativeAssessment).unresolved.map(u=>({slide:planIdOf(record,u.slide),criterion:u.criterion,status:u.status,category:u.category,detail:u.detail,...(u.objects?{objects:u.objects}:{})}));
}
// A check may leave out sources: the slide fixes them, so it takes the slide's own. Sources that are given must be the slide's.
function withSlideSources(quality,assessment){
  if(!Array.isArray(assessment?.slides))return assessment;
  const problems=[];
  const slides=assessment.slides.map(s=>{
    const prompt=quality.prompts.find(p=>p.slide===s?.id);
    if(!prompt||!Array.isArray(s.checks))return s;
    return {...s,checks:s.checks.map(c=>{
      if(!c||typeof c!=='object')return c;
      if(c.sources===undefined||c.sources===null)return {...c,sources:[...prompt.sources]};
      const stray=Array.isArray(c.sources)?c.sources.filter(x=>!prompt.sources.includes(x)):[];
      if(!Array.isArray(c.sources)||!c.sources.length||stray.length)problems.push({code:'input-invalid',slide:s.id,detail:`${s.id}: ${c.criterion} ${stray.length?`cites ${stray.join(', ')}, not among the slide's sources (${prompt.sources.join(', ')})`:'gives sources that are not a list of the slide\'s sources'}. Leave sources out to use the slide's own`});
      return c;
    })};
  });
  if(problems.length===1)throw refuse(problems[0].detail,problems[0]);
  if(problems.length)throw refuseAll(`${problems.length} checks cite sources that are not their slide's:\n${problems.map(p=>p.detail).join('\n')}`,problems);
  return {...assessment,slides};
}
