import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { loadWorkspace, saveScene, restoreVersion, buildWorkspace, workspaceStatus } from './workspace.mjs';
import { renderSceneHtml, codeSpans, withCodeTicks } from './scene.mjs';
import { escape, regularInside } from './common.mjs';
import {isCompositionProject,loadCompositionProject,compositionStatus,editCompositionProject,restoreCompositionProject,buildCompositionProject,editableCompositionObjects} from './composition-project.mjs';
const shell = token => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Harness Slides Studio</title><style>body{font:15px system-ui;margin:0;color:#222;background:#f4f5f7}header{padding:16px;background:white;border-bottom:1px solid #ddd}main{display:grid;grid-template-columns:minmax(240px,320px) 1fr;height:calc(100vh - 90px)}aside{padding:16px;overflow:auto}iframe{border:0;width:100%;height:100%}label{display:block;margin:12px 0 4px}input,textarea,select,button{box-sizing:border-box;max-width:100%;font:inherit;padding:7px}input,textarea{width:100%}button{margin:6px 4px 0 0}#message{white-space:pre-wrap;color:#333}#selection{font-weight:bold}</style><header><strong>Harness Slides</strong> · editable workspace <span id="version"></span><div>Scene preview is a draft. Inspect native target renders before delivery.</div></header><main><aside><p id="selection">Select an object in the preview</p><form id="editor"><label for="text">Text</label><textarea id="text" rows="4"></textarea><label for="x">X (points)</label><input id="x" type="number" step="0.1"><label for="y">Y (points)</label><input id="y" type="number" step="0.1"><label for="width">Width</label><input id="width" type="number" step="0.1"><label for="height">Height</label><input id="height" type="number" step="0.1"><button>Save new version</button></form><button id="build">Build native output</button><label for="history">Version history</label><select id="history"></select><button id="restore">Restore as new version</button><pre id="message" role="status"></pre></aside><iframe id="preview" title="Slide preview" sandbox="allow-scripts"></iframe></main><script>
const base='/${token}',frame=document.querySelector('#preview');let state,selected;
async function call(path,data){const r=await fetch(base+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const value=await r.json();if(!r.ok)throw new Error(value.error);return value;}
function show(message){document.querySelector('#message').textContent=message;}
async function load(){state=await call('/state');document.querySelector('#version').textContent=state.current.id;document.querySelector('#history').replaceChildren(...state.versions.map(v=>{const o=document.createElement('option');o.value=v.id;o.textContent=v.id+' · '+v.note;return o;}));document.querySelector('#history').value=state.current.id;frame.src=base+'/preview';selected=null;for(const key of ['x','y','width','height'])document.querySelector('#'+key).disabled=state.kind==='composition';show(state.status.status+'\\n'+(state.status.next||'Inspect native output before delivery.')+(state.status.findings?.length?'\\n'+state.status.findings.map(f=>(f.slide||'Slide')+': '+(f.note||f.detail||f.code)).join('\\n'):'')+(state.kind==='composition'?'\\nText edits reflow the composition. Ask your agent to change the layout.':''));}
const ticked=e=>{const text=e.text??'',esc=v=>v.replaceAll('\`','\\\`');let out='',at=0;for(const [a,b] of e.code??[]){out+=esc(text.slice(at,a))+'\`'+esc(text.slice(a,b))+'\`';at=b;}return out+esc(text.slice(at));};
window.addEventListener('message',event=>{if(event.source!==frame.contentWindow)return;const e=state.scene.slides.flatMap(s=>s.elements).find(e=>e.id===event.data?.object);if(!e)return;selected=e.id;document.querySelector('#selection').textContent=e.id;for(const key of ['text','x','y','width','height'])document.querySelector('#'+key).value=key==='text'?ticked(e):e[key]??'';document.querySelector('#text').disabled=state.kind==='composition'?!state.editable.includes(e.id):e.type!=='text'&&!e.text;});
document.querySelector('#editor').onsubmit=async event=>{event.preventDefault();try{if(!selected)throw new Error('Select an object');const fields=state.kind==='composition'?{}:Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(document.querySelector('#'+k).value)]));if(!document.querySelector('#text').disabled)fields.text=document.querySelector('#text').value;await call('/edit',{id:selected,fields,expectedDigest:state.current.sceneDigest});await load();show('Saved. Prior versions remain available; rebuild and review this version.');}catch(error){show(error.message);}};
document.querySelector('#build').onclick=async()=>{try{const r=await call('/build',{});show('Built '+r.build+'\\nUnreviewed draft: render and inspect native output.');}catch(error){show(error.message);}};
document.querySelector('#restore').onclick=async()=>{try{await call('/restore',{id:document.querySelector('#history').value,expectedDigest:state.current.sceneDigest});await load();}catch(error){show(error.message);}};
load().catch(error=>show(error.message));
</script></html>`;
export async function startStudio({root,port=0}) {
  const composition=await isCompositionProject(root),load=composition?loadCompositionProject:loadWorkspace,status=composition?compositionStatus:workspaceStatus,build=composition?()=>buildCompositionProject(root):()=>buildWorkspace({root}),restore=composition?restoreCompositionProject:restoreVersion;
  await load(root);const token=randomBytes(24).toString('hex'),prefix=`/${token}`;
  const server=createServer(async(req,res)=>{
    const send=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src 'self'; connect-src 'self'"});res.end(type==='application/json'?JSON.stringify(body):body);};
    try {
      if(!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))return send(403,{error:'Loopback only'});
      if(req.headers.host!==`127.0.0.1:${server.address().port}`)return send(403,{error:'Invalid host'});
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith(prefix+'/')&&url.pathname!==prefix)return send(404,{error:'Unknown workspace'});
      const path=url.pathname.slice(prefix.length);
      if(req.method==='GET'&&['','/'].includes(path))return send(200,shell(token),'text/html; charset=utf-8');
      if(req.method==='GET'&&path==='/state'){const w=await load(root);return send(200,{scene:w.scene,current:w.current,versions:w.versions,kind:composition?'composition':'scene',editable:composition?editableCompositionObjects(w.composition):null,format:w.manifest.format??'pptx',status:await status(root)});}
      if(req.method==='GET'&&path==='/status')return send(200,await status(root));
      if(composition&&req.method==='GET'&&/^\/assets\/[\w.-]+$/.test(path)){
        const w=await load(root),report=JSON.parse(await readFile(await regularInside(w.compiled,'compose-report.json'),'utf8')),name=path.slice(1);
        if(!report.inputs.assets.some(a=>a.path===name))return send(404,{error:'Unknown image'});
        return send(200,await readFile(await regularInside(w.compiled,name)),name.endsWith('.svg')?'image/svg+xml':name.endsWith('.png')?'image/png':'image/jpeg');
      }
      if(req.method==='GET'&&/^\/inputs\/images\/[a-f0-9]{64}\.(png|jpg|jpeg|svg)$/.test(path)) {
        const w=await loadWorkspace(root),name=path.slice(1);
        if(!w.manifest.assets?.[name])return send(404,{error:'Unknown image'});
        return send(200,await readFile(await regularInside(root,name)),path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/jpeg');
      }
      if(req.method==='GET'&&path==='/preview'){
        const {scene}=await load(root);const html=renderSceneHtml(scene)+`<script>document.addEventListener('click',event=>{const node=event.target.closest('[data-object-id]');if(node){document.querySelectorAll('.object').forEach(e=>e.style.outline='');node.style.outline='2px solid #E9692C';parent.postMessage({object:node.dataset.objectId},'*');}});</script>`;
        return send(200,html,'text/html; charset=utf-8');
      }
      if(req.method!=='POST')return send(405,{error:'Method not allowed'});
      if(req.headers.origin!==`http://127.0.0.1:${server.address().port}`)return send(403,{error:'Same-origin requests required'});
      if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024*1024)throw new Error('Request too large');}
      const data=JSON.parse(body||'{}');
      if(path==='/edit') {
        if(composition)return send(200,await editCompositionProject({...data,root}));
        const w=await loadWorkspace(root),scene=structuredClone(w.scene),e=scene.slides.flatMap(s=>s.elements).find(e=>e.id===data.id);
        if(!e)throw new Error('Unknown object');
        if(!data.fields||Object.keys(data.fields).some(k=>!['text','x','y','width','height'].includes(k)))throw new Error('Edit text and geometry only');
        // Edited words take code spans in backticks, as an author writes them. Words sent back as they were shown are
        // left alone, so a scene's own literal backticks survive a geometry save. A title takes no code span.
        const {text,...geometry}=data.fields;Object.assign(e,geometry);
        if(text!==undefined&&text!==withCodeTicks(e)){const words=codeSpans(text);if(words.code.length&&e.role==='title')throw new Error('A title is a plain-English claim: name the setting in words, and show the field, command or file name as a code span in the slide body');e.text=words.text;if(words.code.length)e.code=words.code;else delete e.code;}
        return send(200,await saveScene({root,scene,expectedDigest:data.expectedDigest,note:`Edited ${e.id}`}));
      }
      if(path==='/restore')return send(200,await restore({...data,root}));
      if(path==='/build')return send(200,await build());
      return send(404,{error:'Unknown operation'});
    }catch(error){return send(400,{error:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}${prefix}/`,close:()=>new Promise(resolve=>server.close(resolve))};
}
