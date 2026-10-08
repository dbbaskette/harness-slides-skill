import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { digest, hash } from './common.mjs';
import { themeFor } from './scene.mjs';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim() && value.length < 20000;
const hex = value => /^#[a-f0-9]{6}$/i.test(value ?? '');
export function contractRevision(contract) { const { revision, ...data } = contract; return digest(data); }
export function validateBrandContract(contract, { medium } = {}) {
  if (contract?.schema !== 1 || !nonempty(contract.identity?.id) || !nonempty(contract.identity?.variant)) throw new Error('Use resolved brand contract schema 1 with identity/variant');
  if (!['slides','blog'].includes(contract.medium?.kind) || medium && contract.medium.kind !== medium) throw new Error('Brand contract belongs to a different medium');
  if (!['live','reading'].includes(contract.medium.delivery ?? 'reading')) throw new Error('Unknown delivery profile');
  if (!Array.isArray(contract.sources) || !contract.sources.length || contract.sources.some(s => !nonempty(s.path) || !/^[a-f0-9]{64}$/.test(s.sha256 ?? ''))) throw new Error('Brand authority needs hashed local sources');
  const design = contract.design;
  if (!record(design?.colors) || Object.values(design.colors).some(v => !hex(v)) || !nonempty(design.fontFamily)) throw new Error('Brand design needs resolved colors and font family');
  for (const key of ['canvasPrimary','canvasSecondary','inkDeep','headingPrimary','accentAqua']) if (!hex(design.colors[key])) throw new Error(`Missing brand color role: ${key}`);
  themeFor({theme:{font:design.fontFamily}});
  if (!record(contract.language?.organization) || !['unselected','provisional','confirmed'].includes(contract.language.authorVoice?.status)) throw new Error('Keep organization language and author voice separate; retain voice confirmation state');
  if (contract.language.authorVoice.status !== 'unselected' && (!nonempty(contract.language.authorVoice.id) || !nonempty(contract.language.authorVoice.guide) || !/^[a-f0-9]{64}$/.test(contract.language.authorVoice.sha256 ?? ''))) throw new Error('Selected voice needs identity, guide and source hash');
  if (contract.medium.kind === 'slides') {
    if(design.nativeTemplate){const n=design.nativeTemplate;if(!nonempty(n.path)||!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n.layoutPart??'')||!/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(n.masterPart??'')||!contract.sources.some(s=>s.path===n.path&&s.sha256===n.sha256))throw new Error('Native brand template must match hashed authority with layout and master parts');}
    const s = design.slides;
    if (!record(s?.canvas) || !record(s.titleBox) || !record(s.contentBox) || !record(s.typography)) throw new Error('Slide brand contract needs canvas, safe boxes and typography');
    for (const key of ['width','height']) if (!Number.isFinite(s.canvas[key]) || s.canvas[key] <= 0 || s.canvas[key] > 2000) throw new Error('Invalid brand canvas');
    for (const box of [s.titleBox,s.contentBox]) {
      if (['x','y','width','height'].some(k => !Number.isFinite(box[k])) || box.x<0 || box.y<0 || box.width<=0 || box.height<=0 || box.x+box.width>s.canvas.width+.01 || box.y+box.height>s.canvas.height+.01) throw new Error('Brand safe box is outside its canvas');
    }
    if (s.reservedBottom !== undefined && (!Number.isFinite(s.reservedBottom) || s.contentBox.y+s.contentBox.height>s.reservedBottom+.01)) throw new Error('Brand content box intrudes on reserved footer');
    for (const role of ['title','body','bodyReference','label','caption','metric','quote']) {
      const t=s.typography[role];
      if (!record(t) || !Number.isFinite(t.size) || t.size<1 || t.size>120 || typeof t.bold!=='boolean' || !hex(design.colors[t.colorRole])) throw new Error(`Invalid brand typography: ${role}`);
    }
    if (!Array.isArray(s.chart?.seriesRoles) || !s.chart.seriesRoles.length || s.chart.seriesRoles.some(role=>!hex(design.colors[role]))) throw new Error('Brand charts need selected series roles');
    for(const role of [s.table?.headerFillRole,s.table?.headerTextRole]) if(!hex(design.colors[role]))throw new Error('Brand table roles are unresolved');
  } else if (design.slides !== undefined) throw new Error('Blog design must not inherit slide geometry');
  if (contract.revision !== contractRevision(contract)) throw new Error('Brand contract changed; resolve a fresh handoff');
  return contract;
}
export async function checkBrandSources(contract) {
  validateBrandContract(contract);
  for(const source of contract.sources) if(hash(await readFile(source.path))!==source.sha256) throw new Error(`Brand authority changed (${source.kind ?? 'source'}); resolve a fresh contract`);
  return {revision:contract.revision,identity:contract.identity,medium:contract.medium,sources:contract.sources.length,status:'current local sources'};
}
export function brandTheme(contract) {
  validateBrandContract(contract,{medium:'slides'});
  const {colors:c,fontFamily,slides:s}=contract.design;
  return {font:fontFamily,background:c.canvasPrimary,text:c.inkDeep,accent:c.accentAqua,muted:c.canvasSecondary,titleSize:s.typography.title.size,bodySize:s.typography[contract.medium.delivery==='live'?'body':'bodyReference'].size};
}

export async function neutralBrandContract(){
  const path=fileURLToPath(new URL('../../guidance/unbranded-design.json',import.meta.url)),bytes=await readFile(path);
  const c={schema:1,identity:{id:'unbranded',variant:'default'},medium:{kind:'slides',delivery:'reading'},sources:[{path,kind:'neutral design defaults',sha256:hash(bytes)}],design:JSON.parse(bytes),language:{organization:{toneStatus:'unspecified; follow the supplied brief'},authorVoice:{status:'unselected'}}};c.revision=contractRevision(c);return validateBrandContract(c);
}
