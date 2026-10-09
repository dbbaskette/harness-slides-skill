import {digest} from './common.mjs';
import {assessCritique} from './slide-quality.mjs';
const questions={
  'title-support':'Does the title follow from the actual cited evidence and visible qualifications?',
  'visual-relationship':'Which native actors, containment or connections explain this relationship? Prose in boxes is not automatically a diagram.',
  'composition-decision':'Compare this composition with the strongest feasible alternative for the same content, not invented evidence or decorative artwork.',
  'explanatory-value':'What does the visual make easier to understand than reading the same words in a list?',
  'focal-hierarchy':'Identify the focal object and the meaning of each labeled region/color.',
  'asset-purpose':'Verify the specific approved icon/image/construction or no-asset decision, actual asset presence and provenance.',
  'reading-order':'Can the audience follow the takeaway, explanation and important caveats at delivery size?',
  'technical-fit':'Inspect actual native/export pixels for wrapping, contrast, spacing, aspect ratio and inherited font styles.',
  'rendered-text-completeness':'Compare expected native text with the image: are complete titles, heading prefixes, body labels and caveats visible?',
  'approved-design':'Does this delivered construction and asset purpose implement the user-approved design? Describe any material departure.',
  'repetition-justification':'Across the whole deck, is equivalent geometry justified by comparable content or does a different relationship need recomposition?'
};
const textOf=e=>e.shape?.text?.textElements?.map(t=>t.textRun?.content??'').join('')??(e.table?.tableRows??[]).flatMap(r=>r.tableCells??[]).map(c=>(c.text?.textElements??[]).map(t=>t.textRun?.content??'').join('')).join('\n');
const allObjects=slide=>(slide.pageElements??slide.children??[]).flatMap(e=>[e,...(e.elementGroup?allObjects(e.elementGroup):[])]);
const pt=v=>v?.unit==='EMU'?(v.magnitude??0)/12700:v?.magnitude??0;
function box(e){const t=e.transform??{},w=pt(e.size?.width),h=pt(e.size?.height),x=pt({magnitude:t.translateX,unit:t.unit}),y=pt({magnitude:t.translateY,unit:t.unit});const points=[[0,0],[w,0],[0,h],[w,h]].map(([a,b])=>[x+a*(t.scaleX??1)+b*(t.shearX??0),y+a*(t.shearY??0)+b*(t.scaleY??1)]);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))];}
export function auditNativeReview({snapshot,record,plan,mapping}){
  if(snapshot.presentationId!==record.source.presentationId||snapshot.revisionId!==record.source.nativeRevision||!Array.isArray(snapshot.slides)||snapshot.slides.length!==record.slides.length)throw new Error('Native snapshot and rendered revision/coverage differ');
  if(!mapping||mapping.schema!==1||mapping.planRevision!==digest(plan)||!Array.isArray(mapping.slides)||mapping.slides.length!==plan.slides.length||new Set(mapping.slides.map(s=>s.id)).size!==mapping.slides.length||new Set(mapping.slides.map(s=>s.planId)).size!==mapping.slides.length)throw new Error('Map each native slide once to the current approved design');
  const prompts=[],findings=[],geometries=new Map(),bindings=[],width=pt(snapshot.pageSize?.width),height=pt(snapshot.pageSize?.height);
  if(!(width>0&&height>0))throw new Error('Native snapshot needs its actual canvas size');
  for(const [i,slide] of snapshot.slides.entries()){
    if(record.slides[i].id!==slide.objectId)throw new Error('Native render order differs from the snapshot');
    const mapped=mapping.slides.find(s=>s.id===slide.objectId),proposed=plan.slides[i];
    if(!mapped||mapped.planId!==proposed.id)throw new Error('Native mapping/order differs from the approved design');
    const objects=allObjects(slide);if(objects.some(e=>!['shape','image','line','table','elementGroup','sheetsChart','video','wordArt'].some(k=>e[k])))throw new Error('Use a complete native snapshot; object payloads were omitted');const ids=objects.map(e=>e.objectId);if(!ids.length||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('Native slide needs actual unique object IDs');
    const texts=objects.map(e=>({object:e.objectId,text:textOf(e)})).filter(x=>x.text.trim());
    const geometry=JSON.stringify(objects.filter(e=>textOf(e).trim()!==proposed.title&&(!e.shape||e.shape.placeholder?.type!=='TITLE')).map(e=>[e.shape?'shape':e.image?'image':e.table?'table':e.line?'line':'group',...box(e).map((v,j)=>Math.round(v/(j%2?height:width)*50))]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
    if(!geometries.has(geometry))geometries.set(geometry,[]);geometries.get(geometry).push(slide.objectId);
    const assets=mapped.assets??[];
    for(const asset of assets){if(!['icon','sourced-image','generated-art'].includes(asset.family)||!ids.includes(asset.object)||!asset.provenance?.trim())throw new Error('Native assets need actual object IDs, family and retained provenance');const object=objects.find(e=>e.objectId===asset.object);if(asset.family!=='icon'&&!object.image)throw new Error('Illustration/image provenance must identify a native image object');}
    if(['icon','sourced-image','generated-art'].includes(proposed.intent.visual.family)&&!assets.some(a=>a.family===proposed.intent.visual.family))findings.push({slide:slide.objectId,code:'approved-asset-missing',severity:'error',detail:'Selected asset family is absent from actual native objects/provenance. Insert it or revise the proposal with user approval.'});
    if(texts.reduce((n,t)=>n+t.text.split(/\s+/).filter(Boolean).length,0)>60)findings.push({slide:slide.objectId,code:'text-density-review',severity:'info',detail:'Review delivery mode, explanatory construction and notes; density is a judgment, not a hard word quota.'});
    bindings.push({nativeId:slide.objectId,planId:proposed.id});
    prompts.push({slide:slide.objectId,title:proposed.title,component:'native-template',intent:proposed.intent,sources:proposed.sources,objects:ids,expectedText:texts,approvedCopy:proposed.visibleText,approvedComposition:proposed.composition,assetCandidate:proposed.asset,assetObjects:assets,criteria:Object.entries(questions).filter(([id])=>id!=='repetition-justification').map(([id,question])=>({id,question}))});
  }
  const groups=[...geometries.values()].filter(ids=>ids.length>=3);
  for(const group of groups)for(const id of group){prompts.find(p=>p.slide===id).criteria.push({id:'repetition-justification',question:questions['repetition-justification']});findings.push({slide:id,code:'similar-native-geometry',severity:'info',relatedSlides:group,detail:'Equivalent native geometry needs a content-specific deck-wide judgment; no automatic alternation.'});}
  const report={schema:1,policy:3,sceneDigest:digest(snapshot),artifactDigest:digest(record.slides.map(s=>[s.id,s.imageSha256])),nativeRevision:snapshot.revisionId,presentationId:snapshot.presentationId,designRevision:digest(plan),bindings,prompts,findings,deckReview:{groups},limitations:['Native text presence does not establish that all glyphs appear in exported pixels.','Object IDs/source coverage cannot automatically prove comprehension or factual support.','Offline snapshots do not certify an unchanged live Google revision.']};report.revision=digest(report);return report;
}
export function assessNativeCritique(quality,assessment){
  const result=assessCritique(quality,assessment);
  // Technical findings may share wording; content-specific creative approval may not be a bulk attestation.
  for(const criterion of ['composition-decision','explanatory-value','asset-purpose','rendered-text-completeness','approved-design']){
    const reasons=new Set();for(const slide of assessment.slides){const c=slide.checks.find(c=>c.criterion===criterion);if(c.status!=='pass')continue;const reason=c.reason.trim().replace(/\s+/g,' ').toLowerCase();if(reasons.has(reason))throw new Error(`Use slide-specific evidence for ${criterion}; a duplicated bulk approval is insufficient`);reasons.add(reason);}
  }
  for(const finding of quality.findings.filter(f=>f.severity==='error'))result.unresolved.push({slide:finding.slide,criterion:'asset-purpose',status:'issue',detail:finding.detail});
  result.complete=!result.unresolved.length;result.status=result.complete?'native creative critique recorded; pixel inspection and user review remain separate':'native creative critique unresolved';return result;
}
