# Typed components

Prefer [compositions](compositions.md) for new slides. Use these typed components
for tables and charts, which compositions do not yet express.

Approve [the per-slide proposal](design-walkthrough.md) first and keep it in
[checkpoint records](design-records.md).
For a new deck, the agent can prepare a typed deck
plan instead of hand-placing every object. Unbranded decks use neutral defaults;
pass a resolved brand contract when identity is selected. Decide each slide's takeaway,
relationship, rationale and evidence **before** selecting its component. Reuse a
component when the content warrants it; do not propagate the first slide's list
format or alternate layouts mechanically. Examples are demonstrations, not deck
outlines to copy.

Query only the needed component:

```sh
node scripts/harness-slides.mjs deck contract --id comparison
node scripts/harness-slides.mjs deck inspect --file plan.json
node scripts/harness-slides.mjs deck compile --file plan.json --brand brand-contract.json --design-project CONTENT --output NEW_DIR
```

The compiler supports statement, comparison, categories, process, timeline,
architecture, metric, table, chart, quote and annotated image. It produces native
text, shapes, lines, tables and chart data using the selected brand's type roles,
colors and safe boxes. Unsupported content fields fail rather than disappear.
Use a custom scene or native template when these components don't fit the content.

`design-report.json` retains intent, evidence, asset use, hashes and design choices.
`quality-report.json` adds exact-font screening and structured review prompts;
follow [quality](quality.md). Warnings require native inspection; metrics are not proof.
Rewrite within the user's scope, split content or choose another composition
before shrinking text. Metrics require context and a qualifier. Image captions
and chart sources remain visible. Do not invent evidence to fill a template.

Missing image requests appear in `deck inspect`. Resolve them using
[images](images.md), or authorized existing assets; then set the plan asset's local
path and alt text. Native diagrams should stay editable. Use the selected brand's
approved icon search/native-copy helper when icons help convey meaning; record
placements and inspect the resulting deck. There is no icon or image quota.

For PPTX, render the compiled `scene.json` with its copied `brand-contract.json`,
or initialize a workspace with both. Native master artwork comes from the actual
brand template, not a re-created logo or theme approximation:

```sh
node scripts/harness-slides.mjs workspace init --project WORKSPACE --file NEW_DIR/scene.json --brand NEW_DIR/brand-contract.json --design-report NEW_DIR/design-report.json --design-project CONTENT --format pptx
node scripts/harness-slides.mjs workspace build --project WORKSPACE
```

For Google, select real layout IDs from the **working-copy** snapshot where
needed, then use the existing Google workspace flow. Local images need native
insertion or an authorized public HTTPS asset; charts need a linked Sheets chart.
Google tables use native cell padding and minimum row heights; readback checks
content, position, widths and overflow. Diagram edges are editable lines, without
automatic attachment when a node moves. Notes use a staged revision-controlled native batch.
Follow [review](review.md) for target rendering and visual verification.

## Content decisions and expressive constructions

New plans use schema 2: every intent includes an audienceQuestion, alternative
{treatment,reason} and visual {family,purpose,route?}, alongside takeaway,
relationship, rationale and retained evidence. Query only the selected contract.
Saved schema-1 plans retain their rendering; do not silently redesign them.

Comparison variants `open` and `rows` avoid full-height card backgrounds.
Categories support `open`. `paired-diagram` places two sourced native node/edge
models side by side; use matched actors and labeled connections. `decision`
uses positioned nodes and labeled branches. `scope` expresses labeled ownership
regions without inferred nesting. `evidence` separates a focal finding from its
explanation and qualifier. Custom scenes remain available for richer structures.
Diagram positions are normalized within the content region. Edges are editable
lines, not automatically attached connectors; movement requires updating them.

An image component may include an editable `explanation`. Consider generated
art before selecting layout, not as decoration after compilation. Resolve the
asset request with the authorized image helper, retain its metadata path, inspect
the pixels, and provide alt text. Keep technical labels/claims native. Google
local assets need an authorized upload/import route; never invent a public URL.
