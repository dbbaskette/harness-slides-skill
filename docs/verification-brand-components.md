# Combined brand and content-led generation verification

The user selected “Both together: a larger brand-and-slide generation change.”
The implementation spans Harness Slides, Tanzu Brand and conditional Blog Studio
guidance. It preserves the existing image worker and unrelated working-tree edits.

## Implemented behavior

- `deck inspect/compile/contract` gives the agent typed per-slide components:
  statement, comparison, categories, process, timeline, architecture, metric,
  table, chart, quote and annotated image. Each slide retains its takeaway,
  relationship, rationale and evidence. Composition choices do not carry forward
  automatically. Repetition prompts a content review, not forced alternation.
- Unbranded plans use resolved neutral defaults. Selected brands resolve their
  actual palette, type roles, canvas and safe regions. Unknown content fields,
  missing evidence references and unresolved image needs fail explicitly.
- Compilation records intent, asset provenance, input hashes and estimated fit.
  It does not silently shrink type or invent claims. Dense content still needs
  author judgment, native rendering and visual correction.
- Tanzu's `contract export/check` provides a hash-bound JSON handoff and separate
  design/language views, using existing canonical files. Organization language
  rules stay separate from author voice. Provisional voice remains provisional;
  unspecified organization tone is not inferred from artwork.
- Blog contracts exclude slide geometry. Blog Studio's conditional guidance
  reuses its existing author profile selection, storage and task pins. The
  portable voice input contains only the explicitly selected profile.
- Branded PPTX rendering retains original native template master/layout, theme,
  media and notes-master parts. The original source is not modified. Private
  working-copy normalization handles XML BOMs and the relationship namespace
  required by the composition parser. Layout selection is checked on output.
- Native charts keep signed data and room for negative labels. Tables support
  brand header colors, unequal column widths and PPTX cell padding. Diagram
  lines support both endpoint directions.
- Google table creation is followed by explicit translation and column/row
  sizing, reflecting Google's documented table behavior. Readback checks text,
  typography, effective geometry, column widths and overflow. Workspace results
  expose native-padding limitations. Source drift also invalidates a built brand
  handoff before a guarded apply can proceed.

Google sources: [table operations](https://developers.google.com/workspace/slides/api/samples/tables),
[transforms and table limits](https://developers.google.com/workspace/slides/api/guides/transform),
[table properties](https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/tables).

## Native visual inspection

An eleven-slide synthetic deck compiled from `examples/deck-plan.json` was
rendered through LibreOffice PDF / Poppler. All eleven slide PNGs were inspected.
Titles, footer clearance, card text, process arrows, timeline, architecture lines,
metric qualifier, table cells, quote attribution and image annotation were legible.
A negative bar value label collided with its category label in the first render;
its axis range was corrected, then re-rendered and inspected. The other ten PNG
hashes were unchanged and their earlier visual evidence was reused.

A final native text-fill correction preserved the declared image-callout background.
Slide 11 was re-rendered and inspected; the other ten PNG hashes were unchanged.
Final inspected PPTX revision:
`bcbbd24ce6c1a54a2e6a5af47f11da08f6ea50edc47eaf774882601d7d620b7d`.
Artifacts and the revision-bound review receipt remain in
`/private/tmp/brand-slide-increment/review-delivery/` and
`/private/tmp/brand-slide-increment/mixed-delivery.pptx`.
This is a synthetic behavior/geometry check; LibreOffice does not establish live
Microsoft PowerPoint or Google Slides fidelity for every input.

## Test evidence

- First Harness Tart milestone: **48/48 passed, zero skips**, macOS 27.0,
  Node 22.23.2, native rendering, browser editing, optional image runtime source
  audit, eleven Python image-worker cases, installer and context checks.
  Runtime content digest
  `11a19dd875e13f807668312e04e28bf8f4be911bdb32cbb0fe5330fa23202b0a`.
  Logs: `/private/tmp/harness-brand-ci/harness-slides-test-20261008025243-14117-ca1d46e9/`.
  That owned clone was deleted. This milestone precedes the final neutral-default
  and workspace-reporting additions.
- Final host Harness suite with native rendering enabled: **49 passed, one opt-in
  browser test skipped, zero failures (50 total)**. The unchanged browser path
  has the final combined Tart evidence below; native rendering and new compiler/source-drift
  cases ran. Targeted final component
  checks: **8/8 passed**. Log: `/private/tmp/brand-slide-increment/final-host-native-suite.log`.
- Tanzu contract/native integration targeted checks pass, including exact retained
  master/layout bytes, speaker notes through the active composed slide part,
  voice state, exclusive export, source drift and legacy engine compatibility.
- Blog Studio's package/provenance/link validator and guidance inventory checks
  pass. Its edits are conditional Markdown guidance; its runtime is unchanged.
- Skill frontmatter validation passed for Harness Slides, Tanzu Brand and Blog
  Studio. Context link/count checks and diff whitespace checks passed.

The first combined Tanzu Tart run found fourteen synthetic installer fixture
failures: its trusted source expects released version 0.2.0 while the local
candidate is 0.4.0. Installer fixtures now export the actual unchanged trusted Git commit into owned
disposable scratch space; candidate feature tests use the new runtime separately.
No candidate package version is relabeled. Production acquisition still enforces
the exact trusted revision/version. The thirty-two affected installer, Mac setup,
release and update checks pass. Older installed engines retain their scene
workflow; new shared contracts/components require the separate 0.4.0 runtime.
A second combined run completed all 291 Brand tests (287 passed, four opt-in
browser tests skipped, zero failures), but a host edit to the shared guest script
disrupted its active shell read before the remaining gates. Its owned clone was
deleted. The final run uses the frozen corrected script, with the unchanged
release-pin installer fixtures and disposable optional image-test dependencies.

The final combined run **passed** on macOS 27.0 / Node 22.23.2:

- Brand: **287 passed, four opt-in browser skips, zero failures (291 total)**;
  the subsequent activated browser suite passed **15/15 with zero skips**.
- Harness Slides: **50/50 passed, zero skips**, with browser and native rendering
  enabled. The optional image runtime audit and eleven Python worker fixtures ran.
- Harness Research: **32/32 passed** for the unchanged dependency.
- Dependency audits, context/generated-file checks, source and Mac installers,
  release packaging, public-release smoke checks, reproducibility and portable
  installation gates passed.

Logs: `/private/tmp/tanzu-brand-combined-ci/tanzu-brand-test-20261008031230-35143-c89861d7/`.
Brand source was commit `495dacf744618a40c829cccef9f38018a4ab496d` plus this
increment's uncommitted changes. The frozen Slides candidate runtime digest was
`e209c246eebefb3f30a25710b4d725c28c2b58a588fa617d6f7060dbb3af7a44`.
After freezing that candidate, the final native text-fill correction and explicit
linked-chart styling limitation were verified by the complete host native suite
and final slide inspection. Unchanged browser/installer evidence was reused.
The final local runtime digest is
`f64b252f3eba53562925ac97f6aa5b2d7cff1eccaa5147a465941803341e034b`;
it is distinct from the frozen Tart candidate. Harness base commit is
`3ad89ccf35afc3c37e04cfab5abc9635418a6cf8` with the preserved working-tree changes.

All owned disposable test clones were deleted. Preexisting ignored dependency
archives and their manifest were restored; the tested candidate archive and
manifest remain under `/private/tmp/brand-slide-increment/`. No global skill
installation or publication was performed.

## Limits

No live Google write, browser account sign-in or Gemini generation was performed.
Google charts still require a linked Sheets chart and retain its source styling;
apply brand colors/type in that spreadsheet before native review. Local images
need native insertion or authorized public HTTPS assets. Google notes remain a native-tool
operation. Google table cells use editor padding defaults and rows can expand;
overflow readback and native visual review are required. Diagram edges are
editable lines without automatic attachment after moving nodes.

Custom geometry and approved native icon copying remain existing escape paths.
There is no forced icon/image quota, arbitrary HTML-to-PPTX converter, new voice
training/store, publication, global installation or live provider acceptance claim.

## Publication snapshot

The publication branch excludes the preexisting DNS diagnostic edits in
`bootstrap/SKILL.md`, `scripts/sync-guidance.mjs`, `tests/guidance.test.mjs` and
the matching README paragraph. Those edits remain untouched in the original
checkout. Historical working-tree measurements above include them; the current
README has freshly measured counts for the publication snapshot. Its bootstrap
is 385 tokens and normal entry is 1,163; content-led PPTX is 4,467. The brand
increment remains +19 tokens on normal entry when comparing the same bootstrap.
Publication runtime digest:
`c92d345b24504868cbbaf253a6e4182512978cda2edb24f643428fa2851dea0f`.

The initial publication host attempt could not bind local test servers inside
the sandbox. Its permitted retry passed 46 of 48 checks; two could not run
because host Pillow and the Playwright browser binary were absent. These are
environment prerequisites, so the final publication gate uses the existing
disposable Tart runner with its dependency setup.

Final publication gate: **48/48 passed, zero skips**, macOS 27.0 / Node 22.23.2,
with browser/native rendering, audited image dependencies, installer and context
checks enabled. Logs: `/private/tmp/brand-slide-publication/harness-ci/`
`harness-slides-test-20261008033648-63637-065c4e3f/`. The owned VM was deleted.
Its installed digest exactly matches the publication runtime above. Subsequent
changes only add this record and remove a temporary development-only dependency
symlink from Git; the runtime payload is unchanged.
