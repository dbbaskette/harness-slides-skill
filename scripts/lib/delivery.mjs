import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateScene} from './scene.mjs';
import {digest,hash} from './common.mjs';
// Completeness screening never certifies visual inspection or semantic adequacy.
export async function inspectDelivery({scene,format='pdf',companions=[]}) {
  validateScene(scene);if(!['pdf','pptx','google-slides'].includes(format))throw new Error('Choose pdf|pptx|google-slides');
  const files=[];for(const item of companions){const path=resolve(item),st=await lstat(path);if(!st.isFile()||st.isSymbolicLink()||st.size>20*1024*1024)throw new Error('Use bounded regular companion files');files.push({path,sha256:hash(await readFile(path))});}
  const findings=[],links=[];
  for(const slide of scene.slides){const visible=slide.elements.flatMap(e=>e.rows?e.rows.flat():e.text?[e.text]:[]).join('\n');
    if(format==='pdf'&&/(?:in (?:the )?notes|speaker notes|research report|companion)/i.test(visible))findings.push({slide:slide.id,code:'explanation-access',status:files.length?'review-required':'unresolved',detail:files.length?'Companion exists; verify it contains the referenced explanation and is delivered accessibly':'The PDF references inaccessible material. Make essential meaning visible or deliver an authorized companion.'});
    if(format==='pdf'&&slide.notes?.trim())findings.push({slide:slide.id,code:'notes-not-in-pdf',status:'review-required',detail:'Judge whether these notes contain material explanation/caveats needed in the PDF; do not move content without scope.'});
    for(const e of slide.elements.filter(e=>e.href))links.push({slide:slide.id,object:e.id,url:e.href,syntaxValid:true,status:'destination access not checked'});
    for(const match of visible.matchAll(/https?:\/\/[^\s<>]*/g)) {const url=match[0].replace(/[).,;]+$/,'');let valid=false;try{valid=['http:','https:'].includes(new URL(url).protocol);}catch{}links.push({slide:slide.id,url,syntaxValid:valid,status:'destination access not checked'});if(!valid)findings.push({slide:slide.id,code:'invalid-link',status:'unresolved',detail:url});}
  }
  const payload={schema:1,sceneDigest:digest(scene),format,companions:files,slideOrder:scene.slides.map(s=>s.id),findings,links,questions:['Are claim-changing caveats and essential reasoning visible or in the delivered accessible companion?','Do source captions and appendix cover every retained claim; do actual hyperlink destinations work?','Have every exported page and its order/count been inspected at readable size?'],status:findings.some(f=>f.status==='unresolved')?'delivery unresolved':'screened; content/access and actual export visual review required'};
  return {...payload,revision:digest(payload)};
}
