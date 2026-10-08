import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileDeckPlan,inspectDeckPlan} from '../scripts/lib/deck-plan.mjs';
import {neutralBrandContract} from '../scripts/lib/brand-contract.mjs';
import {compileGoogleScene} from '../scripts/lib/google-slides.mjs';
import {auditSceneQuality} from '../scripts/lib/slide-quality.mjs';
import {inspectDelivery} from '../scripts/lib/delivery.mjs';
const candidate=JSON.parse(await readFile(new URL('../examples/quality-candidate.json',import.meta.url))),brand=await neutralBrandContract();
test('content-selected constructions expose supported edges, boundaries, open rows and editable art explanation',()=>{
 const {scene,report}=compileDeckPlan(candidate,brand);
 assert.equal(scene.slides.length,10);assert.equal(report.schema,2);
 assert.equal(scene.slides[0].elements.filter(e=>e.type==='line'&&e.arrow).length,4);
 assert.ok(scene.slides[1].elements.some(e=>e.text==='No'));
 assert.ok(scene.slides[2].elements.some(e=>e.text==='Customer team'));
 assert.ok(scene.slides[3].elements.some(e=>e.type==='image'&&e.alt));
 assert.ok(scene.slides[3].elements.some(e=>e.text?.includes('People still define goals')));
 assert.ok(scene.slides[4].elements.every(e=>e.type==='text'));
 assert.ok(!scene.slides[8].elements.some(e=>e.type==='shape'));
 assert.ok(!report.findings.some(f=>f.code==='contrast'));
 const noImage=structuredClone(scene);noImage.slides=noImage.slides.filter(s=>!s.elements.some(e=>e.type==='image'));
 const built=compileGoogleScene(noImage,{presentationId:'test_deck',revisionId:'r1',pageSize:{width:{magnitude:scene.canvas.width,unit:'PT'},height:{magnitude:scene.canvas.height,unit:'PT'}},slides:[]});
 assert.ok(built.requests.some(r=>r.createLine));assert.ok(built.requests.some(r=>r.insertText?.text==='writes'));
});
test('new decisions and construction contracts reject missing reasoning, fake evidence, invalid nodes and unknown variants',()=>{
 for(const mutate of [p=>delete p.slides[0].intent.visual,p=>delete p.slides[0].intent.alternative,p=>p.slides[0].intent.evidence=['fake'],p=>p.slides[0].component.panels[0].edges[0].to='missing',p=>p.slides[1].component.nodes[0].x=2,p=>p.slides[8].component.variant='rotate']){const p=structuredClone(candidate);mutate(p);assert.throws(()=>inspectDeckPlan(p));}
 const old=JSON.parse(JSON.stringify(candidate));old.schema=1;old.slides=old.slides.slice(4,5);delete old.assets;for(const k of ['audienceQuestion','alternative','visual'])delete old.slides[0].intent[k];assert.equal(compileDeckPlan(old,brand).report.schema,1);
});
test('geometry review catches alternating component names and accepts human justification of repeated conversations',async()=>{
 const baseline=JSON.parse(await readFile(new URL('../examples/quality-baseline.json',import.meta.url)));baseline.slides=baseline.slides.slice(5,8);baseline.slides[1].component={kind:'categories',items:baseline.slides[1].component.columns};baseline.slides[1].intent.relationship='categories';
 const built=compileDeckPlan(baseline,brand),q=await auditSceneQuality(built.scene,{designReport:built.report});
 assert.ok(q.findings.some(f=>f.code==='similar-geometry'));assert.equal(q.deckReview.groups[0].length,3);
 const c=compileDeckPlan(candidate,brand),cq=await auditSceneQuality(c.scene,{designReport:c.report});
 assert.ok(cq.prompts[7].criteria.some(c=>c.id==='repetition-justification'));
 assert.ok(cq.prompts[3].criteria.some(c=>c.id==='asset-purpose'));
});
test('PDF completeness exposes notes-dependent explanations, missing companions and invalid links without approving pixels',async()=>{
 const scene=compileDeckPlan(candidate,brand).scene;
 let result=await inspectDelivery({scene});assert.equal(result.findings.length,0);assert.match(result.status,/review required/);
 scene.slides[0].elements.find(e=>e.type==='text').text='Reasoning is in speaker notes. Source https://';scene.slides[0].notes='Required qualification.';
 result=await inspectDelivery({scene});assert.ok(result.findings.some(f=>f.status==='unresolved'));assert.ok(result.findings.some(f=>f.code==='invalid-link'));
 const withFile=await inspectDelivery({scene,companions:[new URL('../examples/quality-brief.md',import.meta.url).pathname]});assert.ok(withFile.companions[0].sha256);assert.equal(withFile.findings.find(f=>f.code==='explanation-access').status,'review-required');assert.match(withFile.status,/unresolved/);
 const native=await inspectDelivery({scene,format:'pptx'});assert.ok(!native.findings.some(f=>f.code==='notes-not-in-pdf'));
});

test('native diagram labels and image alt text are editable; source hyperlinks survive both compilers',async t=>{
 const {temporary}=await import('./fixtures.mjs'),{join}=await import('node:path'),{writeFile}=await import('node:fs/promises'),{renderPptxScene}=await import('../scripts/lib/pptx-render.mjs'),{pptxTool}=await import('../scripts/lib/presentation-tools.mjs');
 const dir=await temporary(t),scene=compileDeckPlan(candidate,brand).scene;scene.slides=scene.slides.slice(0,1);scene.slides[0].elements[0].href='https://github.com/dbbaskette/harness-slides-skill';
 const file=join(dir,'native.pptx');await renderPptxScene(scene,file);const before=await pptxTool('inspect',[file]),slide=before.slides[0],node=slide.objects.find(o=>o.text==='Client');assert.ok(node);
 const patch=join(dir,'patch.json');await writeFile(patch,JSON.stringify({sourceSha256:before.sha256,operations:[{slide:slide.id,object:node.id,expectedHash:node.contentHash,text:'Caller'}]}));const out=join(dir,'edited.pptx');await pptxTool('patch',[file,patch,out]);assert.ok((await pptxTool('inspect',[out])).slides[0].objects.some(o=>o.text==='Caller'));
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util'),exec=promisify(execFile);assert.match((await exec('unzip',['-p',out,'ppt/slides/_rels/slide1.xml.rels'])).stdout,/https:\/\/github.com/);
 const built=compileGoogleScene(scene,{presentationId:'test_deck',revisionId:'r1',pageSize:{width:{magnitude:scene.canvas.width,unit:'PT'},height:{magnitude:scene.canvas.height,unit:'PT'}},slides:[]});assert.ok(built.requests.some(r=>r.updateTextStyle?.style.link?.url===scene.slides[0].elements[0].href));
});

test('resolved generated art binds dimensions and receipt hashes; edited bytes invalidate provenance',async t=>{
 const {temporary}=await import('./fixtures.mjs'),{join}=await import('node:path'),{writeFile,copyFile}=await import('node:fs/promises'),{compileDeckFile}=await import('../scripts/lib/deck-plan.mjs');const dir=await temporary(t),plan=structuredClone(candidate);plan.slides=plan.slides.slice(3,4);const asset=Object.values(plan.assets)[0];
 asset.src=join(dir,'art.png');asset.metadata=join(dir,'art.image.json');await copyFile(new URL('../examples/assets/conceptual-greenhouse.png',import.meta.url),asset.src);await copyFile(new URL('../examples/assets/conceptual-greenhouse.image.json',import.meta.url),asset.metadata);const file=join(dir,'plan.json');await writeFile(file,JSON.stringify(plan));
 await compileDeckFile({file,output:join(dir,'built')});const report=JSON.parse(await readFile(join(dir,'built/design-report.json')));assert.equal(report.inputs.assets[0].provenance.width,2752);assert.ok(report.inputs.assets[0].metadataSha256);
 const bytes=await readFile(asset.src);bytes[bytes.length-1]^=1;await writeFile(asset.src,bytes);await assert.rejects(()=>compileDeckFile({file,output:join(dir,'changed')}),/provenance/);
});
