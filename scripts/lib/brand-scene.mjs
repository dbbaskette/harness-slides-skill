// A small shared scene contract: no browser, OAuth SDK, or third-party renderer.
import { createHash } from 'node:crypto';
export function createSceneRenderer({tokens,profile,selection = {brand:'custom',variant:'default'}}) {
const roles = Object.fromEntries(Object.entries(tokens.colors.roles).map(([role, key]) => [role, tokens.colors.raw[key]]));
const idPattern = /^[a-zA-Z_][a-zA-Z0-9_-]{4,49}$/;
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = message => { throw new Error(message); };
const object = (value, label) => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`); };
const keys = (value, allowed, label) => { object(value, label); for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: unsupported field ${key}`); };
const text = (value, label) => { if (typeof value !== 'string' || !value.trim() || value.length > 10000) fail(`${label} requires nonempty text (maximum 10000 characters)`); };
const role = value => { if (!Object.hasOwn(roles, value)) fail(`Unknown brand color role: ${value}`); return roles[value]; };
const number = (value, label, min, max) => { if (!Number.isFinite(value) || value < min || value > max) fail(`${label} must be between ${min} and ${max}`); };
const rgb = value => { const hex = role(value).slice(1); return Object.fromEntries(['red', 'green', 'blue'].map((key, i) => [key, parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255])); };
const color = value => ({ opaqueColor: { rgbColor: rgb(value) } });
const size = (width, height) => ({ width: { magnitude: width, unit: 'PT' }, height: { magnitude: height, unit: 'PT' } });
const transform = (x, y) => ({ scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, translateX: x, translateY: y, unit: 'PT' });
const props = (pageObjectId, e) => ({ pageObjectId, size: size(e.width, e.height), transform: transform(e.x, e.y) });
const contract = `AI-owned scene v1; coordinates in points, ${tokens.typography.primary.family} and selected theme color roles.
Selected brand: ${selection.brand}/${selection.variant}; profile ${profile.id}.\nTop level: optional brand and variant must match selection; version:1, mode:new|redesign|rework, title, slides:[...].
Slide: id (stable Google object ID, 5–50 characters), title, sources:[evidence refs], elements:[...].
New slide: layoutId from a verified native selected-brand template snapshot. Creates an additional slide.
Existing slide: id from snapshot; replace:[top-level content object IDs to remove], protect:[chrome/artwork IDs].
Unlisted slides/objects, masters, layouts, notes and links are untouched. Existing slides need both lists; never replace protected content.
Element: id, type:text|shape|line|table, x,y,width,height. All IDs globally unique and absent in snapshot.
Text/shape: text optional for shape, required for text; role:title|body|bodyReference|label|caption|metric|quote|section; fill and color are brand color roles; bold:boolean; align:START|CENTER|END; shape:RECTANGLE|ELLIPSE. fontSize optional 14–96pt.
Line: width/height positive; flipX/flipY optional booleans, color role, weight 1–8, arrow:boolean. Lines are editable but not attached connectors.
Table: rows:nonempty rectangular string[][]; fontSize optional 14–36. Native cells, equal column widths/row minima; no merged cells.
No arbitrary HTML/CSS, icons as Unicode, images, gradients, charts, speaker notes, or rich text in this version. Preserve/reuse those through native tools; do not rasterize or silently drop them.
Build with --template a full native presentations.get JSON snapshot. Inspect HTML as a content-area draft; inspect actual Google rendering for template chrome and final fidelity.`;

function pageSize(deck) {
  const pt = dimension => dimension?.unit === 'PT' ? dimension.magnitude : dimension?.unit === 'EMU' ? dimension.magnitude / 12700 : NaN;
  const width = pt(deck.pageSize?.width), height = pt(deck.pageSize?.height);
  number(width, 'Template width', 100, 2000); number(height, 'Template height', 100, 2000);
  if (Math.abs(width / height - 16 / 9) > .01) fail('Use a verified 16:9 selected-brand template');
  if (Math.abs(width-profile.measured.canvas.width)>1 || Math.abs(height-profile.measured.canvas.height)>1) fail('Template canvas differs from selected brand profile; import the full source template before authoring');
  return { width, height };
}
function collectIds(deck) {
  const ids = new Set();
  const visit = value => { if (!value || typeof value !== 'object') return; if (value.objectId) ids.add(value.objectId); for (const v of Object.values(value)) if (typeof v === 'object') Array.isArray(v) ? v.forEach(visit) : visit(v); };
  visit(deck); return ids;
}
function validateScene(scene, deck) {
  keys(scene, ['version', 'mode', 'title', 'brand', 'variant', 'slides'], 'Scene');
  if (scene.version !== 1 || !['new', 'redesign', 'rework'].includes(scene.mode)) fail('Scene route supports new, redesign, or rework only; use native editing for brand-only/polish');
  if ((scene.brand !== undefined && scene.brand !== selection.brand) || (scene.variant !== undefined && scene.variant !== selection.variant)) fail('Scene brand/variant differs from selected contract');
  text(scene.title, 'Deck title');
  if (!deck?.presentationId || !/^[\w-]+$/.test(deck.presentationId) || !deck.revisionId) fail('Full native template snapshot needs presentationId and revisionId');
  const canvas = pageSize(deck), existing = collectIds(deck), created = new Set(), targets = new Set();
  if (!Array.isArray(scene.slides) || !scene.slides.length || scene.slides.length > 100) fail('Scene requires 1–100 slides');
  const claim = id => { if (!idPattern.test(id ?? '') || created.has(id) || existing.has(id)) fail(`New object ID is invalid, repeated, or already exists: ${id}`); created.add(id); };
  for (const s of scene.slides) {
    keys(s, ['id', 'title', 'sources', 'layoutId', 'replace', 'protect', 'elements'], 'Slide');
    if (targets.has(s.id)) fail(`Repeated target slide: ${s.id}`); targets.add(s.id);
    text(s.title, 'Slide title');
    if (!Array.isArray(s.sources) || !s.sources.length || s.sources.some(x => typeof x !== 'string' || !x.trim())) fail('Each slide needs evidence references in sources');
    const native = deck.slides?.find(p => p.objectId === s.id);
    if (native) {
      if (scene.mode === 'new' || s.layoutId) fail('New mode cannot edit an existing slide; existing slides cannot change layout through this renderer');
      const owned = new Set((native.pageElements ?? []).map(x => x.objectId));
      for (const list of ['replace', 'protect']) if (!Array.isArray(s[list]) || s[list].some(id => !owned.has(id)) || new Set(s[list]).size !== s[list].length) fail(`${list} must list unique top-level objects from the target slide`);
      if (s.replace.some(id => s.protect.includes(id))) fail('Cannot remove protected template artwork');
      // Notes and child/group IDs cannot enter the top-level replacement list.
    } else {
      if (scene.mode === 'redesign') fail('Redesign must retain existing slide IDs and count; use rework for additional slides');
      claim(s.id);
      if (!deck.layouts?.some(l => l.objectId === s.layoutId)) fail('New slide requires a layoutId from the verified native template snapshot');
      if (s.replace || s.protect) fail('New slides cannot remove existing objects');
    }
    if (!Array.isArray(s.elements) || !s.elements.length || s.elements.length > 200) fail('Slide requires 1–200 elements');
    for (const e of s.elements) {
      const fields = { text: ['text', 'role', 'fontSize', 'color', 'fill', 'bold', 'align'], shape: ['text', 'role', 'fontSize', 'color', 'fill', 'bold', 'align', 'shape'], line: ['color', 'weight', 'arrow', 'flipX', 'flipY'], table: ['rows', 'fontSize'] };
      if (!Object.hasOwn(fields, e?.type)) fail(`Unsupported element ${e?.type}; use a native tool for required images/charts/icons, never flatten the slide`);
      keys(e, ['id', 'type', 'x', 'y', 'width', 'height', ...fields[e.type]], 'Element'); claim(e.id);
      number(e.x, 'x', 0, canvas.width); number(e.y, 'y', 0, canvas.height);
      number(e.width, 'width', 1, canvas.width); number(e.height, 'height', 1, canvas.height);
      if (e.x + e.width > canvas.width + .01 || e.y + e.height > canvas.height + .01) fail(`${e.id} exceeds slide bounds`);
      for (const field of ['bold', 'arrow', 'flipX', 'flipY']) if (e[field] !== undefined && typeof e[field] !== 'boolean') fail(`${field} must be boolean`);
      for (const field of ['fill', 'color']) if (e[field] !== undefined) role(e[field]);
      if (e.type === 'text') text(e.text, 'Text element');
      if (e.type === 'shape' && e.text !== undefined) text(e.text, 'Shape text');
      if (['text', 'shape'].includes(e.type)) {
        if (e.shape && !['RECTANGLE', 'ELLIPSE'].includes(e.shape)) fail('Use RECTANGLE or ELLIPSE');
        if (e.role !== undefined && !Object.hasOwn(profile.defaults.typography, e.role)) fail('Unknown typography role');
        if (e.fontSize !== undefined) number(e.fontSize, 'fontSize', 14, 96);
        if (e.align && !['START', 'CENTER', 'END'].includes(e.align)) fail('Unknown text alignment');
      }
      if (e.type === 'line' && e.weight !== undefined) number(e.weight, 'weight', 1, 8);
      if (e.type === 'table') {
        const rows = e.rows;
        if (!Array.isArray(rows) || !rows.length || rows.length > 30 || !Array.isArray(rows[0]) || !rows[0].length || rows[0].length > 12 || rows.some(row => !Array.isArray(row) || row.length !== rows[0].length || row.some(cell => typeof cell !== 'string' || cell.length > 10000))) fail('Table needs rectangular string rows (maximum 30 × 12)');
        if (e.fontSize !== undefined) number(e.fontSize, 'fontSize', 14, 36);
      }
    }
  }
  return canvas;
}
const style = e => { const d = profile.defaults.typography[e.role ?? 'bodyReference']; return { fontSize: e.fontSize ?? d.size, bold: e.bold ?? d.bold, color: e.color ?? d.colorRole }; };
function textRequests(e, cellLocation) {
  const s = style(e), selector = cellLocation ? { cellLocation } : {};
  return [
    { insertText: { objectId: e.id, ...selector, insertionIndex: 0, text: e.text } },
    { updateTextStyle: { objectId: e.id, ...selector, textRange: { type: 'ALL' }, style: { fontFamily: tokens.typography.primary.family, fontSize: { magnitude: s.fontSize, unit: 'PT' }, bold: s.bold, foregroundColor: color(s.color) }, fields: 'fontFamily,fontSize,bold,foregroundColor' } },
    { updateParagraphStyle: { objectId: e.id, ...selector, textRange: { type: 'ALL' }, style: { alignment: e.align ?? 'START', spaceAbove: { magnitude: 0, unit: 'PT' }, spaceBelow: { magnitude: 0, unit: 'PT' } }, fields: 'alignment,spaceAbove,spaceBelow' } },
  ];
}
function compileScene(scene, deck) {
  const canvas = validateScene(scene, deck), requests = [], warnings = [];
  for (const slide of scene.slides) {
    if (deck.slides?.some(p => p.objectId === slide.id)) {
      for (const objectId of slide.replace) requests.push({ deleteObject: { objectId } });
    } else requests.push({ createSlide: { objectId: slide.id, slideLayoutReference: { layoutId: slide.layoutId } } });
    for (const e of slide.elements) {
      if (e.y + e.height > profile.defaults.footerClearance.contentBottomPt) warnings.push(`${e.id}: check template footer clearance`);
      if (e.type === 'text' || e.type === 'shape') {
        requests.push({ createShape: { objectId: e.id, shapeType: e.type === 'text' ? 'TEXT_BOX' : e.shape ?? 'RECTANGLE', elementProperties: props(slide.id, e) } });
        requests.push({ updateShapeProperties: { objectId: e.id, shapeProperties: { shapeBackgroundFill: e.fill ? { solidFill: { color: { rgbColor: rgb(e.fill) }, alpha: 1 } } : { propertyState: 'NOT_RENDERED' }, outline: { propertyState: 'NOT_RENDERED' }, contentAlignment: 'MIDDLE' }, fields: 'shapeBackgroundFill,outline,contentAlignment' } });
        if (e.text) requests.push(...textRequests(e));
      } else if (e.type === 'line') {
        const t = transform(e.x + (e.flipX ? e.width : 0), e.y + (e.flipY ? e.height : 0));
        t.scaleX = e.flipX ? -1 : 1; t.scaleY = e.flipY ? -1 : 1;
        requests.push({ createLine: { objectId: e.id, lineCategory: 'STRAIGHT', elementProperties: { ...props(slide.id, e), transform: t } } });
        requests.push({ updateLineProperties: { objectId: e.id, lineProperties: { lineFill: { solidFill: { color: { rgbColor: rgb(e.color ?? 'accentAqua') }, alpha: 1 } }, weight: { magnitude: e.weight ?? 2, unit: 'PT' }, endArrow: e.arrow ? 'FILL_ARROW' : 'NONE' }, fields: 'lineFill,weight,endArrow' } });
      } else {
        requests.push({ createTable: { objectId: e.id, rows: e.rows.length, columns: e.rows[0].length, elementProperties: props(slide.id, e) } });
        requests.push({ updateTableColumnProperties: { objectId: e.id, columnIndices: e.rows[0].map((_, i) => i), tableColumnProperties: { columnWidth: { magnitude: e.width / e.rows[0].length, unit: 'PT' } }, fields: 'columnWidth' } });
        requests.push({ updateTableRowProperties: { objectId: e.id, rowIndices: e.rows.map((_, i) => i), tableRowProperties: { minRowHeight: { magnitude: e.height / e.rows.length, unit: 'PT' } }, fields: 'minRowHeight' } });
        e.rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
          const cellLocation = { rowIndex, columnIndex }, header = rowIndex === 0;
          if (value) requests.push(...textRequests({ id: e.id, text: value, role: 'bodyReference', fontSize: e.fontSize ?? profile.defaults.table.fontPt, bold: header, color: header ? profile.defaults.table.headerTextRole : 'inkDeep' }, cellLocation));
          requests.push({ updateTableCellProperties: { objectId: e.id, tableRange: { location: cellLocation, rowSpan: 1, columnSpan: 1 }, tableCellProperties: { tableCellBackgroundFill: { solidFill: { color: { rgbColor: rgb(header ? profile.defaults.table.headerFillRole : 'canvasPrimary') }, alpha: 1 } }, contentAlignment: 'MIDDLE' }, fields: 'tableCellBackgroundFill,contentAlignment' } });
        }));
      }
    }
  }
  return { brand: selection.brand, variant: selection.variant, profile: profile.id, contractDigest: digest({tokens,profile}), presentationId: deck.presentationId, writeControl: { requiredRevisionId: deck.revisionId }, requests, canvas, warnings, status: 'unreviewed draft', sceneDigest: digest(scene), templateDigest: digest(deck) };
}
function renderSceneHtml(scene, deck) {
  const { width, height } = validateScene(scene, deck);
  const element = e => {
    const placement = `left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px;`;
    if (e.type === 'line') {
      const x1 = e.flipX ? e.width : 0, x2 = e.flipX ? 0 : e.width, y1 = e.flipY ? e.height : 0, y2 = e.flipY ? 0 : e.height;
      return `<svg class="element" style="${placement}overflow:visible" viewBox="0 0 ${e.width} ${e.height}"><defs><marker id="arrow-${e.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6Z" fill="${role(e.color ?? 'accentAqua')}"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${role(e.color ?? 'accentAqua')}" stroke-width="${e.weight ?? 2}" ${e.arrow ? `marker-end="url(#arrow-${e.id})"` : ''}/></svg>`;
    }
    if (e.type === 'table') return `<table class="element" style="${placement}font-size:${e.fontSize ?? profile.defaults.table.fontPt}px">${e.rows.map((row, i) => `<tr style="height:${e.height / e.rows.length}px">${row.map(v => `<${i ? 'td' : 'th'}>${escape(v)}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>`;
    const s = style(e);
    return `<div class="element text" style="${placement}font-size:${s.fontSize}px;font-weight:${s.bold ? 700 : 400};color:${role(s.color)};background:${e.fill ? role(e.fill) : 'transparent'};text-align:${({ START: 'left', CENTER: 'center', END: 'right' })[e.align ?? 'START']};border-radius:${e.shape === 'ELLIPSE' ? '50%' : '0'}"><span>${escape(e.text ?? '')}</span></div>`;
  };
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(scene.title)}</title><style>
body{margin:0;background:#eee;color:${role('inkDeep')};font-family:Arial,sans-serif}header{padding:16px;font-size:16px}section{margin:24px auto;position:relative;width:${width}px;height:${height}px;background:${role('canvasPrimary')};box-shadow:0 2px 8px #0002;overflow:hidden}.element{position:absolute;box-sizing:border-box}.text{display:flex;flex-direction:column;justify-content:center;padding:3.6px;white-space:pre-wrap;overflow:hidden}.text span{width:100%;line-height:1.15}table{border-collapse:collapse;table-layout:fixed}td,th{padding:3.6px;border:1px solid ${role('canvasSecondary')};vertical-align:middle;text-align:left;white-space:pre-wrap;overflow-wrap:break-word}td{color:${role('inkDeep')};background:${role('canvasPrimary')}}th{background:${role(profile.defaults.table.headerFillRole)};color:${role(profile.defaults.table.headerTextRole)}}footer{padding:12px;text-align:center}@media print{header,footer{display:none}section{margin:0;box-shadow:none;break-after:page}@page{size:${width}px ${height}px;margin:0}}
</style><header>Content-area preview · unreviewed draft. Native template artwork, untouched content, and Google text metrics are not reproduced here. Inspect actual Google Slides before delivery.</header>${scene.slides.map(s => `<section aria-label="${escape(s.title)}" data-slide-id="${s.id}">${s.elements.map(element).join('')}</section>`).join('')}<footer>Evidence: ${scene.slides.map(s => escape(s.sources.join('; '))).join(' · ')}</footer></html>`;
}

return {validateScene,compileScene,renderSceneHtml,contract,digest};
}
