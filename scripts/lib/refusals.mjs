// Refusals a caller can act on without reading stderr: one shape for design and compose, and later assets.
// Errors keep their human message; a code and the slide, asset or provider they concern travel with them.
export const refuse=(message,problem)=>Object.assign(new Error(message),{problem});
export const refuseAll=(message,problems)=>Object.assign(new Error(message),{problems});
// [recoverable, next]. Recoverable means the caller can fix its input or setup and retry with saved work and approvals intact.
const codes={
  'invalid-proposal':[true,'Correct the proposal and propose it again'],
  'copy-mismatch':[true,'Send copy without visibleText, or visibleText exactly as rendered from copy'],
  'copy-qualification-missing':[true,'Put the qualification in the slide copy, or agree a changed qualification with the person'],
  'asset-unresolved':[true,'Resolve the asset, or propose the fallback for approval'],
  'design-missing':[true,'Propose the design first with design propose'],
  'design-awaiting-approval':[true,'Show the pending slides and wait for the person\'s answer; design status has the current question'],
  'design-revision-requested':[true,'Revise the proposal from the recorded feedback and propose it again'],
  'design-revision-stale':[true,'Run design status and use its current revision and question'],
  'design-mismatch':[true,'Build the approved slides in the approved order with their approved titles, or propose the change for approval'],
  'design-state-invalid':[false,'The design record was changed outside Harness Slides; propose the design again in a fresh project'],
  'design-busy':[true,'Retry when the other design command ends. If none is running, a stopped process left .harness-slides/design/.lock behind: remove it and retry'],
  'invalid-response':[true,'Answer the current question with questionId, planRevision, a decision and the person\'s words'],
  'rendered-review-stale':[true,'Review the current render again, then design present'],
  'composition-invalid':[true,'Fix the composition and compile again'],
  'icon-unavailable':[true,'Search the brand icon library for a current native icon ID'],
  'layout-unavailable':[true,'Choose a layout listed by compose layouts'],
  'asset-missing':[true,'Restore the file or correct its path, then compile again'],
  'renderer-unavailable':[true,'Install the named tool, or preview with the other renderer'],
  'provider-failed':[true,'Check Google access with drive check, or preview with --renderer local'],
  'render-failed':[true,'Open the built deck to find the problem, then preview again'],
  'output-exists':[true,'Choose a new output directory'],
  'input-missing':[true,'Check the path given on the command line'],
  'input-invalid':[true,'Correct the input named in the detail and retry'],
  unclassified:[false,'Read the detail; ask the person before working around it'],
};
// Errors raised before this contract existed are recognised by their wording, which their tests already fix.
const known=[
  [/Question or design revision changed|Design revision changed|Approved design revision changed|No existing design revision/,'design-revision-stale'],
  [/Awaiting design approval/,'design-awaiting-approval'],
  [/differs? from the approved design|Generate only the selected approved/,'design-mismatch'],
  [/New creative authoring needs --design-project/,'design-missing'],
  [/changed outside the checkpoint|real directories|Expected a regular workspace file|Path must stay inside/,'design-state-invalid'],
  [/Record the actual user response|Unknown design response|Autonomy is chosen|Only explicit whole-plan/,'invalid-response'],
  [/Rendered review changed|Present requires|Rendered slides must map|Rendered coverage differs/,'rendered-review-stale'],
  [/Poppler/,'renderer-unavailable','poppler'],
  [/LibreOffice \(soffice\) is not installed/,'renderer-unavailable','libreoffice'],
  [/gcloud|Google API|Drive /,'provider-failed','google'],
  [/Local render failed|LibreOffice finished without|page count of the render|The render has \d+ pages/,'render-failed'],
  [/unknown icon|is a picture, not native|no drawing in the library|hashed icon library/,'icon-unavailable'],
  [/template layout|no layout named|subtitle placeholders|no picture slot|layout with a title/,'layout-unavailable'],
];
function classify(error){
  if(error instanceof SyntaxError)return {code:'input-invalid'};
  if(error.code==='EEXIST')return String(error.path).endsWith('.lock')?{code:'design-busy'}:{code:'output-exists'};
  if(error.code==='ENOENT')return String(error.path).endsWith('session.json')?{code:'design-missing'}:{code:'input-missing'};
  const hit=known.find(([pattern])=>pattern.test(error.message));
  return hit?{code:hit[1],provider:hit[2]??null}:{code:'unclassified'};
}
function shape(problem,detail){
  const code=Object.hasOwn(codes,problem.code)?problem.code:'unclassified',[recoverable,next]=codes[code];
  return {code,slide:problem.slide??null,asset:problem.asset??null,provider:problem.provider??null,detail:problem.detail??detail,recoverable:problem.recoverable??recoverable,next:problem.next??next,...(problem.fallback?{fallback:{...problem.fallback,needsApproval:true}}:{})};
}
export function problemsOf(error){
  if(Array.isArray(error.problems)&&error.problems.length)return error.problems.map(p=>shape(p,error.message));
  return [shape(error.problem??classify(error),error.message)];
}
// A fallback is only a proposal: it needs the person's approval like any other design change.
export const refusal=(error,designRevision=null)=>({schema:1,status:'blocked',designRevision,problems:problemsOf(error)});

// Composition problems arrive as "where: message" lines; where is a slide, an element, or slide/element.
export function compositionProblems(lines,comp){
  const slides=new Set(),owner=new Map(),walk=(node,slide)=>{if(!node||typeof node!=='object')return;if(typeof node.id==='string')owner.set(node.id,slide);for(const child of [...(Array.isArray(node.children)?node.children:[]),node.hub])walk(child,slide);};
  for(const s of Array.isArray(comp?.slides)?comp.slides:[])if(s&&typeof s.id==='string'){slides.add(s.id);walk(s.canvas,s.id);for(const e of Array.isArray(s.connect)?s.connect:[])if(typeof e?.id==='string')owner.set(e.id,s.id);}
  return lines.map(line=>{
    const [,where='',element]=line.match(/^([\w-]+)(?:\/([\w-]+))?: /)??[],slide=slides.has(where)?where:owner.get(where)??null,{code,provider}=classify(new Error(line));
    const icon=code==='icon-unavailable'?line.match(/icon (\S+)/)?.[1]??null:null;
    return {code:code==='unclassified'?'composition-invalid':code,slide,asset:icon,provider,detail:line};
  });
}
