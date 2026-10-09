# Font screening and structured critique

Use this path for compiled decks or content/design review. Run commands from the
returned runtime; the agent owns the reports and judgments. Users supply briefs
and feedback, not JSON.

`deck compile` writes `quality-report.json` beside the scene, design report and
brand contract. It shapes text using the exact regular/bold font files, wraps
words and graphemes within each text box or unequal table column, and reports
measured height/width, missing glyphs, content collisions and unmatched numeric
title claims. Missing fonts are disclosed; a substitute is never called exact.
For a font outside the normal system locations, pass `--fonts fonts.json`:

```json
{"regular":{"path":"/absolute/Brand-Regular.ttf","sha256":"HASH"},"bold":{"path":"/absolute/Brand-Bold.ttf","sha256":"HASH"}}
```

The hash is optional on input and recorded on output. Font bytes are not copied
or bundled. The model uses conservative font line metrics, 125% paragraph line
spacing and 3.6 pt text insets. Native table padding, fallback glyphs, tab stops,
language-specific breaks and target-editor wrapping still require native review.
Warnings identify objects/cells, not a request to shrink every slide. Repair the
allocation, wording or composition within scope, then render it again.

Initialize a compiled workspace with its design report so intent and evidence
stay pinned. A build regenerates font measurements and binds critique to its
current scene, quality revision and artifact digest:

```sh
node scripts/harness-slides.mjs workspace init --project WORKSPACE --file COMPILED/scene.json --brand COMPILED/brand-contract.json --design-report COMPILED/design-report.json --design-project CONTENT --format pptx
node scripts/harness-slides.mjs workspace quality --project WORKSPACE --slide SLIDE_ID
node scripts/harness-slides.mjs workspace critique --project WORKSPACE --assessment critique.json
```

After building, use the returned report path. An assessment uses `schema:1`, its
`sceneDigest`, `qualityRevision` and `artifactDigest`, and `slides:[{id,checks}]`.
Every required check has `criterion`, `status` (`pass`, `issue`, `uncertain`), a
specific `reason`, actual `objects` IDs and retained `sources` IDs. The report
supplies each slide's exact criteria and review questions. Assess title support,
visual relationship, reading order and technical fit. Three occurrences of equivalent rendered-scene geometry across
component names or three consecutive identical components ask for justification; comparable content may warrant
repetition. Do not alternate layouts mechanically.

Read the cited evidence and view the native pixels before judging. Source IDs
and matching numbers cannot prove semantic support. Record uncertainties and
issues honestly. New creative workspaces require complete, current critique and
visual review before readiness; previously saved plain-scene workspaces retain their existing
visual-review behavior. Scene changes, artifact edits, font drift or changed
pinned intent invalidate the relevant evidence. Structural changes need a fresh
design handoff/workspace; do not edit pinned inputs to make checks pass.

`workspace repair` returns only the chosen slide, its object/cell measurements,
findings, intent, review questions and expected digest. Save an explicit scoped
repair as a new scene version, rebuild, reassess and inspect the final deck.

Schema-2/new-workspace critique also judges explanatory value, focal hierarchy
and asset purpose. Review the report's deck geometry groups and the whole deck,
not only adjacent IDs. Ask what each treatment makes easier to understand than
a list. Repeated objection/response comparisons can be appropriate; different
technical relationships in equivalent panels need a specific recomposition
finding. Geometry signals request judgment and never force variety.

Native-template authoring requires [structured native critique](native-critique.md)
against the native revision and actual slide/object IDs, plus the approved proposal.
A bulk pixel note does not complete this assessment. Custom scenes
carry optional intent; new creative work should supply it. Existing pinned tasks
keep their recorded guidance/runtime; don't rewrite them to meet new contracts.
