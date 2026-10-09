# Checkpoint records

For typed components, scenes and native-template builds, which check an approved
proposal before they build and before the final user review. Compositions do not
use these; they record approval in the presentation brief.

## Before construction

Run these from the selected runtime in an existing private content project:

```sh
node scripts/harness-slides.mjs design propose --project CONTENT --file proposal.json
node scripts/harness-slides.mjs design status --project CONTENT
node scripts/harness-slides.mjs design respond --project CONTENT --file actual-user-reply.json
node scripts/harness-slides.mjs design check --project CONTENT
```

Proposal: `{schema:1,title,scope:"new"|"redesign",slides:[{id,title,sources,intent,
visibleText,composition,asset:{description,disposition,reason}}]}`. Stable slide IDs
and complete schema-2 intent record the [design](design.md) decision for each slide. Brief/editorial/example source
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

## After rendering

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
