import {digest,canonicalDigest} from './common.mjs';
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
  'repetition-justification':'Across the whole deck, is equivalent geometry justified by comparable content or does a different relationship need recomposition?',
  'teaching-treatment':'These cards carry a mechanism as prose with nothing drawn between them. Does the treatment show the relationship the slide teaches, or must the learner rebuild it from the sentences? Name what the learner cannot see, or say why the cards teach it here. Boxes alone are not the defect.'
};
// Every prompt and judgement lands in one of these, so a caller can tell an asset failure from a design deviation, a teaching problem, a fit defect or an approved direct-text slide.
export const reviewCategories=['asset-failure','design-deviation','visual-teaching','fit-defect','direct-text'];
const assetCodes=new Set(['approved-asset-missing','approved-candidate-missing','icon-repeated','icon-alone','icon-two-meanings']);
const deviationCodes=new Set(['approved-diagram-not-drawn']);
const teachingCodes=new Set(['prose-cards','relational-text-only','sequence-without-edges','repeats-previous-layout','similar-geometry','similar-native-geometry','label-title','no-brief','no-direction','title-value-needs-support','text-only','dense-run','no-notes','text-density-review']);
export const findingCategory=code=>assetCodes.has(code)?'asset-failure':deviationCodes.has(code)?'design-deviation':teachingCodes.has(code)?'visual-teaching':'fit-defect';
const criterionCategories={'asset-purpose':'asset-failure','approved-design':'design-deviation','technical-fit':'fit-defect','rendered-text-completeness':'fit-defect','reading-order':'fit-defect','export-completeness':'fit-defect'};
export const criterionCategory=id=>criterionCategories[id]??'visual-teaching';
const textOf=e=>e.shape?.text?.textElements?.map(t=>t.textRun?.content??'').join('')??(e.table?.tableRows??[]).flatMap(r=>r.tableCells??[]).map(c=>(c.text?.textElements??[]).map(t=>t.textRun?.content??'').join('')).join('\n');
const allObjects=slide=>(slide.pageElements??slide.children??[]).flatMap(e=>[e,...(e.elementGroup?allObjects(e.elementGroup):[])]);
const pt=v=>v?.unit==='EMU'?(v.magnitude??0)/12700:v?.magnitude??0;
function box(e){const t=e.transform??{},w=pt(e.size?.width),h=pt(e.size?.height),x=pt({magnitude:t.translateX,unit:t.unit}),y=pt({magnitude:t.translateY,unit:t.unit});const points=[[0,0],[w,0],[0,h],[w,h]].map(([a,b])=>[x+a*(t.scaleX??1)+b*(t.shearX??0),y+a*(t.shearY??0)+b*(t.scaleY??1)]);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))];}
// designRevision is the session's revision of plan. Without it, the mapping may name either digest form of the plan.
export function auditNativeReview({snapshot,record,plan,mapping,designRevision}){
  if(snapshot.presentationId!==record.source.presentationId||snapshot.revisionId!==record.source.nativeRevision||!Array.isArray(snapshot.slides)||snapshot.slides.length!==record.slides.length)throw new Error('Native snapshot and rendered revision/coverage differ');
  if(!mapping||mapping.schema!==1||!(designRevision?[designRevision]:[canonicalDigest(plan),digest(plan)]).includes(mapping.planRevision)||!Array.isArray(mapping.slides)||mapping.slides.length!==plan.slides.length||new Set(mapping.slides.map(s=>s.id)).size!==mapping.slides.length||new Set(mapping.slides.map(s=>s.planId)).size!==mapping.slides.length)throw new Error('Map each native slide once to the current approved design');
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
  const report={schema:1,policy:3,sceneDigest:digest(snapshot),artifactDigest:digest(record.slides.map(s=>[s.id,s.imageSha256])),nativeRevision:snapshot.revisionId,presentationId:snapshot.presentationId,designRevision:mapping.planRevision,bindings,prompts,findings,deckReview:{groups},limitations:['Native text presence does not establish that all glyphs appear in exported pixels.','Object IDs/source coverage cannot automatically prove comprehension or factual support.','Offline snapshots do not certify an unchanged live Google revision.']};report.revision=digest(report);return report;
}
export function assessNativeCritique(quality,assessment){
  const result=assessCritique(quality,assessment);
  // Technical findings may share wording; content-specific creative approval may not be a bulk attestation.
  for(const criterion of ['composition-decision','explanatory-value','asset-purpose','rendered-text-completeness','approved-design','teaching-treatment']){
    const reasons=new Set();for(const slide of assessment.slides){const c=slide.checks.find(c=>c.criterion===criterion);if(c?.status!=='pass')continue;const reason=c.reason.trim().replace(/\s+/g,' ').toLowerCase();if(reasons.has(reason))throw new Error(`Use slide-specific evidence for ${criterion}; a duplicated bulk approval is insufficient`);reasons.add(reason);}
  }
  // A prose-card prompt is answered by looking at the cards: the judgement names at least one of them.
  for(const prompt of quality.prompts.filter(p=>p.proseCards)){const c=assessment.slides.find(s=>s.id===prompt.slide).checks.find(c=>c.criterion==='teaching-treatment');if(!c.objects.some(id=>prompt.proseCards.includes(id)))throw new Error(`Answer teaching-treatment on ${prompt.slide} about the cards it names: cite at least one of ${prompt.proseCards.join(', ')}`);}
  result.unresolved=result.unresolved.map(u=>({...u,category:criterionCategory(u.criterion)}));
  for(const finding of quality.findings.filter(f=>f.severity==='error'))result.unresolved.push({slide:finding.slide,criterion:'asset-purpose',status:'issue',detail:finding.detail,category:finding.category??findingCategory(finding.code)});
  result.complete=!result.unresolved.length;result.status=result.complete?'native creative critique recorded; pixel inspection and user review remain separate':'native creative critique unresolved';return result;
}

// Words that name a mechanism: something that moves, repeats, depends, owns or contains. A comparison or a list of peers is not one.
const mechanism=/cycle|loop|reconcil|sequence|order|flow|process|pipeline|step|stage|depend|caus|trigger|own|contain|hierarch|mechanism|lifecycle|hand-?off|interact|architecture|feedback|propagat|rout|transform|control/i;
const listed=items=>items.length<2?items.join(''):`${items.slice(0,-1).join(', ')} and ${items.at(-1)}`;
const inside=(a,b)=>a.x<=b.x+.5&&a.y<=b.y+.5&&a.x+a.width>=b.x+b.width-.5&&a.y+a.height>=b.y+b.height-.5;
// A compiled composition judged against its approved design, with the same criteria as a native deck.
// screens are compose preview's findings for this build; they are prompts to look, never approval.
export function auditCompositionReview({scene,structure,report,plan,designRevision,screens=[],binding,builtArtifactDigest,artifactDigest}){
  if(scene.slides.length!==plan.slides.length||scene.slides.some((s,i)=>s.id!==plan.slides[i].id))throw new Error('The compiled slides differ from the approved design');
  const findings=[],prompts=[],templated=new Set((structure.layouts??[]).filter(l=>l.layout!=='@subtitled').map(l=>l.slide)),direct=new Set(plan.slides.filter(s=>s.intent.visual.family==='text').map(s=>s.id));
  for(const f of screens){const {metrics:_,...finding}=f,category=findingCategory(f.code);findings.push({...finding,category:category==='visual-teaching'&&direct.has(f.slide)?'direct-text':category});}
  const assets=(report.inputs?.assets??[]).filter(a=>a.asset).map(({object,slide,asset,kind,sha256})=>({object,slide,asset,kind,sha256}));
  for(const [i,slide] of scene.slides.entries()){
    const proposed=plan.slides[i],family=proposed.intent.visual.family,body=slide.elements.filter(e=>e.role!=='title'&&e.text!==slide.title);
    // An icon placed by asset ID is listed with the assets, but it is drawn as an icon: placed holds the images.
    const edges=structure.connectors.filter(c=>c.slide===slide.id),icons=(structure.icons??[]).filter(c=>c.slide===slide.id),placed=assets.filter(a=>a.slide===slide.id&&a.kind!=='icon'),iconAsset=id=>assets.find(a=>a.kind==='icon'&&a.slide===slide.id&&a.object===id)?.asset;
    const shapes=body.filter(e=>e.type==='shape'),region=shapes.some(a=>shapes.some(b=>a!==b&&inside(a,b))),pictures=body.some(e=>['image','table','chart'].includes(e.type));
    // The approved asset is a fact about the build: it is there or it is not.
    const missing=['icon','sourced-image','generated-art'].includes(family)&&!(family==='icon'?icons.length:placed.length||body.some(e=>e.type==='image'));
    if(missing)findings.push({slide:slide.id,code:'approved-asset-missing',severity:'error',category:'asset-failure',detail:`The approved visual is ${family}, and the build places none on this slide. Place the approved asset, or propose the change for approval.`});
    const candidates=proposed.asset.disposition==='selected'?proposed.asset.candidates??[]:[];
    if(!missing&&candidates.length&&!candidates.some(c=>c.kind==='icon'?icons.some(x=>x.icon===c.ref||iconAsset(x.id)===c.assetId):placed.some(a=>a.asset===c.assetId)))findings.push({slide:slide.id,code:'approved-candidate-missing',severity:'warn',category:'asset-failure',detail:`None of the approved asset candidates (${candidates.map(c=>`${c.assetId}: ${c.concept}`).join('; ')}) is on this slide. Place one, or judge under asset-purpose why the slide teaches without it.`});
    // Prose cards: a mechanism the design describes, built as boxes of sentences with nothing drawn between them. A prompt for the reviewer, never a failure on its own.
    const cards=shapes.filter(e=>(e.text??'').trim().split(/\s+/).length>=3&&!/chevron|homePlate/i.test(e.shape??''));
    const relationship=proposed.intent.relationship.trim(),drawn=['diagram','regions'].includes(family);
    const prose=!direct.has(slide.id)&&!templated.has(slide.id)&&!['table','chart','quote'].includes(family)&&(drawn||mechanism.test(relationship))&&cards.length>=2&&!edges.length&&!region&&!pictures;
    if(prose){
      const labels=cards.map(e=>e.text.split('\n')[0].trim()),loop=/cycle|loop|reconcil|repeat|again/i.test(`${relationship} ${proposed.intent.takeaway}`);
      findings.push({slide:slide.id,objects:cards.map(e=>e.id),code:'prose-cards',severity:'warn',category:'visual-teaching',detail:`The approved relationship is "${relationship}", but ${listed(labels)} are ${cards.length} cards of prose with nothing drawn between them: no edge, region or picture shows how one leads to another. The learner has to rebuild the ${relationship} from the sentences${loop?', and nothing shows the step that closes the loop':''}. Say in teaching-treatment what the learner cannot see, or why the cards teach it here.`});
      if(drawn)findings.push({slide:slide.id,code:'approved-diagram-not-drawn',severity:'warn',category:'design-deviation',detail:`The approved treatment is a ${family}: "${proposed.composition}" The build draws no edge or region. Build the approved construction, or propose the change for approval.`});
    }
    const repeated=findings.some(f=>f.slide===slide.id&&['similar-geometry','repeats-previous-layout'].includes(f.code));
    const ids=[...new Set([...slide.elements.map(e=>e.id),...edges.map(e=>e.id),...icons.map(e=>e.id)])];
    prompts.push({slide:slide.id,title:slide.title,component:'composition',treatment:direct.has(slide.id)?'direct-text':family,intent:proposed.intent,sources:proposed.sources,objects:ids,
      expectedText:slide.elements.filter(e=>e.text?.trim()).map(e=>({object:e.id,text:e.text})),approvedCopy:proposed.visibleText,approvedComposition:proposed.composition,assetCandidate:proposed.asset,
      assetObjects:[...placed,...icons.map(c=>({object:c.id,icon:c.icon,...(iconAsset(c.id)?{asset:iconAsset(c.id)}:{})}))],...(prose?{proseCards:cards.map(e=>e.id)}:{}),
      criteria:Object.entries(questions).filter(([id])=>id==='repetition-justification'?repeated:id==='teaching-treatment'?prose:true).map(([id,question])=>({id,question}))});
  }
  const groups=[...new Set(findings.filter(f=>f.code==='similar-geometry').map(f=>JSON.stringify(f.relatedSlides)))].map(g=>JSON.parse(g));
  const quality={schema:1,policy:3,kind:'composition',sceneDigest:digest(scene),structureDigest:digest(structure),designRevision,build:binding,assets,builtArtifactDigest,artifactDigest,
    bindings:plan.slides.map(s=>({planId:s.id,slide:s.id})),prompts,findings,deckReview:{groups,questions:['What does each visual make easier to understand than the same words in a list?','Which repeated geometry supports comparison, and which different relationship needs recomposition?']},
    limitations:['Screens and prose-card prompts point at slides to look at; they do not judge comprehension.','The rendered deck is a LibreOffice render; verify fidelity in the target editor.']};
  quality.revision=digest(quality);return quality;
}
// The review in five categories: prompts from the build, judgements from the assessment, and the slides approved as direct text.
export function categorizeReview(quality,assessment){
  const categories=Object.fromEntries(reviewCategories.map(c=>[c,[]]));
  for(const f of quality.findings)categories[f.category??findingCategory(f.code)].push({slide:f.slide,kind:'prompt',code:f.code,severity:f.severity,detail:f.detail,...(f.objects?{objects:f.objects}:{})});
  let judged=null;if(assessment)try{judged=assessNativeCritique(quality,assessment);}catch{judged=null;}
  for(const u of judged?.unresolved??[])if(u.objects)categories[u.category].push({slide:u.slide,kind:'judgement',criterion:u.criterion,status:u.status,detail:u.detail,objects:u.objects});
  for(const p of quality.prompts)if(p.treatment==='direct-text'||p.intent?.visual?.family==='text')categories['direct-text'].push({slide:p.slide,kind:'treatment',purpose:p.intent.visual.purpose,reason:p.assetCandidate?.reason??null,accepted:judged?!judged.unresolved.some(u=>u.slide===p.slide):null});
  return {schema:1,categories,complete:judged?.complete??false};
}
