# Design integration contract

Status: released in 0.14.0 (issue #51); the composition review gaps of issue #67
were released in 0.14.1. Written 2026-10-14 for
Training Studio's visual teaching plan, milestone 1 (issue #46). The
section-scoped check is milestone 2 (issue #47), the
[asset manifest](#the-asset-manifest) was added for milestone 3 (issue #49), and the
[design-bound review of a composition](#design-bound-review-of-a-composition) for
milestone 4 (issue #50). [Paths in records](#paths-in-records) are relative to the
project since issue #57. Since issue #59, digests that stand for the same content
[ignore key order](#key-order), and `version` reports
[capabilities](#detecting-support). Compositions draw
[native charts](#native-charts) since issue #40. Since issue #64, asset checks read
every candidate of the stored plan, a design can name a brand icon by
[library ID](#icons-by-library-id), and a composition can place an icon by asset ID.
Since issue #67 (released in 0.14.1), the composition review can
[render through Google](#rendering-through-google), returns
[every slide's packet in one call](#every-packet-in-one-call), fills an assessment's
[sources from the slide](#sources-from-the-slide), and `design present` can put a deck
to the person [with its findings listed](#presenting-with-findings).

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
| Propose a design | `design propose --project DIR --file proposal.json [--expected REV] [--mode guided\|batch] [--brand brand-contract.json]` | Schema 1 or 2. A changed proposal needs `--expected` set to the current revision. With `--brand`, icon candidates named by [library ID](#icons-by-library-id) are checked against the brand. |
| Read the current question | `design status --project DIR` | Returns `revision`, `mode`, `pending`, `question` and the slides it asks about. |
| Record the person's answer | `design respond --project DIR --file reply.json` | `{questionId,planRevision,decision,feedback,waiveRendered?}` |
| Check before building | `design check --project DIR` | Refuses until every slide is approved. |
| Build a composition against the approval | `compose compile --file c.json --design-project DIR [--section] [--output NEW]` | Checks slide IDs, order and titles, and `intent` where the composition gives one. It checks without `--output` too. With `--section`, see [sections](#sections). |
| Build a typed deck plan against the approval | `deck compile --file plan.json --design-project DIR --output NEW` | The same checks. |
| Build a scene against the approval | `workspace init`, `pptx render`, `google compile` with `--design-project` | The same checks. A workspace keeps the binding. |
| Generate approved artwork | `images generate ... --design-project DIR --slide ID [--alt TEXT]` | Only for an approved slide whose visual family is `generated-art`. The image is recorded in the asset manifest under its `--id`. |
| Record a supplied image | `assets add-supplied FILE --project DIR --alt TEXT --source TEXT [--restrictions TEXT] [--id ID] [--kind supplied\|screenshot\|chart]` | See [the asset manifest](#the-asset-manifest). |
| Record a brand icon | `assets icon ICON_ID --project DIR [--id ID] [--alt TEXT] [--brand brand-contract.json]` | With `--brand`, checked against the brand's hashed icon index. |
| See or check the assets | `assets status\|check --project DIR [--design-project DIR] [--brand brand-contract.json]` | `check` refuses missing or changed files, and design candidates not yet recorded, whether the design is waiting for approval or approved. |
| Place a recorded image | `{type:image,id,asset:ID,alt?,fit?}` or `picture:{asset:ID,alt?}` in a composition, compiled with `--asset-project DIR` | `--asset-project` defaults to `--design-project`. |
| Place a recorded icon | `{type:icon,id,asset:ID,color?,style?}` in a composition, compiled with `--asset-project DIR` and `--brand` | `--asset-project` defaults to `--design-project`. `{type:icon,id,icon:LIBRARY_ID}` still works. |
| Preview a composition | `compose preview --file COMPILED --output NEW [--design-project DIR [--section]]` | With `--design-project`, it rechecks the build against the design approved now, before it renders. Without the flag it is not bound to the session, and a refusal reports the design revision of the compiled build. |
| Review a composition against the design | `review --compiled COMPILED --output REVIEW --design-project DIR [--renderer local\|google] [--file-id ID]` | Renders `REVIEW/deck.pptx` from the build and reviews it. See [design-bound review of a composition](#design-bound-review-of-a-composition). |
| Read every slide's review packet | `review --output REVIEW --packets` | See [every packet in one call](#every-packet-in-one-call). |
| Rendered user review | `review ... --design-project`, then `design present [--accept-findings]` | Needs a review record bound to the design; a composition's comes from `review --compiled`. See [presenting with findings](#presenting-with-findings). |
| Read a refusal as data | `--json` on any `design`, `assets` or `images` action, `compose compile`, `compose preview` and `review` | See [refusals](#refusals). |

## Detecting support

The 0.13.1 release and the `main` builds that led to 0.14.0 all report version
0.13.1, and the `main` builds that led to 0.14.1 report 0.14.0, so a version
number cannot tell a caller what a runtime supports. To detect support, read
`capabilities` from `harness-slides version` and look for a name. Do not compare
versions, and do not provoke a refusal to find out.

```json
{"package":"harness-slides","runtimeVersion":"0.14.1","runtime":"/…/harness-slides",
 "capabilities":["assets","assets-approved-candidates","canonical-digests","compose-icon-assets",
   "compose-review","compose-section","design-batch","design-icon-ids","design-present-findings",
   "design-schema-2","json-refusals","native-charts","relative-records","review-google-renderer",
   "review-input-refusals","review-packets","review-sources-from-slide"]}
```

The list is sorted. A name is added with its feature and never renamed, removed
or reused. A runtime without `capabilities` (0.13.1 and earlier) has none of them.

| Capability | The runtime supports |
| --- | --- |
| `assets` | [The asset manifest](#the-asset-manifest): `assets add-supplied`, `assets icon`, `assets status` and `assets check`, images recorded by `images generate` and `images download`, and asset IDs in a composition compiled with `--asset-project` |
| `assets-approved-candidates` | `assets status\|check --design-project` reading the candidates of every slide in the stored plan, pending or approved. Without it they see only the slides of the question `design status` is waiting on, and none once the design is approved |
| `canonical-digests` | Intents, slide approvals and plan revisions that [ignore key order](#key-order) |
| `compose-projects` | `project.json` links versioned composition sources, builds, previews and reviews; studio text edits recompile the source, and workspace status/history/build/restore operate on the project |
| `compose-provenance` | A slide's `provenance`, never drawn and added to the speaker notes; `internal-source` findings from `outline check` and `compose preview` for a source line that reads as internal provenance |
| `compose-verified-critique` | Critic packet schema 2 binds the deck and each image hash; assessments answer all eight questions for every slide and give an inspection note |
| `compose-visual-vocabulary` | Box `style: tint`, `state: muted\|struck\|failed` on a box or text, edge `style: solid\|dashed\|dotted`, edges attached to texts, labelled cards for `dependency`, supporting fills for a direction without meanings, `design.slides.fills: {tints: false}` in a brand contract, refusal of words over words and of a word wider than its line (warnings, `unverified-fit`, when measurement is estimated), and `no-meanings` and `ascii-art` findings |
| `neutral-native-composition` | Neutral live/reading contracts and Cover/Section/Closing layouts, with the same native writer for groups, tables, routed/attached connectors and chart data |
| `owned-google-previews` | Preview creation stores ownership and remote version receipts; a stale/unowned file is refused, and an owned unchanged preview is preserved while a fresh file is created |
| `preview-repair-clusters` | `compose preview` returns `repair`: each slide's warning and error findings grouped by slide, blocking slides first, with codes and object IDs ([visual vocabulary](#visual-vocabulary-in-0160-unreleased)) |
| `render-bundles` | Verified immutable native PPTX/PDF/PNG bundles shared by composition preview and design-bound review; cached artifacts contain no critique or user approval |
| `compose-icon-assets` | `{type:icon,asset:ID}` in a composition, resolved through the asset manifest and listed in `compose-report.json` `inputs.assets` ([the asset manifest](#the-asset-manifest)) |
| `compose-review` | `review --compiled COMPILED --design-project DIR`, the [design-bound review of a composition](#design-bound-review-of-a-composition) |
| `compose-section` | `--section` on `compose compile` and `compose preview` ([sections](#sections)), `--design-project` on `compose preview`, and `compose compile --design-project` checking without `--output` |
| `compose-split-point` | `compose compile --outline FILE`, or the outline of a `--project`, refusing a reading deck whose approved point is split across nodes; `split-point` preview findings; outline points' `parts` |
| `design-batch` | `design propose --mode batch` and [the whole-plan question](#the-whole-plan-question) |
| `design-icon-ids` | `refType: "library-id"` on an icon candidate, and `design propose --brand` and `assets check --brand --design-project` checking it ([icons by library ID](#icons-by-library-id)) |
| `design-present-findings` | `design present --accept-findings`, `findings` on a rendered question and `renderedFindings` in `design status` ([presenting with findings](#presenting-with-findings)) |
| `design-schema-2` | [Proposal schema 2](#proposal-schema-2): `copy`, `objectives`, `qualifications`, `notes` and `asset.candidates`, and the `asset-unresolved` fallback |
| `json-refusals` | `--json` [refusals](#refusals) on the commands that list it |
| `native-charts` | A `chart` node in a composition, written by the native template emitter as an editable chart with its own embedded workbook. See [native charts](#native-charts) |
| `relative-records` | [Paths in records](#paths-in-records) relative to the project, so a project can move |
| `review-google-renderer` | `review --file\|--compiled ... --renderer google [--file-id ID]`, [rendering through Google](#rendering-through-google) |
| `review-input-refusals` | `input-invalid`, with the next step, for a `review` operation on a folder that holds no review and for a call that mixes preparing with another operation |
| `review-packets` | `review --output REVIEW --packets` ([every packet in one call](#every-packet-in-one-call)) |
| `review-sources-from-slide` | A `review --assessment` check without `sources` taking its slide's ([sources from the slide](#sources-from-the-slide)) |

## Proposal schema 2

Schema 1 is still accepted, and it is stored exactly as before. Its revision, like
every new revision, ignores [key order](#key-order).
Schema 2 keeps every schema-1 field and adds optional fields on each slide:

| Field | Shape | Meaning |
| --- | --- | --- |
| `objectives` | 1–20 strings | The learning objective IDs the slide serves. |
| `copy` | `{points:[{label?,text?}], focal?, caveat?, source?}` | The visible copy, the same shape as an outline slide. At most 12 points, and something to show. |
| `visibleText` | string | Required without `copy`. With `copy` it is rendered for you. If you send it too, it must equal that rendering. |
| `qualifications` | 1–20 strings | Wording the visible copy must keep. Each must appear in it, ignoring case and runs of spaces. |
| `notes` | string | Presenter notes. They are not approved copy, so changing them keeps the slide's approval. |
| `asset.candidates` | 1–12 `{assetId, kind, ref, refType?, concept, alt?, status}` | `kind` is `icon`, `supplied`, `generated`, `screenshot` or `chart`. `status` is `resolved` or `pending`. `assetId` is unique on the slide. `ref` is a free description unless `refType` says otherwise; see [icons by library ID](#icons-by-library-id). |

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

### Icons by library ID

An icon candidate's `ref` is a free name by default, such as `"kubernetes"`, and
the caller must find the matching brand icon itself. To name the exact icon, give
its brand library ID and say so:

```json
{"assetId":"icon_kubernetes","kind":"icon","ref":"fi-1a2b3c4d-s001-l004","refType":"library-id",
 "concept":"Kubernetes cluster","status":"pending"}
```

`refType` is `name` (the default) or `library-id`, and `library-id` is only for
`kind: icon`. A library ID has the form `assets icon` takes: up to 80 letters,
digits, `_`, `.` or `-`. A candidate without `refType` is a free name and is never
checked against a brand, so proposals written before this keep working with or
without `--brand`.

`design propose --brand brand-contract.json` and `assets check --brand
brand-contract.json --design-project DIR` check each library-ID candidate against
the brand's hashed icon index. An ID the library lacks is refused as
`asset-unresolved`, and one it holds only as a picture or without a drawing as
`icon-unavailable`. Each problem names the slide, and its `asset` is the
candidate's `assetId`. Without `--brand`, `design propose` checks only the ID's
form. `assets check --design-project` also refuses a recorded icon whose `ref`
is not the candidate's library ID as `asset-conflict`. For a library-ID
candidate not yet recorded, `next` gives the exact `assets icon ID --id ASSET_ID
--brand` command, and `assets status` lists the candidate with its `ref`.

## The asset manifest

`PROJECT/.harness-slides/assets.json` records every image or icon the deck may
use. Commands write it atomically under `.harness-slides/assets.lock`. A person
does not edit it.

```json
{"schema":1,"tool":"harness-slides-assets","assets":[
  {"assetId":"console_screenshot","kind":"screenshot","path":"assets/supplied/console_screenshot.png",
   "sha256":"…","alt":"Cluster console listing the operator pod","source":"Course author, October 2026",
   "restrictions":"Internal training only","format":"png","width":1600,"height":900,
   "ref":null,"provenance":null,"recorded":"2026-10-14T09:00:00Z"},
  {"assetId":"icon_kubernetes","kind":"icon","path":null,"sha256":"<hash of the index entry, or null>",
   "alt":"Kubernetes","source":"Brand icon library (acme)","restrictions":null,"ref":"fi-1a2b3c4d-s001-l004",
   "provenance":{"brandRevision":"…","brand":"acme","label":"Kubernetes","indexSha256":"…"},"recorded":"…"},
  {"assetId":"hero-art-v1","kind":"generated","path":"assets/hero.png","sha256":"…","alt":null,
   "source":"Generated by gemini-api (gemini-nano-banana-2.1), request hero-art-v1","restrictions":null,
   "format":"png","width":2048,"height":1152,"ref":null,
   "provenance":{"provider":"gemini-api","model":"…","requestId":"hero-art-v1","created":"…","promptSha256":"…",
     "metadata":"assets/hero.image.json","metadataSha256":"…","slide":"operator_architecture"},"recorded":"…"}]}
```

| Field | Meaning |
| --- | --- |
| `assetId` | Stable ID: a letter, digit or `_`, then up to 127 of those, `.`, `:` or `-`. Unique in the project. A design candidate's `assetId` names the same asset. |
| `kind` | `icon`, `supplied`, `generated`, `screenshot` or `chart`. `add-supplied` takes `--kind` for the last two. |
| `path` | Relative to the project, with `/`, never absolute and never through `..`. A file from outside the project is copied to `assets/supplied/ID.EXT`; one inside is recorded where it is. Null for an icon. |
| `sha256` | The file's hash, or for a checked icon the hash of its index entry. |
| `alt`, `source`, `restrictions` | What the image shows, where it came from, and any limit on its use. `alt` may be null for generated art; a composition then gives it. |
| `ref` | The brand icon library ID, for an icon. |
| `provenance` | Generated art: the provider, model, request, prompt hash, the sidecar path and its hash, and the approved slide. A checked icon: the brand revision, label and index hash. |

Recording the same file under the same ID again changes nothing. A different
file, kind or icon under a recorded ID is refused as `asset-conflict`. Recording
a file already in the project again under its ID accepts its current bytes.

`assets status` lists each asset with a `state` of `ok`, `file-missing`,
`hash-changed` or `invalid`. With `--design-project` it also sorts the design's
asset candidates into `resolved` (in the manifest with the same kind) and
`pending`. The candidates come from every slide of the stored plan: the proposal
while it waits for approval, and the approved plan once it has it. `assets
check` refuses the same problems:

- a missing file or sidecar as `asset-file-missing`, and a changed one as
  `asset-hash-changed`;
- with `--brand`, an icon the library lacks or holds only as a picture as
  `icon-unavailable`, and a changed index entry as `asset-hash-changed`;
- with `--design-project`, a candidate not in the manifest as `asset-unresolved`,
  or as `provider-missing` when it is generated art and no image provider key is
  set; a candidate whose kind differs from the recorded asset as `asset-conflict`;
- with both, an icon candidate named by a [library ID](#icons-by-library-id) the
  brand lacks or cannot draw, and a recorded icon that is not that ID.

`compose compile` resolves `{type:image,asset}` and `picture:{asset}` through the
manifest of `--asset-project`, or of `--design-project` when that is not given.
Alt text comes from the composition, or else from the manifest. An asset that is
not recorded, is an icon, or whose file is missing or changed is a composition
problem, reported with the others under its own code. A build copies each asset
to `OUTPUT/assets/ID.EXT`, and `scene.json` names that copy relatively, so the
compiled folder and its previews work after the project moves.
`compose-report.json` lists each one in `inputs.assets` as
`{object,slide,asset,kind,path,source,sha256}`; `compose render` and
`compose preview` refuse a copy that changed. An image given by `src` is
unchanged: its absolute path and hash are recorded as before.

`{type:icon,id,asset:ID}` places a recorded icon. It takes `asset` in place of
`icon`, never both, and keeps `color` and `style`. It resolves through the same
manifest to the icon's recorded library ID, and is then checked against the brand
like any icon. An asset that is not recorded, or no project to look in, is
`asset-unresolved`; an asset that is an image is a composition problem; an icon
the library lacks or cannot draw is `icon-unavailable`; and an icon recorded with
`--brand` whose index entry has changed since is `asset-hash-changed`. The build
holds no copy of an icon: it is drawn from the brand library at render.
`inputs.assets` lists it as `{object,slide,asset,kind:"icon",ref,sha256}`, where
`ref` is the library ID and `sha256` the recorded hash of its index entry, or
null. `{type:icon,id,icon:LIBRARY_ID}` works as before and is not listed.

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

## Sections

A section author builds and previews only its own slides. It declares this with
`--section` on `compose compile` and `compose preview`, next to
`--design-project`. A section is never inferred. Without `--section` the
composition is the whole deck, so a deck with missing slides cannot pass as a
section.

| | Whole deck (no `--section`) | Section (`--section`) |
| --- | --- | --- |
| Slides | Every approved slide | A contiguous run of approved slides, possibly one, possibly all |
| Order | Approved order | Approved order, from wherever the run starts |
| Titles | Approved titles | Approved titles |
| `intent` | Matches the approved digest where given | Matches the approved digest where given |

A refusal is `design-mismatch` and names one slide:

- A slide not in the plan is extra, and that slide is named.
- An approved slide skipped inside the run, or missing from the end of a whole
  deck, is missing. The skipped approved slide is named.
- A slide that belongs earlier in the plan, or ahead of a slide that comes later
  in the file, is out of order. The misplaced slide is named.
- Order problems report only the first. Title and intent problems are reported
  once per slide, in one refusal.

`--section` without `--design-project` is refused as `input-invalid`. The
check-only result, the compile report (`designRevision`, `designScope`) and the
preview result carry `design: {revision, scope, slides}`. `scope` is `deck` or
`section`. The lead merges the sections with `compose merge` and compiles the
merged deck without `--section`.

## Design-bound review of a composition

`review --compiled COMPILED --output REVIEW --design-project DIR` reviews a
compiled composition against the approved design, on the PPTX path. It renders
with LibreOffice unless [`--renderer google`](#rendering-through-google) is given.
It is the existing `review`: the same render, pixel marks
(`--mark`), per-slide packet (`--slide`), assessment (`--assessment`), staleness
checks and `design present`. Only the source of the creative report is new.

**Why `review` reads the build.** The PPTX review binds its report to the exact
bytes of the deck it renders. `compose compile` writes no deck, and
`compose render` is not byte-for-byte repeatable, so a report written at compile
time could not be bound to the deck that is reviewed. Instead `review` renders the
build itself into `REVIEW/deck.pptx`, and reuses that deck while the build is
unchanged, so its receipts carry over. That file is the reviewed deck: deliver it,
or import it with `drive import`. The creative report reuses the native critique's
criteria (`visual-relationship`, `explanatory-value`, `asset-purpose`,
`approved-design`, `approved-asset-missing` and the rest), and takes
`compose preview`'s screens as prompts. There is no second scorer.

`review --compiled` refuses:

| Build | Code |
| --- | --- |
| Compiled without `--design-project` | `design-missing` |
| A section (`designScope: section`) | `input-invalid`; merge and compile the whole deck |
| Compiled against an older design revision | `review-stale` |
| Slides that differ from the current approval | `design-mismatch` |
| A changed or missing asset copy | `asset-hash-changed`, `asset-file-missing` |
| No LibreOffice or Poppler on this computer | `renderer-unavailable`, with `provider` `libreoffice` or `poppler`. For LibreOffice, `next` names `--renderer google` |
| `--renderer google` and Drive refused the upload or the export | `provider-failed`, with `provider` `google` |
| `--compiled` without `--design-project`, or with `--file`, `--previews`, `--native-snapshot`, `--decisions` or `--quality-report` | `input-invalid` |
| `--renderer` other than `local` or `google`, `--renderer` with `--previews`, or `--file-id` without `--renderer google` | `input-invalid` |

**Report.** Each finding carries a `category`. `designReview` in every result
groups prompts and judgements into five categories:

```json
{"schema":1,"complete":false,"categories":{
  "asset-failure":[{"slide":"console_view","kind":"prompt","code":"approved-asset-missing","severity":"error","detail":"…"}],
  "design-deviation":[{"slide":"reconcile_loop","kind":"prompt","code":"approved-diagram-not-drawn","severity":"warn","detail":"…"}],
  "visual-teaching":[{"slide":"reconcile_loop","kind":"prompt","code":"prose-cards","severity":"warn","detail":"…","objects":["loop_desired","loop_observe","loop_act"]},
                     {"slide":"reconcile_loop","kind":"judgement","criterion":"teaching-treatment","status":"issue","detail":"<the reviewer's reason>","objects":["loop_act","loop_observe"]}],
  "fit-defect":[],
  "direct-text":[{"slide":"knowledge_check","kind":"treatment","purpose":"…","reason":"…","accepted":true}]}}
```

- A `prompt` comes from the build and points at something to look at. A
  `judgement` is a criterion the assessment marked `issue` or `uncertain`. A
  `treatment` is a slide whose approved visual family is `text`. Its `accepted`
  value is null before an assessment, then true when every check on the slide passes.
- Criteria map to categories as follows. `asset-purpose` is an asset failure.
  `approved-design` is a design deviation. `technical-fit`,
  `rendered-text-completeness`, `reading-order` and `export-completeness` are fit
  defects. Every other criterion is visual teaching. A screen that would be a
  teaching prompt on an approved direct-text slide is filed under `direct-text`.
- `approved-asset-missing` (`error`) means a slide whose approved family is
  `icon`, `sourced-image` or `generated-art` places none. Like the native one, it
  blocks the creative review until the build or the approval changes.
  `approved-candidate-missing` (`warn`) means a selected asset decision none of
  whose candidates appears on the slide.
- **Prose cards.** Some slides teach a mechanism: the approved family is `diagram`
  or `regions`, or the relationship names a cycle, flow, dependency, ownership,
  containment or the like. If such a slide is built as two or more boxes of
  prose, with no edge, enclosing region, image, table or chart, the slide gets a
  `prose-cards` prompt. The prompt names the relationship and the cards. If the
  approved family was a diagram, the slide also gets `approved-diagram-not-drawn`.
  Neither is an error. The slide's prompt gains a `teaching-treatment` criterion,
  which the assessment must answer for that slide. A pass needs a slide-specific
  reason, and the judgement must cite at least one of the cards. Boxes and a
  missing icon are never failures on their own. Direct-text, template, table,
  chart and quote slides are not screened for prose cards.

**Receipts.** The review record keeps
`compiled: {dir, binding, files, native}`, where `dir` follows
[paths in records](#paths-in-records) and `files` holds the hashes of
`scene.json`, `structure.json`, `compose-report.json` and `brand-contract.json`.
The creative report keeps the deck hash (`builtArtifactDigest`), the image
hashes (`artifactDigest`), the design revision, the build binding and each
placed asset as `{object,slide,asset,kind,sha256}`. Each later `--mark`,
`--assessment`, `--slide`, `design status` and `design present` checks these
again. A changed deck, image, build file or design revision is refused as
`review-stale`. A changed asset copy is refused as `asset-hash-changed`.

### Rendering through Google

`--renderer google` renders the deck through the Drive route that
`compose preview --renderer google` takes. It works for `--compiled` and `--file`.
Poppler (`pdfinfo`, `pdftoppm`) is checked first, before anything is uploaded.
The exact bytes of `REVIEW/deck.pptx` that the review hashes are imported into
Drive as `Preview: <deck title>`. In 0.15.0, preserve the previous preview and create a new one after checking the ownership/version of the file
named by `--file-id`. Drive exports that file as a PDF, and Poppler cuts it into
the pictures. The receipts do not change: `builtArtifactDigest` is the hash of the
uploaded bytes, and `artifactDigest` binds the pictures Google drew. The Drive
copy only carries the render. The reviewed deck is still `REVIEW/deck.pptx`.

The record's `renderer` names Google Slides, its `remote` keeps
`{provider:"google",fileId,url}`, and the result returns `fileId`, `url` and a
`next` naming `--file-id`. An unchanged build keeps its pictures and uploads
nothing. A render with the other renderer draws every picture again. If Drive
fails after the upload, the refusal names the file to reuse. Google draws
with its own fonts, so the fonts on this computer do not enter the renderer's
signature. `--renderer local` (LibreOffice) is the default.

### Every packet in one call

`review --output REVIEW --packets` returns every slide's packet, after the same
receipt checks as `--slide`:

```json
{"schema":1,"output":"/…/REVIEW","revision":"<review revision>","designRevision":"<design revision>",
 "renderer":"…","assessmentBinding":{"schema":1,"sceneDigest":"…","qualityRevision":"…","artifactDigest":"…"},
 "contactSheet":"/…/REVIEW/contact-sheet.html","deckReview":{…},"designReview":{…},
 "visualReviewComplete":false,"creativeReviewComplete":false,"readyForUserReview":false,
 "slides":[{"number":1,"id":"<rendered slide ID>","planId":"operator_architecture","title":"…","hidden":false,
   "image":"/…/REVIEW/slide-001-….png","imageSha256":"…","mark":null,
   "packet":{"slide":"operator_architecture","criteria":[…],"objects":[…],"expectedText":[…],"sources":[…],"…":"…"},
   "findings":[…]}]}
```

- `slides` is in deck order. `number` is what `--mark` takes. `planId` is the
  approved slide, and `id` is the slide's ID in the rendered deck.
- `image` is the absolute path of the picture, and `imageSha256` its hash.
- `mark` is the slide's pixel mark (`{revision,status,note,checkedAt}`), or null.
- `packet` is exactly what `review --slide` returns as `slide`. `findings` are
  the build's prompts for that slide.
- `assessmentBinding` is the head of the assessment, and `designReview` is the same
  as in every other result.

A review not bound to a design has no packets: it is refused as `input-invalid`.
`review.json` stays an internal record. Read the packets instead.

### Sources from the slide

The slide fixes a check's sources: they are the `sources` of its prompt. In
`review --assessment`, a check that leaves `sources` out (or gives null) takes
the slide's own. Those are stored with the assessment. Sources that are given
must be a non-empty list drawn from the slide's. Otherwise the check is refused
as `input-invalid`, naming the slide, the criterion and the source that is not
the slide's.

### Presenting with findings

`design present` needs pixel marks on every slide and a creative review with
nothing unresolved. `design present --accept-findings` also presents a review
whose assessment is complete but leaves findings unresolved. A person can then
approve the deck as it stands, and the design session records that decision.

- Every slide must still be marked `reviewed` for the current revision, and the
  assessment must be recorded and valid. Findings come from the assessment only. Without them the refusal is `rendered-review-stale`, and
  its `next` says what is missing. Without the flag, a review with findings is
  refused as before, and `next` names `--accept-findings`.
- The unresolved items are stored with the rendered review as
  `{slide,criterion,status,category,detail,objects?}`, where `slide` is the
  approved slide ID. They are part of the render binding, so the rendered
  question's ID is bound to them.
- The rendered question lists the findings on the slides it asks about, as
  `findings`. Its prompt counts them, and its first option is
  "Approve these slides with the findings listed". `design status` returns all of
  them as `renderedFindings`. That list is empty for a deck presented without findings.
- Only `design respond` with the person's words approves, as for any rendered
  question. An earlier waiver of the rendered checkpoint does not cover findings:
  a deck presented with findings always waits for an answer. The response is
  recorded with `acceptedFindings`. `approve-remaining` is refused as
  `invalid-response` when a slide outside the question carries findings, because
  the person has not seen them.
- The presentation stays current only while the assessment leaves exactly those
  findings unresolved. A changed assessment, even a clean one, makes `design status`
  and `design respond` refuse it as `rendered-review-stale` until it is presented again.

## Paths in records

Training Studio commits the design session to a team's repository, so a record
inside a project must not hold one computer's home folder, and must still work
after the project moves. A record keeps a path relative to its own folder, with
`/`, when both the record and the path lie inside the project. Reading resolves
it against the record's folder.

| Record | Paths | Relative to |
| --- | --- | --- |
| `.harness-slides/design/session.json` | `rendered.review`, `rendered.images`. The project itself is not stored; `design status` reports the `--project` it was given, and `renderedReview` and each question image as absolute paths. | the project |
| `REVIEW/review.json` | `source.file`, `designProject`, `compiled.dir`, `nativeSnapshot` | the review folder, when it is inside the design project (or, without `--design-project`, for files inside the review folder) |
| `workspace.json` | `designProject` | the workspace, when it is inside the design project |
| `compose-report.json`, and `deck compile`'s `design-report.json` | `inputs.composition.path` or `inputs.plan.path`, `inputs.brand.path` | the build folder, when the build and the input are inside the design project (`--asset-project` for a composition compiled without one) |
| `.harness-slides/assets.json` | every path, as before | the project |

A path outside the project stays absolute: a brand contract kept elsewhere, a
review folder outside the project, or the design project of a workspace outside
it. A relative path to a place that does not move with the project would break
whichever side moved. A build without `--design-project` or `--asset-project`
has no project, so its inputs stay absolute. Measured font paths stay absolute.

A record written before this change still reads. A session kept its project's
path, so its rendered review and images are found again after a move; the next
`design propose`, `respond` or `present` writes them relative. Presenting the same
review again keeps its rendered approvals. A review record is written relative by
the next `review` prepare, `--mark` or `--assessment`, and a workspace manifest by
the next `workspace save`. An older review record or workspace manifest still
names absolute paths until then, so it does not survive a move: prepare the review
again.

## Key order

A caller, an agent or a tool such as Python's `json.dumps(sort_keys=True)` may
write the same JSON with its keys in another order. Where a digest stands for the
same content, it is canonical: object keys are sorted at every depth before
hashing. Array order still counts, so a reordered list of slides, points or
sources is a change.

| Digest | Canonical |
| --- | --- |
| A built slide's `intent`, compared with the approved one by every check against the design and by the PPTX quality report in `review` | Yes |
| A slide's approval binding in the session | Yes |
| The plan revision of a new proposal | Yes |
| Scene, build, review, asset and workspace digests | No. They hash records the runtime writes itself. |

A proposal sent again with only its key order changed is unchanged. It keeps the
stored plan, its revision, its approvals and any rendered review, and it adds no
proposal to the responses. A proposal with a changed slide keeps the approvals of
its unchanged slides, whatever their key order.

A session written before this change still reads, and keeps every approval whose
slide is unchanged. Its revision stays the same, so compile reports, review records,
workspace manifests and native mappings that name it stay valid. Its approvals are
bound again in canonical form when it is read, and stored that way on the next
`design propose`, `respond` or `present`. A changed proposal gets a canonical
revision. A session record with a canonical revision still reads after a tool
rewrites it with its keys in another order. One with an older revision does not:
that revision is the digest of the plan in the order it was stored, so a reordered
copy is refused as `design-state-invalid`. Keep that file as it was written; once a
changed proposal gives it a canonical revision, it can be rewritten too.

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
`compose compile` and a `review` that prepares, from the compiled build's report for
`compose preview`, and from the review record for the other `review` operations.
Without `--json` the same refusal is the same sentence on stderr as before.

| Code | Raised by |
| --- | --- |
| `invalid-proposal` | A proposal that does not match the schema, or a mode other than guided or batch |
| `copy-mismatch` | `visibleText` that differs from the text rendered from `copy` |
| `copy-qualification-missing` | A qualification that does not appear in the visible copy |
| `asset-unresolved` | An asset the visual depends on that is not selected, carrying `asset` and `fallback`; an asset ID not in the manifest; or an icon candidate's library ID the brand lacks |
| `design-missing` | No session in the project, or a creative build without `--design-project` |
| `design-awaiting-approval` | Construction before approval; one problem for each pending slide |
| `design-revision-requested` | Construction after the person asked for changes |
| `design-revision-stale` | A stale `--expected`, question ID or plan revision |
| `design-mismatch` | Built slides whose IDs, order, titles or intent differ from the approval, or a section that is not a contiguous run of it; `slide` names the slide |
| `design-state-invalid` | A session record changed by hand, or stored through a link; not recoverable |
| `design-busy` | A design lock is held. A process stopped mid-write leaves `.harness-slides/design/.lock`; `next` says to remove it when no command is running |
| `invalid-response` | A reply without the person's words, or with a decision that does not fit the question |
| `rendered-review-stale` | A rendered review that changed or does not cover the approved slides |
| `review-stale` | A review whose deck, images, compiled build or design revision changed after it was prepared, a build compiled against an older design, or a `--mark` or `--assessment` for an older review revision |
| `composition-invalid` | A structure or fit problem, one per problem, with its slide |
| `icon-unavailable` | An icon missing from the brand library, or not native geometry; `asset` is the icon ID, or for a design candidate its `assetId` |
| `layout-unavailable` | A template layout the brand does not have |
| `asset-missing` | An image file a composition names by `src` that is not there; `asset` is the element ID |
| `asset-file-missing` | A recorded asset's file or sidecar that is not there; `asset` is the asset ID |
| `asset-hash-changed` | A recorded asset, sidecar, icon entry or build copy that changed since it was recorded |
| `asset-conflict` | An asset ID already recorded for a different file, kind or icon, or a recorded icon that is not its candidate's library ID |
| `assets-busy` | Another asset command holds `.harness-slides/assets.lock` |
| `provider-missing` | An image provider that is not set up: no API key, or no web sign-in; `provider` names it |
| `renderer-unavailable` | Poppler or LibreOffice is not installed; `provider` is `poppler` or `libreoffice` |
| `provider-failed` | A Google access or upload failure during preview or a Google-rendered review (`provider` is `google`), or an image provider that refused or failed (`provider` is `gemini-api` or `gemini-web`; `next` is its own advice) |
| `render-failed` | A render that produced no PDF or the wrong page count |
| `output-exists` | An output directory that already exists |
| `input-missing`, `input-invalid` | A missing or unreadable input file, `--section` without `--design-project`, a malformed review assessment or one citing sources that are not its slide's, a `review` given the wrong combination of sources, a `review` operation on a folder that holds no review, or a call that mixes preparing with another `review` operation |
| `unclassified` | Anything else; not recoverable until a person has looked |

## Native charts

A composition places a chart as a leaf node:

```json
{"type":"chart","id":"bookings_chart","kind":"bar","title":"Bookings by region","units":"$M",
 "source":"Finance close, Q3 2026",
 "data":{"categories":["North","South","West"],
         "series":[{"name":"2025","values":[12.5,9,7]},{"name":"2026","values":[15,11.25,8]}]}}
```

| Field | Rule |
| --- | --- |
| `kind` | `bar` (clustered columns), `line` or `pie` |
| `data.categories` | 2–24 distinct labels of up to 60 characters; 2–8 for a pie |
| `data.series` | 1–6 `{name, values}` with distinct names; `values` holds one finite number per category, each below 10^15 in size. A pie has exactly one series, of values zero or more with a total above zero |
| Colors | Series in order take the brand's `slides.chart.seriesRoles`; a pie's slices do. More series, or slices, than the brand has chart colors is refused. Colors are not repeated or tinted |
| `title` | Optional. The chart's own title, in the chart |
| `units` | Optional. The value axis title. Refused on a pie, which has no value axis |
| `source` | Optional. A caption line under the chart, `<id>_source`, and the chart's recorded evidence. Without it the chart records the slide's `source` line, or else its source IDs |

A chart shares space like an image and needs at least six lines of its label size
(seven and a half with a title), plus its caption. It is never grouped, as a
table is not. It draws the `quantity` relation. Each problem is a compile error
against `slide/node`, and with `--json` a `composition-invalid` refusal that
names the slide.

The native template emitter writes, for each chart, a graphic frame on the slide
named after the node, a chart part `ppt/charts/harnessChartN.xml`, its
relationship to `ppt/embeddings/harnessChartN.xlsx`, and the content types. The
workbook holds the categories in column A and one column per series, names in
row 1. The chart's formulas name those cells, and its caches hold the same
values, so it draws without opening the workbook, and editing its data in
PowerPoint opens the same numbers. The workbook is written with Python's
standard library. A brand without a native template gets the chart from the
generated deck, as before. Whether a chart survives a Google import has not been
checked yet; see
[the manual check](../verification/2026-10-14-native-charts-google-import.md).

## Combinations that do not work today

- A bound composition compiled without `--section` must list every slide in the
  design, cover and closing slides included. Every slide in the design needs a
  full intent and asset decision, even one only the lead builds.
- `compose compile` without `--design-project` still checks fit only, even
  when slides carry `intent`. The design-missing refusal comes when it writes
  a build.
- `compose preview` rechecks the design only when it is given
  `--design-project`. It does not compare the build's recorded
  `designRevision` with the current one. It checks the slides against the
  design approved now.
- `compose preview` output is not a review record. `design present` takes the
  output of `review --compiled` for a composition, or a review of a scene build
  or a native Google snapshot. `compose critique` stays a separate,
  independent-reviewer critique of a preview. It is bound to the preview's deck
  hash, not to the design.
- `review --compiled` reviews the whole deck, never a section. It takes no `--fonts`, so its screens measure
  text with the fonts installed on this computer.
- The prose-card prompt reads the build's geometry and the approved intent. It
  cannot tell whether a drawn diagram is correct. That judgement is the
  assessment's, under `visual-relationship` and `teaching-treatment`.
- Asset candidates are checked against the manifest only by `assets check
  --design-project`, not by `design check` or a build. A build does not compare
  the icons it places with the approved candidates; the design-bound review
  prompts when none of them is on its slide.
- A library-ID candidate is checked against the brand only when `--brand` is
  given. A free-name `ref` is never matched to a library icon; the caller still
  finds it.
- Only `compose compile` resolves asset IDs. A deck plan's `assets` and a scene
  still name files.
- `objectives` and `qualifications` are checked when proposed and then only kept.
  No build compares a composition's words with the approved copy. `notes` are not
  copied into a composition.
- `--json` is not available on `deck compile`, `workspace`, `pptx` or
  `google`. Their refusals are still stderr sentences.
- A design lock left by a stopped process is not cleared automatically.
- A path outside the project stays absolute (see
  [paths in records](#paths-in-records)), and so does an image a composition or
  scene gives by `src`: `scene.json` hands that path to the renderer. Place an
  image by asset ID to have it copied into the build. A review record or
  workspace manifest written before relative paths does not survive a move until
  it is written again.
- `design status` reports pending slides, but not pending asset candidates;
  `assets status --design-project` does.
- An image generated before the manifest existed is recorded when `images
  download` is run again with its project and ID.
- A chart's colors are the brand's chart colors. The deck direction does not
  govern them, so a chart may use the focal color.
- A chart cannot be placed inside a group. A card whose children are a chart
  between two other nodes is refused at render, as one holding a table is.
- A composition chart has not been through a Google import. Until
  [the manual check](../verification/2026-10-14-native-charts-google-import.md)
  is run, `compose preview` with the Google renderer shows what the importer
  makes of it, and nothing more is promised.
- A session record whose revision predates [canonical digests](#key-order) is
  refused if a tool rewrites it with its keys in another order. Its revision stays
  order-dependent until a changed proposal replaces it.

## Not in this change

- Version and release. Release 0.14.0 (issue #51) raised `minimumRuntime` to
  0.14.0 and applied the lines in
  [guidance for the release](#guidance-for-the-release) and the sections after it
  to live guidance, with a short note on schema 2, batch mode and `--json` in
  `references/design-records.md`.
- Release 0.14.1 raised `minimumRuntime` to 0.14.1 and applied the lines in
  [guidance for 0.14.1](#guidance-for-0141-composition-review-gaps) (issue #67)
  to live guidance.

## Guidance for the release

These lines need runtime behaviour after 0.13.1. They, and those in the sections
below, were applied in 0.14.0 (issue #51), which raised `minimumRuntime`. Each
replaces the text quoted before it.

`references/compositions.md`, in "Build, look, fix", replace "Add
`--design-project CONTENT` to `compile` only when slides carry `intent` blocks
approved through `design propose`." with:

> Add `--design-project CONTENT` to `compile` and `preview` when slides carry
> `intent` blocks approved through `design propose`. `compile` then checks the
> design even without `--output`. A file that holds only some of the approved
> slides, neighbours in approved order, adds `--section`. The whole deck never
> takes `--section`: it lists every approved slide.

`references/parallel-build.md`, in "The worker brief", after the paths bullet:

> - When the deck is bound to an approved design: the design project, and that
>   its slides must keep their approved IDs, order, titles and `intent`.

`references/parallel-build.md`, in "If you are a worker", before "Check with
`compose compile` and no `--output` until it fits", insert:

> Under an approved design, add `--design-project CONTENT --section` to each
> `compile` and `preview`. A refusal names the slide that is missing, extra,
> out of order, retitled or given a changed `intent`.

`references/design-records.md`, in the opening paragraph, replace "pass
`--design-project CONTENT` to `compose compile` with `--output`, and list every
composed slide in the proposal, in order and with the same titles." with:

> pass `--design-project CONTENT` to `compose compile` and `compose preview`.
> A whole deck lists every proposed slide, in order and with the same titles;
> a section file adds `--section` and lists a run of neighbouring ones.

## Guidance for the release: the asset manifest

Live guidance on `main` is read by installs still running 0.13.1, which has no
`assets` command and no `asset` image node. These lines go into guidance with the
release that raises `minimumRuntime` (issue #51), and not before:

- `references/images.md`, after the generate example: "The image is recorded in
  the project's asset manifest under its `--id`. Pass `--alt` with what it
  shows. Place it in a composition as `{type:image,id,asset:ID}`, not by path."
- `references/images.md`, *Where an image belongs*: "A supplied image is recorded
  first: `assets add-supplied FILE --project DIR --alt TEXT --source TEXT`, with
  `--restrictions` for any limit on its use and `--kind screenshot|chart` when it
  is one."
- `references/compositions.md`, on images: "Name a recorded image by its asset
  ID: `{type:image,id,asset:ID}` or `picture:{asset:ID}`. Compile with
  `--asset-project DIR` when the assets are not in the design project. `assets
  status` lists the IDs."
- `references/design-walkthrough.md`, where it asks for a concrete asset candidate: "Use the manifest's
  asset ID as a candidate's `assetId`. Record icons with `assets icon ICON_ID
  --id ASSET_ID --brand brand-contract.json`. Before building, run `assets check
  --project DIR --design-project DIR` and resolve what it reports."
- `references/parallel-build.md`, for workers: "Use only asset IDs that `assets
  status` lists. Do not copy image files into a section."
- `SKILL.md` task table, beside *Custom image generation or image setup*: a row
  "Supplied images, brand icons or generated art a deck uses | [Images](../../references/images.md)".

## Guidance for the release: exact icons

Installs still running 0.13.1 refuse `refType` on a candidate, `--brand` on
`design propose` and `asset` on an icon node. These lines go into guidance with
the release that raises `minimumRuntime` (issue #51), together with the asset
manifest lines above, and not before:

- `references/design-walkthrough.md`, after the asset manifest line on candidates:
  "For an icon, search the brand icon library and give the icon's ID as `ref`
  with `refType: "library-id"`, so the approved icon is exact. Propose with
  `--brand brand-contract.json` to have each ID checked."
- `references/compositions.md`, after "Search the brand's icon library for icon
  IDs.": "An icon recorded in the asset manifest is placed by its asset ID:
  `{type:icon,id,asset:ID}`, compiled with `--asset-project DIR` when the
  assets are not in the design project."
- `references/parallel-build.md`, for workers, after the asset manifest line:
  "Place a recorded icon as `{type:icon,id,asset:ID}`."

## Guidance for the release: design-bound composition review

Installs still running 0.13.1 have no `review --compiled`, no `designReview`
and no `teaching-treatment` criterion. These lines go into guidance with the
release that raises `minimumRuntime` (issue #51), and not before:

- `references/compositions.md`, in "Deliver", after the `compose critique`
  paragraph that ends "A reviewer does not change brand colors or what a slide
  says.":

  > When the deck is bound to an approved design, review the build against it
  > as well: `review --compiled NEW_DIR --output REVIEW --design-project CONTENT`.
  > It renders `REVIEW/deck.pptx` and asks, for each slide, whether the visual
  > teaches what the design approved. Inspect each image and mark it, answer
  > every criterion with `review --assessment`, then `design present` the
  > review. Deliver `REVIEW/deck.pptx`. The independent `compose critique`
  > still applies.

- `references/compositions.md`, in "Deliver", replace "Read [review](../../references/review.md)
  only for a requested PDF export or an editability check." with:

  > Read [review](../../references/review.md) for a design-bound review, a requested PDF export
  > or an editability check.

- `references/review.md`, the table row for Compositions, "Before delivery"
  column, replace it with:

  > `compose preview` of the whole build, every image opened. With an approved
  > design, also `review --compiled` and [native critique](../../references/native-critique.md)'s
  > assessment. Nothing else is required unless a PDF export or an
  > editability check was asked for

- `references/native-critique.md`, after the paragraph that ends "This targets
  boilerplate, not a claim that string validation proves comprehension.":

  > A composition is reviewed with `review --compiled COMPILED --output REVIEW
  > --design-project CONTENT`. Its packet is the same, and `designReview` sorts
  > what needs attention into asset failures, design deviations, visual
  > teaching problems, fit defects and approved direct text. A `prose-cards`
  > prompt means a mechanism is drawn as boxes of sentences. Answer its
  > `teaching-treatment` criterion by citing the cards, and say what the
  > learner cannot see or why the cards teach it. Boxes alone are not the
  > defect. A direct-text slide approved for its reason passes without
  > graphics.

- `references/design-walkthrough.md`, in "Show rendered output and pause
  again", replace "For compositions these are the images from the final
  `compose preview`;" with:

  > For compositions these are the images from the final `compose preview`, or
  > from `review --compiled` when the deck is bound to an approved design;

- `references/design-records.md`, in "After rendering", after "For a workspace,
  use its `build/review` directory so readiness binds the acceptance to that
  exact built artifact.", add:

  > For a bound composition, use the `review --compiled` output directory.

## Guidance for the release: native charts

Installs still running 0.13.1 refuse a `chart` node as an unknown node type, and
their guidance rightly says compositions have no charts. These lines go into
guidance with the release that raises `minimumRuntime` (issue #51), and not
before. Apply them once
[the Google import check](../verification/2026-10-14-native-charts-google-import.md)
has been run, and add to the last paragraph whatever it finds the importer loses.
The check had not been run when 0.14.0 was released, so the last paragraph says
that the Google import is unchecked; replace that sentence with its findings.

- `references/compositions.md`, in the node table, after the `table` row:

  > | `chart` | A native bar, line or pie chart in the brand's chart colors, its data editable |

- `references/compositions.md`, after the paragraph on `table` that ends "a
  table compares values and is not a place for sentences.":

  > A `chart` takes `kind` (`bar`, `line` or `pie`) and `data`: `categories`,
  > 2 to 24 short labels, and `series`, each a `name` with one number per
  > category. A pie has one series and at most eight slices. Each series, or
  > each slice of a pie, takes the next brand chart color, and `compile`
  > refuses more than the brand has. `title` sits in the chart, `units` titles
  > the value axis and `source` is a caption under it. Use a chart when the
  > shape of the numbers is the point. For one number use a `metric`; for a few
  > exact values, a `table`.

- `references/compositions.md`, replace "Native charts and hyperlinks are not
  available in compositions yet. Show a few numbers as bars drawn to scale or as
  a table. A deck that needs a real chart is built with [another
  method](../../references/authoring.md); the methods cannot yet be mixed in one build." with:

  > Hyperlinks are not available in compositions yet. A chart is written as a
  > native chart with its own workbook, so its data can be edited in
  > PowerPoint.

- `references/content-components.md`, replace "Prefer
  [compositions](../../references/compositions.md) for new slides. Use these typed components
  for charts, which compositions do not yet express." with:

  > Prefer [compositions](../../references/compositions.md) for new slides, charts included. Use
  > these typed components for a deck already built with them, or for a chart
  > linked to Google Sheets.

## Guidance for 0.14.1: composition review gaps

These lines need runtime behaviour after 0.14.0, which has no `--renderer` on
`review`, no `--packets`, no `sources` from the slide and no
`design present --accept-findings`. They were applied in 0.14.1 (issue #67),
which raised `minimumRuntime` to 0.14.1:

- `references/compositions.md`, in "Deliver", replace "Inspect each image and
  mark it, answer every criterion with `review --assessment`, then
  `design present` the review." with:

  > `review --output REVIEW --packets` returns every slide's picture and
  > criteria in one call. Inspect each image and mark it, answer every
  > criterion with `review --assessment`, then `design present` the review.
  > Without LibreOffice, add `--renderer google` to `review --compiled`: it
  > renders through Google Drive, and the reviewed deck is still
  > `REVIEW/deck.pptx`.

- `references/native-critique.md`, after the paragraph that ends "A direct-text
  slide approved for its reason passes without graphics.":

  > In a composition review a check may leave out `sources`: it takes its
  > slide's. Sources that are given must be the slide's.

- `references/design-records.md`, in "After rendering", after "For a bound
  composition, use the `review --compiled` output directory.":

  > When the person is to decide on a deck whose review still lists findings,
  > run `design present --accept-findings`. The question lists the findings.
  > Show them with the slides, and record the person's answer with
  > `design respond`. Never answer it for them.


## Workflow integrity in 0.15.0 (unreleased)

Composition compilation now stores `composition.json` with copied image paths and a
`project.json` record. `--project ROOT` on `compose compile` registers builds under
an outline project. Output must lie inside that project; standalone compiled
folders are projects themselves. `studio --project ROOT` opens either project
kind. Composition studio edits change source text and recompile; geometry changes
belong in the composition source. Older compiled folders need recompilation to
use composition history/studio.

`compose preview` writes a schema-2 `critic.json`. Its `answer.slides` template has
`{id, answers:[eight booleans], note}` per slide. Fill every answer, provide an
inspection note for that slide, and list a finding for each false answer. A true
answer cannot also have a finding. The command verifies `deck.pptx` and every
image hash before storing a receipt. Legacy packets need a new preview.

Native bundles live under the compiled folder's parent in
`.harness-slides/render-bundles`. Input content, brand authorities, fonts,
renderer signature, runtime code and dependencies determine reuse. Unchanged
builds reuse the exact PPTX and pixels across output locations. Equivalent slide
fingerprints can reuse unaffected page images after a changed deck has been
converted; native PDF conversion may still require the full deck. Thumbnailing
uses existing PNGs. Corruption or missing cached files triggers a new render.
Review receives the same bytes as preview; neither new output locations nor
cache hits transfer inspection notes or user acceptance.

Google preview ownership receipts live in `HARNESS_PREVIEW_STATE`, or
`~/.local/share/harness-slides/previews`, with private permissions. Receipts bind
the file ID, random ownership marker and Drive version. `--file-id` validates the
receipt and remote marker/version, then creates a fresh preview to preserve the
previous file: atomic conditional media replacement has not been established.
Always use the returned ID. A lost receipt, missing version or intervening edit
requires a new preview without `--file-id`. No cached local render certifies a
live Drive deck's current state.


## Visual vocabulary in 0.16.0 (unreleased)

Decks built through Training Studio with 0.14.1 came out as thin outlined boxes,
sentences chopped across diagram nodes, internal finding IDs on the slides and
hand-typed `- - >` arrows. 0.16.0 gives composers a fuller vocabulary and the
audits to hold them to it. Existing compositions compile as before, except that
words drawn over other words are now refused and an arrow to a text now attaches.

| Addition | What it does |
| --- | --- |
| `style: "tint"` on a box | A light surface of its `fill` (the neutral by default); the focal node keeps a focal edge. Guidance now makes `tint` or `bar` the supporting card and keeps `outline` for boundaries. A brand contract with `design.slides.fills: {tints: false}` forbids lightening its colors: there `tint` compiles as a neutral bar card with a strip of its fill color (or a plain neutral card without a fill), and `compose contract --brand` says to use `bar` |
| Supporting fills | A direction without `meanings` may fill with up to three brand colors: its chart colors, then other `accent*` roles, minus the focal and the neutral. `compose contract --brand` lists them; `compile` reports `supportingColors`; `structure.json` records `supporting` |
| `state` on a box or text | `muted`, `struck` (strikethrough) or `failed` (a box: status-colored dashed edge and a grouped `<id>_state` × badge). A box's state carries to what it holds. The focal node cannot take one |
| Edge `style` | `dashed` or `dotted`, written as a native dash in PPTX and Google Slides |
| Edges to texts | A text an edge points at is sized to its words, and the connector attaches to it |
| Labelled cards | Two or more cards in a row, column or grid, each headed by a `label` text, draw `dependency` without edges |
| Outline `parts` | Short labels approved for diagram nodes, so a sentence need not be split |
| `split-point` | With `--outline FILE`, or `--project ROOT` whose `project.json` names an outline, `compile` refuses a reading deck whose approved point's sentence is spread over several nodes. A live deck gets `splitPoints` in the result. The outline is recorded in `compose-report.json` `inputs.outline`, and `preview` reports `split-point` (error for reading, warning for live) |
| `provenance` | On an outline content slide and a composition slide. Never drawn; appended to the notes as `Provenance: …`. `source` is a learner-facing citation; `internal-source` warns on finding/objective IDs, blueprints and slug-prefixed references |
| Words over words | `compile` refuses two texts whose measured words overlap; empty padding does not count. A failed box keeps its words and children clear of its badge |
| Word wider than its line | `compile` refuses a word (split at spaces and hyphens) wider than the text it sits in, which every renderer would break mid-word |
| Estimated measurement | Without the brand font both refusals become `unverifiedFit` entries in `structure.json` and `unverified-fit` preview warnings |
| `outline-changed` | A preview of a build whose recorded outline is changed or missing reports an error-level finding, so it blocks in `repair` |
| `ascii-art`, `no-meanings` | Preview warnings for typed arrows, box-drawing or punctuation-only placeholders, and for a deck of more than ten content slides whose direction has no meanings |
| `repair` | `preview.json` groups warning and error findings per slide: `{blocking:[slide IDs], slides:[{slide,number,blocking,codes,objects}]}` |

What a caller does:

- Pass `--project ROOT` (from `outline start`) or `--outline outline.json` to
  `compose compile`, so split points are found. Treat a refusal as a repair
  round for the named slides.
- Use `repair.blocking` and `repair.slides` from `compose preview` to send
  slides back for repair before the critique; treat `split-point` as blocking.
- Put finding and objective IDs in `provenance`, not `source`.
- Give long decks `direction.meanings`; brand add-ons may suggest them.
- A brand add-on whose rules forbid tints (Broadcom, Tanzu) exports
  `design.slides.fills: {tints: false}` in its contract; the engine then never
  lightens a brand color.
- Host the checkpoints in the studio's own interface: draft approval, the look
  choice and final acceptance. Hosting one never skips it. When the brand add-on
  supplies directions (Tanzu Brand's `look samples|choose` writing the outline's
  `direction`), take the look from that step.
- Detect support with the `compose-visual-vocabulary`, `compose-split-point`,
  `compose-provenance` and `preview-repair-clusters` capabilities.
