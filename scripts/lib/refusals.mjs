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
  'asset-file-missing':[true,'Restore the file at its recorded path, or record the asset again with assets add-supplied'],
  'asset-hash-changed':[true,'Look at the changed file; if it is right, record it again (assets add-supplied, assets icon --brand or images generate), then retry'],
  'asset-conflict':[true,'Choose a new asset ID with --id, or record the same file and kind again'],
  'assets-busy':[true,'Retry when the other asset command ends. If none is running, remove .harness-slides/assets.lock and retry'],
  'provider-missing':[true,'Set up the provider named in provider (images status says what is missing), or record a supplied image with assets add-supplied'],
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
  [/is not in the project's asset manifest|needs the project that records it|resolves through the project's asset manifest/,'asset-unresolved'],
  [/is missing from the project/,'asset-file-missing'],
  [/changed since it was recorded/,'asset-hash-changed'],
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
    const asset=code==='icon-unavailable'?line.match(/icon (\S+)/)?.[1]??null:code.startsWith('asset-')?line.match(/asset (\S+)/)?.[1]??null:null;
    return {code:code==='unclassified'?'composition-invalid':code,slide,asset,provider,detail:line};
  });
}

// Image provider errors carry a code of their own. Setup the caller lacks is provider-missing; a provider that answered badly is provider-failed.
// Their message already says what to do, so it is the next step. An uncertain send needs a person to check before anything is retried.
const providerMissing=new Set(['key_required','setup_required','python_311_required','runtime_unavailable','requires_macos_or_linux','auth_required']);
const providerFailed=new Set(['key_rejected','billing_required','model_unavailable','rate_limited','api_refused','network_unavailable','no_image_returned','expected_one_generated_image','generation_uncertain','download_failed','operation_timeout','invalid_worker_response','runtime_setup_failed','image_operation_failed','busy']);
export function imageProblem(error,{provider='gemini-api',asset=null,slide=null}={}){
  const code=providerMissing.has(error.code)?'provider-missing':providerFailed.has(error.code)?'provider-failed':error.code==='output_exists'?'output-exists':'input-invalid';
  return {code,provider,asset,slide,next:error.message,...(error.code==='generation_uncertain'?{recoverable:false}:{})};
}
