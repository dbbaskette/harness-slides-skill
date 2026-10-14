# Checkpoint records

For typed components, scenes and native-template builds, which check an approved
proposal before they build and before the final user review. Compositions may be
bound to the same design session: pass `--design-project CONTENT` to `compose compile`
and `compose preview`. A whole deck lists every proposed slide, in order and with the
same titles; a section file adds `--section` and lists a run of neighbouring ones.
An unbound composition records approval in the presentation brief.

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

Schema 2 adds optional per-slide fields: `objectives` (objective IDs), `copy`
(`{points:[{label?,text?}],focal?,caveat?,source?}`, from which `visibleText` is
rendered), `qualifications` (wording the copy must keep), `notes` (presenter notes,
outside the approval) and `asset.candidates`
(`[{assetId,kind,ref,refType?,concept,alt?,status}]`). `design propose --mode batch`
asks about every pending slide at once; one approve of `Approve the whole plan`
approves them all. Add `--json` to a `design`, `assets` or `images` action,
`compose compile`, `compose preview` or `review` to get a refusal on stdout as
`{status:"blocked",problems:[{code,slide,asset,detail,recoverable,next}]}`.

The result supplies a revision, current question and selected slide descriptions.
Response: `{questionId,planRevision,decision,feedback,waiveRendered?}`. `feedback`
is the actual answer; when the person approves without writing anything, it is the
option they chose, word for word. Decisions are approve/revise/batch/approve-remaining/autonomous.
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
to that exact built artifact. For a bound composition, use the `review --compiled` output directory.
When the person is to decide on a deck whose review still lists findings,
run `design present --accept-findings`. The question lists the findings.
Show them with the slides, and record the person's answer with
`design respond`. Never answer it for them. User acceptance is distinct from
pixel coverage and creative critique. An explicit prior waiver is reported as waived,
not user-reviewed. Changed render hashes invalidate acceptance.
