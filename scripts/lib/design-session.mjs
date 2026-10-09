// Host-neutral checkpoints. Only actual human responses may populate production replies.
import {mkdir,lstat,readFile,writeFile,rename,rm,open} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest,regularInside} from './common.mjs';
import {validateSlideDecision} from './slide-decisions.mjs';
const text=(v)=>typeof v==='string'&&v.trim()&&v.length<=20000;
const fields=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
const recordPath='.harness-slides/design/session.json';
export function validateDesignProposal(plan){
  if(!fields(plan,['schema','title','scope','slides'])||plan.schema!==1||!text(plan.title)||!['new','redesign'].includes(plan.scope)||!Array.isArray(plan.slides)||!plan.slides.length||plan.slides.length>100)throw new Error('Design proposal needs schema:1, title, scope:new|redesign and 1–100 slides');
  const ids=new Set();
  for(const s of plan.slides){
    if(!fields(s,['id','title','sources','intent','visibleText','composition','asset'])||!/^[_a-zA-Z][\w-]{4,63}$/.test(s.id??'')||ids.has(s.id)||!text(s.title)||!text(s.visibleText)||!text(s.composition)||!Array.isArray(s.sources)||!s.sources.length||s.sources.some(x=>!text(x)))throw new Error('Each design slide needs a unique ID, title, visible copy, composition and source/brief IDs');
    ids.add(s.id);validateSlideDecision(s.intent,s.sources,{required:true});
    if(!fields(s.asset,['description','disposition','reason'])||!text(s.asset.description)||!['selected','not-needed','unavailable'].includes(s.asset.disposition)||!text(s.asset.reason))throw new Error('Describe a specific asset candidate or construction and its selected/not-needed/unavailable decision');
    if(s.asset.disposition!=='selected'&&['icon','sourced-image','generated-art'].includes(s.intent.visual.family))throw new Error('An unresolved asset cannot be the selected visual; propose an explicit fallback for approval');
  }
  return plan;
}
async function directory(path){const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Design state needs real directories');}
async function locked(project,action){
  project=resolve(project);await directory(project);
  for(const name of ['.harness-slides','.harness-slides/design']){const path=join(project,name);await mkdir(path,{recursive:true,mode:0o700});await directory(path);}
  const dir=join(project,'.harness-slides/design'),lock=await open(join(dir,'.lock'),'wx',0o600);
  try{return await action(project,dir);}finally{await lock.close();await rm(join(dir,'.lock'));}
}
async function readSession(project){
  const value=JSON.parse(await readFile(await regularInside(project,recordPath),'utf8'));
  if(value.schema!==1||value.tool!=='harness-slides-design'||value.revision!==digest(value.plan))throw new Error('Design state changed outside the checkpoint; recover the proposal');
  validateDesignProposal(value.plan);return value;
}
async function save(project,dir,value){
  const target=join(project,recordPath);try{await regularInside(project,recordPath);}catch(e){if(e.code!=='ENOENT')throw e;}
  const temp=join(dir,`${randomUUID()}.tmp`);
  try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temp,target);}finally{await rm(temp,{force:true});}
  return statusOf(value);
}
const binding=(session,s)=>digest([session.plan.title,session.plan.scope,session.plan.slides.map(x=>x.id),s]);
function pending(session){return session.plan.slides.filter(s=>session.approvals[s.id]?.binding!==binding(session,s));}
function questionFor(session){
  if(session.awaitingRevision)return null;
  const phase=pending(session).length?'design':'rendered';
  if(phase==='rendered'&&!session.rendered)return null;
  const left=phase==='design'?pending(session):session.plan.slides.filter(s=>!session.rendered.approved.includes(s.id));
  if(!left.length)return null;
  const ids=(session.mode==='guided'?left.slice(0,1):left).map(s=>s.id);
  const revision=phase==='design'?session.revision:session.rendered.binding;
  return {id:digest([phase,session.revision,revision,ids]),phase,revision,planRevision:session.revision,slides:ids,
    prompt:phase==='design'?`Approve the proposed design for ${ids.map(id=>session.plan.slides.find(s=>s.id===id).title).join('; ')}, or request changes?`:`Approve the rendered slides for ${ids.map(id=>session.plan.slides.find(s=>s.id===id).title).join('; ')}, or request revisions?`,
    options:phase==='design'?['Approve this design','Change this design','Review remaining designs together']:['Approve these slides','Request revisions','Review remaining slides together'],
    wait:true,rule:'Use an available native question tool; otherwise ask in chat. Async return, defaults and elapsed time are not approval.'};
}
function statusOf(session){
  const waiting=pending(session),question=questionFor(session);
  return {project:session.project,revision:session.revision,mode:session.mode,buildAllowed:!waiting.length&&!session.awaitingRevision,pending:waiting.map(s=>s.id),
    status:session.awaitingRevision?'revision requested':waiting.length?'awaiting design approval':!session.rendered?'design approved; build permitted':session.rendered.waived?'rendered user review explicitly waived':session.rendered.approved.length===session.plan.slides.length?'rendered user review approved':'awaiting rendered user review',
    feedback:session.feedback,question,slides:question?.phase==='design'?session.plan.slides.filter(s=>question.slides.includes(s.id)).map((s,i)=>({number:session.plan.slides.findIndex(x=>x.id===s.id)+1,...s})):question?.slides.map(id=>({id,image:session.rendered.images[id]}))??[],
    renderedRevision:session.rendered?.revision??null,renderedReview:session.rendered?.review??null,renderedAcceptance:Boolean(session.rendered&&(session.rendered.waived||session.rendered.approved.length===session.plan.slides.length))};
}
export async function proposeDesign({project,plan,expected}){
  validateDesignProposal(plan);return locked(project,async(root,dir)=>{
    let old;try{old=await readSession(root);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(old&&expected!==old.revision)throw new Error('Design revision changed; use the current expected revision');
    if(!old&&expected)throw new Error('No existing design revision');
    const revision=digest(plan),session={schema:1,tool:'harness-slides-design',project:root,plan:structuredClone(plan),revision,mode:old?.mode??'guided',approvals:old?.approvals??{},feedback:old?.feedback??[],responses:old?.responses??[],rendered:old?.revision===revision?old.rendered:null,waiveRendered:old?.waiveRendered??false};
    // An unchanged resubmission is not a fix or approval of requested revisions.
    if(old?.awaitingRevision&&old.revision===revision)session.awaitingRevision=true;
    if(old?.revision!==revision){session.waiveRendered=false;session.responses.push({kind:'proposal',revision,at:new Date().toISOString()});}
    return save(root,dir,session);
  });
}
export async function designStatus(project){const session=await readSession(resolve(project));if(session.rendered){const {verifyReview}=await import('./slide-review.mjs');const record=await verifyReview(session.rendered.review);if(record.revision!==session.rendered.revision||record.creativeQuality?.revision!==session.rendered.qualityRevision||!record.visualReviewComplete||!record.creativeReviewComplete)throw new Error('Rendered review changed; present current output before user approval');}return statusOf(session);}
export async function getApprovedDesign(project,{revision,slideIds}={}){
  const session=await readSession(resolve(project));
  if(revision&&session.revision!==revision)throw new Error('Approved design revision changed; recheck the proposal');
  if(pending(session).length||session.awaitingRevision)throw new Error('Awaiting design approval; show the proposed slide(s) and wait for an actual user response before building');
  if(slideIds&&(slideIds.length!==session.plan.slides.length||slideIds.some((id,i)=>id!==session.plan.slides[i].id)))throw new Error('Authored slide IDs/order differ from the approved design');
  return {plan:session.plan,revision:session.revision};
}
export async function respondDesign({project,reply}){
  if(!fields(reply,['questionId','planRevision','decision','feedback','waiveRendered'])||!text(reply.feedback)||typeof reply.waiveRendered!=='undefined'&&typeof reply.waiveRendered!=='boolean')throw new Error('Record the actual user response text, questionId, planRevision and decision');
  return locked(project,async(root,dir)=>{
    const session=await readSession(root),question=questionFor(session);
    if(question?.phase==='rendered'){const {verifyReview}=await import('./slide-review.mjs');const record=await verifyReview(session.rendered.review);if(record.revision!==session.rendered.revision||record.creativeQuality?.revision!==session.rendered.qualityRevision||!record.visualReviewComplete||!record.creativeReviewComplete)throw new Error('Rendered review changed; present current output');}
    if(!question||reply.questionId!==question.id||reply.planRevision!==session.revision)throw new Error('Question or design revision changed; do not apply a stale/default response');
    if(!['approve','revise','batch','approve-remaining','autonomous'].includes(reply.decision))throw new Error('Unknown design response');
    if(reply.decision==='autonomous'&&question.phase!=='design')throw new Error('Autonomy is chosen before construction; approve or revise rendered output');
    if(reply.waiveRendered&&!(question.phase==='design'&&['autonomous','approve-remaining'].includes(reply.decision)))throw new Error('Only explicit whole-plan/autonomous authorization can waive the rendered checkpoint');
    session.responses.push({...reply,phase:question.phase,slides:question.slides,at:new Date().toISOString()});
    if(reply.decision==='batch')session.mode='batch';
    else if(reply.decision==='revise'){
      session.feedback.push({phase:question.phase,slides:question.slides,text:reply.feedback,revision:session.revision,renderRevision:session.rendered?.revision??null});session.awaitingRevision=true;
      for(const id of question.slides)delete session.approvals[id];session.rendered=null;session.waiveRendered=false;
    }else if(question.phase==='design'){
      const selected=['approve-remaining','autonomous'].includes(reply.decision)?session.plan.slides:session.plan.slides.filter(s=>question.slides.includes(s.id));
      for(const s of selected)session.approvals[s.id]={binding:binding(session,s),response:reply.feedback};
      if(reply.decision==='autonomous')session.mode='autonomous';
      session.waiveRendered=reply.waiveRendered??session.waiveRendered;
    }else{
      const selected=reply.decision==='approve-remaining'?session.plan.slides.map(s=>s.id):question.slides;
      session.rendered.approved=[...new Set([...session.rendered.approved,...selected])];
    }
    return save(root,dir,session);
  });
}
export async function presentDesign({project,review,revision}){
  return locked(project,async(root,dir)=>{
    const session=await readSession(root);await getApprovedDesign(root);
    review=resolve(review);const record=JSON.parse(await readFile(await regularInside(review,'review.json'),'utf8'));
    if(record.revision!==revision||!record.visualReviewComplete||!record.creativeReviewComplete||record.designRevision!==session.revision||!record.designBinding)throw new Error('Present requires current pixel inspection and structured creative review bound to this design');
    const {verifyReview}=await import('./slide-review.mjs');await verifyReview(review,record);if(!record.visualReviewComplete||!record.creativeReviewComplete)throw new Error('Present requires verified pixel and creative receipts');
    const images={};for(const slide of record.slides){const id=record.designBinding.find(x=>x.nativeId===slide.id)?.planId;if(!id||images[id])throw new Error('Rendered slides must map once to the approved design');images[id]=join(review,slide.image);}
    if(Object.keys(images).length!==session.plan.slides.length)throw new Error('Rendered coverage differs from the approved plan');
    const renderBinding=digest([revision,record.creativeQuality.revision,images]);
    if(session.rendered?.binding!==renderBinding)session.rendered={revision,binding:renderBinding,qualityRevision:record.creativeQuality.revision,review,images,approved:[],waived:session.waiveRendered};
    return save(root,dir,session);
  });
}

export async function requireSceneDesign(scene,project,revision){
  const creative=scene.slides.some(s=>s.intent);
  if(!project){if(creative)throw new Error('New creative authoring needs --design-project and actual design approval');return null;}
  const approved=await getApprovedDesign(project,{revision,slideIds:scene.slides.map(s=>s.id)});
  for(const [i,s] of scene.slides.entries())if(s.title!==approved.plan.slides[i].title||s.intent&&digest(s.intent)!==digest(approved.plan.slides[i].intent))throw new Error('Title/intent differs from the approved design; revise the proposal before construction');
  return approved;
}
