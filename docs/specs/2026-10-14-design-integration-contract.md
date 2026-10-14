# Design integration contract

Status: built on `main` after 0.13.1; not yet released. Written 2026-10-14 for
Training Studio's visual teaching plan, milestone 1 (issue #46).

## Why

Training Studio will use Harness Slides' design session
(`.harness-slides/design/session.json`) as the one record of design approval for
its decks. It adapts to that record rather than keeping a second approval model.
Before this change the session could not hold teaching copy, qualifications or
asset candidates. It asked an outside approver about one slide at a time. A caller
could learn why a command refused only by reading its stderr.

This page records what the commands support, what this change adds, and which
combinations do not work today. The fixture in `tests/fixtures/visual-contract/`
exercises the same contract, and Training Studio copies it.

## What each operation goes through

| Operation | Command | Notes |
| --- | --- | --- |
| Propose a design | `design propose --project DIR --file proposal.json [--expected REV] [--mode guided\|batch]` | Schema 1 or 2. A changed proposal needs `--expected` set to the current revision. |
| Read the current question | `design status --project DIR` | Returns `revision`, `mode`, `pending`, `question` and the slides it asks about. |
| Record the person's answer | `design respond --project DIR --file reply.json` | `{questionId,planRevision,decision,feedback,waiveRendered?}` |
| Check before building | `design check --project DIR` | Refuses until every slide is approved. |
| Build a composition against the approval | `compose compile --file c.json --design-project DIR --output NEW` | Checks slide IDs, order and titles, and `intent` where the composition gives one. |
| Build a typed deck plan against the approval | `deck compile --file plan.json --design-project DIR --output NEW` | The same checks. |
| Build a scene against the approval | `workspace init`, `pptx render`, `google compile` with `--design-project` | The same checks. A workspace keeps the binding. |
| Generate approved artwork | `images generate ... --design-project DIR --slide ID` | Only for an approved slide whose visual family is `generated-art`. |
| Preview a composition | `compose preview --file COMPILED --output NEW` | Not bound to the session. A refusal reports the design revision of the compiled build. |
| Rendered user review | `review ... --design-project`, then `design present` | Needs a review record bound to the design. See below for compositions. |
| Read a refusal as data | `--json` on any `design` action, `compose compile` and `compose preview` | See [refusals](#refusals). |

## Proposal schema 2

Schema 1 is still accepted, and it is stored and digested exactly as before.
Schema 2 keeps every schema-1 field and adds optional fields on each slide:

| Field | Shape | Meaning |
| --- | --- | --- |
| `objectives` | 1–20 strings | The learning objective IDs the slide serves. |
| `copy` | `{points:[{label?,text?}], focal?, caveat?, source?}` | The visible copy, the same shape as an outline slide. At most 12 points, and something to show. |
| `visibleText` | string | Required without `copy`. With `copy` it is rendered for you. If you send it too, it must equal that rendering. |
| `qualifications` | 1–20 strings | Wording the visible copy must keep. Each must appear in it, ignoring case and runs of spaces. |
| `notes` | string | Presenter notes. They are not approved copy, so changing them keeps the slide's approval. |
| `asset.candidates` | 1–12 `{assetId, kind, ref, concept, alt?, status}` | `kind` is `icon`, `supplied`, `generated`, `screenshot` or `chart`. `status` is `resolved` or `pending`. `assetId` is unique on the slide. |

The rendering of `copy` has one line for each part. The first line is `focal`,
unless `focal` repeats a point's label. Then comes one line for each point, written
`label: text`, or just the label or the text when only one is given. Then the
`caveat`, then `Source: …`. The stored plan carries the rendered `visibleText`.
Rendered review and native critique read approved copy from `visibleText`, so they
work unchanged. A caller that sends back the plan it read changes nothing.

These existing fields carry the rest of the handoff:

| Need | Field |
| --- | --- |
| The claim | `intent.takeaway` |
| The alternative considered | `intent.alternative` |
| The proposed visual and its teaching purpose | `intent.visual.family` and `intent.visual.purpose` |
| The selected treatment | `composition` |
| Why direct text is right | `intent.visual.family: "text"`, with asset `disposition: "not-needed"` and its `reason` |

A visual family that needs an asset (`icon`, `sourced-image` or `generated-art`)
with an asset that is not `selected` is refused as `asset-unresolved`. The
refusal carries a fallback proposal, a native diagram. That fallback is only a
proposal and needs the person's approval like any other change. Pending
candidates are allowed on a selected asset. Generated art, for example, can only
be generated once its slide is approved.

## The whole-plan question

`design propose --mode batch` makes the current question cover every pending
slide at once. Its options are `Approve the whole plan` and `Request changes`.
One `approve` approves every slide in the question. The default mode is
`guided`, which asks about the first pending slide only. Changing the mode of an
existing session needs `--expected`, is recorded in the session's responses and
changes the question ID. An answer to an older question or plan revision is
still refused, so the outside approver must answer the question that
`design status` returns now. When a revised plan leaves only some slides pending,
the batch question covers those slides and says "the remaining designs".

A `batch` reply still exists. It switches a guided session to batch mode without
approving anything.

## Approving without a note

`feedback` must not be empty, as before. When the person approves without
writing anything, the caller sends the option they chose, word for word. For the
whole-plan question that is `Approve the whole plan`. This records what the
person did and nothing they did not say. An empty reply still cannot advance a
session.

## Refusals

With `--json`, a refusal is printed on stdout, and the exit status is 1:

```json
{"schema":1,"status":"blocked","designRevision":"<current revision or null>",
 "problems":[{"code":"asset-unresolved","slide":"operator_architecture","asset":"console_screenshot",
   "provider":null,"detail":"<the human message>","recoverable":true,
   "next":"Resolve the asset, or propose the fallback for approval",
   "fallback":{"proposal":"A native diagram …","needsApproval":true}}]}
```

Every problem has every key. `slide`, `asset` and `provider` are null when they do
not apply. `fallback` appears only when there is one. `recoverable` means the
caller can fix its input or setup and retry with saved work and approvals intact.
`designRevision` comes from the session for `design`, from `--design-project` for
`compose compile`, and from the compiled build's report for `compose preview`.
Without `--json` the same refusal is the same sentence on stderr as before.

| Code | Raised by |
| --- | --- |
| `invalid-proposal` | A proposal that does not match the schema, or a mode other than guided or batch |
| `copy-mismatch` | `visibleText` that differs from the text rendered from `copy` |
| `copy-qualification-missing` | A qualification that does not appear in the visible copy |
| `asset-unresolved` | An asset the visual depends on that is not selected; carries `asset` and `fallback` |
| `design-missing` | No session in the project, or a creative build without `--design-project` |
| `design-awaiting-approval` | Construction before approval; one problem for each pending slide |
| `design-revision-requested` | Construction after the person asked for changes |
| `design-revision-stale` | A stale `--expected`, question ID or plan revision |
| `design-mismatch` | Built slides whose IDs, order, titles or intent differ from the approval |
| `design-state-invalid` | A session record changed by hand, or stored through a link; not recoverable |
| `design-busy` | A design lock is held. A process stopped mid-write leaves `.harness-slides/design/.lock`; `next` says to remove it when no command is running |
| `invalid-response` | A reply without the person's words, or with a decision that does not fit the question |
| `rendered-review-stale` | A rendered review that changed or does not cover the approved slides |
| `composition-invalid` | A structure or fit problem, one per problem, with its slide |
| `icon-unavailable` | An icon missing from the brand library, or not native geometry; `asset` is the icon ID |
| `layout-unavailable` | A template layout the brand does not have |
| `asset-missing` | An image file a composition names that is not there; `asset` is the element ID |
| `renderer-unavailable` | Poppler or LibreOffice is not installed; `provider` is `poppler` or `libreoffice` |
| `provider-failed` | A Google access or upload failure during preview; `provider` is `google` |
| `render-failed` | A render that produced no PDF or the wrong page count |
| `output-exists` | An output directory that already exists |
| `input-missing`, `input-invalid` | A missing or unreadable input file |
| `unclassified` | Anything else; not recoverable until a person has looked |

## Combinations that do not work today

- `compose compile` checks the design only when it writes a build. Without
  `--output` it checks fit only, so a reordered composition still "fits".
- A bound composition must list every slide in the design, cover and closing
  slides included, each with a full intent and asset decision.
- `compose preview` output is not a review record. `design present` cannot take
  it, so a composition's rendered user review is recorded in the presentation
  brief, as before. The creative review that `design present` needs comes from
  the quality report of a scene build (`deck compile` or a workspace build), or
  from a native Google snapshot.
- Asset candidates are recorded only. Nothing resolves them or checks them
  against the brand icon library or an image provider. `compose compile` checks
  icons by their library ID, and the `assetId` of a candidate is not connected to
  that ID.
- `objectives` and `qualifications` are checked when proposed and then only kept.
  No build compares a composition's words with the approved copy. `notes` are not
  copied into a composition.
- `--json` is not available on `deck compile`, `images`, `workspace`, `pptx`,
  `google` or `review`. Their refusals are still stderr sentences.
- A design lock left by a stopped process is not cleared automatically.
- The session stores absolute paths: the project, and any rendered review and its
  images. After the project moves, `design status` and answers to the rendered
  question fail on a session with a rendered review until the output is presented
  again.
- `design status` reports pending slides, but not pending asset candidates.

## Not in this change

- Version and release. Live guidance does not describe schema 2, batch mode or
  `--json` yet, because new tasks fetch guidance from `main` while the released
  runtime is 0.13.1. Those lines go with the release that raises `minimumRuntime`.
- `--json` refusals for `images`, which come with asset resolution.
