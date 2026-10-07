#!/usr/bin/env node
import { parseArgs, promisify } from 'node:util';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { json, saveJson, digest } from './lib/common.mjs';
import { contract, coverage, sceneFindings } from './lib/scene.mjs';
import { pptxTool } from './lib/presentation-tools.mjs';
import { initWorkspace, loadWorkspace, saveScene, restoreVersion, history, buildWorkspace, applyWorkspace, workspaceStatus } from './lib/workspace.mjs';
import { startStudio } from './lib/studio.mjs';
import { prepareReview, markReview } from './lib/slide-review.mjs';
import { snapshotDeck, copyGoogleDeck, googleSession } from './lib/google-slides.mjs';
import { request, checkDriveAccess, probeGooglePresentation, exportDeck, importDeck } from './google-drive-deck.mjs';
import { renderPptxScene, composePptx } from './lib/pptx-render.mjs';
import { install } from './install.mjs';
import { chooseTemplate } from './lib/template-routing.mjs';
import { searchRecipes } from './lib/layouts.mjs';
const exec=promisify(execFile);
export const help=`Harness Slides · brand-neutral editable decks
Usage: node scripts/harness-slides.mjs COMMAND ACTION [options]

  scene contract | validate --file scene.json [--required evidence.json]
  workspace init --project NEW_DIR --file scene.json [--format google-slides|pptx] [--template snapshot.json] [--source deck.pptx] [--required evidence.json]
  workspace status|history|build --project DIR
  workspace save --project DIR --file scene.json --expected DIGEST [--note TEXT]
  workspace restore --project DIR --version v000001 --expected DIGEST
  workspace repair --project DIR --slide ID
  workspace apply --project DIR [--dry-run]
  studio --project DIR [--port N]
  pptx inspect --file deck.pptx [--slide N] [--object ID] [--json]
  pptx patch --file original.pptx --plan patch.json --output new.pptx
  pptx compare --file original.pptx --after new.pptx [--allow changes.json]
  pptx render --file scene.json --output new.pptx
  pptx compose --plan composition.json --output new.pptx
  template inspect --file template.pptx --output contract.json
  template choose --file manifest.json [--id ID] [--query WORDS] [--format google-slides|pptx]
  layouts [--query WORDS] [--id ID] [--limit N]
  google snapshot --file-id ID --output snapshot.json
  google copy --file-id ID --name TITLE
  google previews --file-id ID --output NEW_DIR
  drive check | export --file-id ID --output deck.pptx | import --file deck.pptx [--name TITLE] [--folder-id ID]
  review --file deck.pptx | --previews native-previews.json --output DIR
  review --output DIR --mark 1,2 --revision HASH --note TEXT [--status reviewed|unresolved]
  icons copy --plan icon-copy.json
  doctor [--google-check] [--file-id ID]
  install [--dry-run] [--home DIR] [--shared DIR]

AI owns the scene. HTML previews are drafts; native renders and visual inspection are required.`;
export async function nativePreviews({fileId,output},deps={}) {
  if(!output)throw new Error('Choose a new preview output directory');
  const auth=await googleSession(deps),deck=await snapshotDeck(fileId,auth);
  output=resolve(output);await mkdir(output);
  try {
    const slides=[];
    for(const [i,s] of deck.slides.entries()) {
      const thumb=await(await request(`https://slides.googleapis.com/v1/presentations/${fileId}/pages/${s.objectId}/thumbnail?thumbnailProperties.mimeType=PNG&thumbnailProperties.thumbnailSize=LARGE`,{},auth)).json();
      const url=new URL(thumb.contentUrl);
      if(url.protocol!=='https:'||!(url.hostname.endsWith('.googleusercontent.com')||url.hostname==='googleusercontent.com'))throw new Error('Unexpected native preview host');
      // Signed thumbnail URLs do not receive an OAuth bearer token.
      const response=await (deps.imageFetcher??fetch)(url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('Native preview download failed');
      const data=Buffer.from(await response.arrayBuffer());
      if(data.length>20*1024*1024||!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Native preview must be a bounded PNG');
      const image=`slide-${i+1}.png`;await writeFile(join(output,image),data,{flag:'wx',mode:0o600});
      slides.push({id:s.objectId,title:`Slide ${i+1}`,hidden:false,image});
    }
    if((await snapshotDeck(fileId,auth)).revisionId!==deck.revisionId)throw new Error('Deck changed while rendering; prepare fresh native previews');
    const manifest={presentationId:fileId,revision:deck.revisionId,renderer:'Google Slides native thumbnail API',expectedSlideCount:slides.length,slides};
    await saveJson(join(output,'native-previews.json'),manifest);return {output,slides:slides.length,revision:deck.revisionId};
  }catch(error){await rm(output,{recursive:true,force:true});throw error;}
}
export async function main(argv=process.argv.slice(2)) {
  const {values:v,positionals:p}=parseArgs({args:argv,allowPositionals:true,options:Object.fromEntries([
    'file','after','allow','plan','output','project','format','template','source','required','expected','note','version','slide','object','previews','mark','revision','status','port','file-id','folder-id','name','home','shared','query','id','limit','soffice','pdftoppm','pdfinfo'
  ].map(k=>[k,{type:'string'}]).concat(['help','json','dry-run','refresh','google-check'].map(k=>[k,{type:'boolean'}])))});
  const [command,action,...extra]=p;
  if(!command||v.help||command==='help'){console.log(help);return;}
  if(extra.length)throw new Error('Too many actions');
  const single=['studio','review','doctor','install','layouts'];
  if(single.includes(command)&&action)throw new Error('This command has no action argument');
  const allowed={scene:{contract:[],validate:['file','required']},workspace:{init:['project','file','format','template','source','required'],save:['project','file','expected','note'],restore:['project','version','expected'],build:['project'],history:['project'],status:['project'],repair:['project','slide'],apply:['project','dry-run']},pptx:{inspect:['file','slide','object','json'],patch:['file','plan','output'],compare:['file','after','allow'],render:['file','output'],compose:['plan','output']},template:{inspect:['file','output'],choose:['file','id','query','format']},google:{snapshot:['file-id','output'],copy:['file-id','name'],previews:['file-id','output']},drive:{check:[],export:['file-id','output'],import:['file','name','folder-id']},icons:{copy:['plan']},studio:['project','port'],review:['file','previews','output','refresh','mark','revision','note','status','soffice','pdftoppm','pdfinfo'],doctor:['google-check','file-id'],install:['dry-run','home','shared'],layouts:['query','id','limit']}[command];
  const flags=Array.isArray(allowed)?allowed:allowed?.[action];
  if(!flags)throw new Error('Unknown command/action; run --help');
  for(const key of Object.keys(v))if(!flags.includes(key))throw new Error(`--${key} is not valid for this command`);
  if(command==='review'&&v.mark&&(v.file||v.previews||v.refresh))throw new Error('Prepare and mark are separate operations');
  let result;
  if(command==='scene'&&action==='contract'){console.log(contract);return;}
  if(command==='scene'&&action==='validate'){const s=await json(v.file);result={coverage:coverage(s,v.required?await json(v.required):[]),findings:sceneFindings(s)};}
  else if(command==='workspace') {
    if(action==='init')result=await initWorkspace({root:v.project,scene:await json(v.file),format:v.format,template:v.template,source:v.source,requiredSources:v.required?await json(v.required):[],base:dirname(resolve(v.file))});
    else if(action==='save')result=await saveScene({root:v.project,scene:await json(v.file),expectedDigest:v.expected,note:v.note});
    else if(action==='restore')result=await restoreVersion({root:v.project,id:v.version,expectedDigest:v.expected});
    else if(action==='build')result=await buildWorkspace({root:v.project});
    else if(action==='history')result=await history(resolve(v.project));
    else if(action==='status')result=await workspaceStatus(v.project);
    else if(action==='apply')result=await applyWorkspace({root:v.project,dryRun:v['dry-run']});
    else if(action==='repair'){const w=await loadWorkspace(v.project),slide=w.scene.slides.find(s=>s.id===v.slide);if(!slide)throw new Error('Unknown slide');result={version:w.current.id,expectedDigest:w.current.sceneDigest,slide,findings:sceneFindings(w.scene).filter(f=>f.slide===slide.id),next:'Patch only selected objects; save with expected digest, rebuild and render'};}
    else throw new Error('Unknown workspace action');
  } else if(command==='studio') {
    const studio=await startStudio({root:v.project,port:v.port?Number(v.port):0});console.log(`Harness Slides Studio: ${studio.url}\nPress Ctrl-C to stop.`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>studio.close().then(()=>process.exit()));return;
  } else if(command==='pptx') {
    if(action==='inspect'){const deck=await pptxTool('inspect',[v.file]);if(v.json)result=deck;else{const slides=v.slide?deck.slides.filter(s=>s.number===Number(v.slide)):deck.slides;result={sha256:deck.sha256,size:deck.size,slides:slides.map(s=>({number:s.number,id:s.id,title:s.title,objects:s.objects.filter(o=>!v.object||o.id===v.object).map(({id,name,type,text,box,contentHash})=>({id,name,type,text,box,contentHash}))}))};}}
    else if(action==='patch')result=await pptxTool('patch',[v.file,v.plan,v.output]);
    else if(action==='compare')result=await pptxTool('compare',[v.file,v.after,...(v.allow?[v.allow]:[])]);
    else if(action==='render')result=await renderPptxScene(await json(v.file),v.output,{base:resolve(v.file,'..')});
    else if(action==='compose')result=await composePptx({...await json(v.plan),output:v.output});
    else throw new Error('Unknown PPTX action');
  } else if(command==='template') {
    if(action==='inspect'){const d=await pptxTool('inspect',[v.file]);const c={version:1,sourceSha256:d.sha256,canvas:d.size,observedTokens:d.observedTokens,layouts:d.layouts,slides:d.slides.map(({id,number,title,objects,layoutPart})=>({id,number,title,objects,layoutPart})),authority:'Observed native source; a brand add-on supplies usage policy'};await saveJson(v.output,c);result={output:v.output,layouts:c.layouts.length,slides:c.slides.length};}
    else if(action==='choose')result=chooseTemplate(await json(v.file),{id:v.id,query:v.query,format:v.format});else throw new Error('Unknown template action');
  } else if(command==='google') {
    if(action==='snapshot'){const deck=await snapshotDeck(v['file-id'],await googleSession());await saveJson(v.output,deck);result={output:v.output,slides:deck.slides.length,revision:deck.revisionId};}
    else if(action==='copy')result=await copyGoogleDeck(v['file-id'],v.name,await googleSession());
    else if(action==='previews')result=await nativePreviews({fileId:v['file-id'],output:v.output});else throw new Error('Unknown Google action');
  } else if(command==='layouts')result=searchRecipes({query:v.query,id:v.id,limit:v.limit?Number(v.limit):3});
  else if(command==='drive') {
    if(action==='check')result=await checkDriveAccess();else if(action==='export')result=await exportDeck({fileId:v['file-id'],output:v.output});else if(action==='import')result=await importDeck({file:v.file,name:v.name,folderId:v['folder-id']});else throw new Error('Unknown Drive action');
  } else if(command==='review')result=v.mark?await markReview({output:v.output,revision:v.revision,numbers:v.mark.split(',').map(Number),note:v.note,status:v.status}):await prepareReview({file:v.file,previews:v.previews,output:v.output,refresh:v.refresh,soffice:v.soffice,pdftoppm:v.pdftoppm,pdfinfo:v.pdfinfo});
  else if(command==='icons'&&action==='copy')result=await pptxTool('icon-copy',[JSON.stringify(await json(v.plan))]);
  else if(command==='install')result=await install({home:v.home,shared:v.shared,dryRun:v['dry-run']});
  else if(command==='doctor'){
    const tools={};for(const tool of ['python3','soffice','pdftoppm','pdfinfo','gcloud'])try{const r=await exec(tool,['--version'],{timeout:10000});tools[tool]={available:true,version:(r.stdout||r.stderr).split('\n')[0]};}catch{tools[tool]={available:false};}
    result={node:process.version,tools,google:v['google-check']?{drive:await checkDriveAccess(),native:v['file-id']?await probeGooglePresentation(v['file-id']):'untested: provide --file-id'}:'not checked'};
  } else throw new Error('Unknown command; run --help');
  console.log(JSON.stringify(result,null,2));
  if(result?.preserved===false||result?.coverage?.complete===false)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
