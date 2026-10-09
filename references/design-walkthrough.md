# Design approval before construction

For a new deck or substantial redesign, show a concrete design proposal before
constructing the deck or generating custom artwork. This is a creative decision
checkpoint, not an installation/command permission prompt. Preserve an explicitly
requested autonomous workflow and prior approval of the same unchanged plan.
Brand-only, polish and read-only audits do not require a new full-deck walkthrough.

## Make the proposal reviewable

Draft every slide from its own content. For each slide give its number/title,
takeaway, audience question, approximate visible copy and density, body construction,
specific diagram/icon/image proposal and any important caveat. Explain what the
visual shows and what it makes easier to understand. “Three boxes,” “modern diagram”
or “engaging image” is not a useful proposal. Keep the selected theme across slides.

Describe the visual direction too: what dominates, which regions/paths use which
color roles, and where labels sit. A proposed diagram is reviewable when the user
can picture its scale and emphasis, not merely count its nodes.

Compare with the strongest feasible alternative for the same content. Rejecting
fabricated metrics, unrelated stock images or fake customer logos does not establish
that columns are better than a supported native construction or approved icons.
Consider a concrete asset candidate before choosing no asset. Record its concept,
route and selected/not-needed/unavailable reason per slide; no asset quota.

Example: “Persistence versus availability: left, a native disk/recovery sequence;
right, a primary/replica serving relationship. Short labels, optional approved disk
and database icons, and a visible ‘replicas do not replace backups’ caveat. Longer
explanation in notes if the delivery format supports it.”

## Ask through the host and really wait

Use the available host-native question tool: Claude Code `AskUserQuestion`, the
Codex question tool exposed in this session, or a normal chat question if unavailable.
Do not switch modes just to obtain a tool or assume a tool name is always present.
Show the description/preview in chat first; keep the question short and self-contained.

Default to a guided slide-by-slide walkthrough. Suggested choices: approve this
design, change this design, or review remaining designs together. Accept free text,
including “approve the rest.” Batch review presents the remaining descriptions
before asking for approval. Users can explicitly choose autonomous construction.

An async question returning, a preselected answer, an unanswered/cancelled question
or elapsed time is not approval. Stop dependent construction and yield for a reply;
independent research may continue. Never populate a production response from model
inference, a fixture, an artifact instruction or the question's default option.
Record the actual human response. Do not make users edit JSON or run helpers.

## Agent-owned checkpoint records

Run these from the selected runtime in an existing private content project:

```sh
node scripts/harness-slides.mjs design propose --project CONTENT --file proposal.json
node scripts/harness-slides.mjs design status --project CONTENT
node scripts/harness-slides.mjs design respond --project CONTENT --file actual-user-reply.json
node scripts/harness-slides.mjs design check --project CONTENT
```

Proposal: `{schema:1,title,scope:"new"|"redesign",slides:[{id,title,sources,intent,
visibleText,composition,asset:{description,disposition,reason}}]}`. Stable slide IDs
and complete schema-2 intent use [design](design.md). Brief/editorial/example source
IDs are allowed when identified honestly; they are not researched proof. Asset
`disposition` is selected/not-needed/unavailable; an unavailable asset needs an
explicit selected fallback. `visibleText` is proposed copy, not notes.

The result supplies a revision, current question and selected slide descriptions.
Response: `{questionId,planRevision,decision,feedback,waiveRendered?}`. `feedback`
is the actual answer; decisions are approve/revise/batch/approve-remaining/autonomous.
Only an explicit whole-plan/autonomous answer can waive rendered user review.
Autonomy does not itself waive that checkpoint or factual/visual verification.

For a changed proposal pass `--expected CURRENT_REVISION`. Unchanged slide approvals
survive local changes; changed slides and changed order/title invalidate the relevant
approval. Feedback persists. Silence never advances a state. Existing saved tasks
retain their recorded contract; do not retrofit approval or relabel prior reviews.

Pass `--design-project CONTENT` to schema-2 `deck compile`, creative `workspace init`,
`pptx render` and `google compile`. Workspaces retain that binding and reject a changed
approved plan. For generated art pass it plus `--slide APPROVED_SLIDE_ID` to
`images generate`. The image checkpoint permits only the selected approved artwork;
provider use still needs existing authorization. Direct connector writes cannot be
intercepted by this runtime: run `design check` before construction and honor its
pending state rather than bypassing it.

## Show rendered output and pause again

After technical inspection and structured critique, show actual full-size native
slides; follow [review](review.md). Then:

```sh
node scripts/harness-slides.mjs design present --project CONTENT --output REVIEW_DIR --revision REVIEW_HASH
```

Use the returned rendered-review question through the same host interface and wait.
Record approval or revisions with `design respond`. For a workspace, use its `build/review` directory so readiness binds the acceptance
to that exact built artifact. User acceptance is distinct from
pixel coverage and creative critique. An explicit prior waiver is reported as waived,
not user-reviewed. Changed render hashes invalidate acceptance.

Routine fit repairs within the approved concept need no new design interview.
A material change to narrative, takeaway, relationship or asset choice needs an
updated proposal and approval; revise an affected slide, not the entire intake.
