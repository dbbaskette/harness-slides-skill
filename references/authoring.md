# Editable authoring

Choose one path. For a native template, copy it and reuse its actual layouts,
masters and elements. For supported new compositions, an AI-owned scene provides
stable object IDs, geometry in points, semantic roles and evidence references.
The same scene creates HTML previews and native output. It is not a general CSS
converter. Use native tools for unsupported objects; never flatten them.

```sh
node scripts/harness-slides.mjs scene contract
node scripts/harness-slides.mjs scene validate --file scene.json
```

Assign required source IDs to material claims/sections before authoring. Pass
their JSON list with `--required`; `sources` coverage helps catch omitted material
but does not establish factual correctness. Use actual provenance, not invented
IDs that imply a citation. Mark illustrative data and proposed ideas explicitly.

## Google Slides

Read [Google access](google-slides.md) only for this route. Get a full native
snapshot of the authorized working copy. Its canvas must match the scene. New
slides may select a verified `layoutId`; existing slides enumerate `replace` and
`protect` top-level object IDs. Unlisted objects and slides remain untouched.

```sh
node scripts/harness-slides.mjs workspace init --project ./deck-work --file scene.json --template snapshot.json
node scripts/harness-slides.mjs workspace build --project ./deck-work
node scripts/harness-slides.mjs workspace apply --project ./deck-work --dry-run
```

Inspect the version's HTML, then apply within the user's authorized editing
scope. Google needs public HTTPS images or authorized native insertion. Editable
charts require an existing linked Sheets chart. Local images, arbitrary chart
data and scene notes require native tools on this route; the compiler stops
rather than dropping them. The final renderer is Google, not HTML.

## PowerPoint

The package needs its production dependencies for new PPTX authoring. Text,
shapes, lines, tables, images, notes and chart data compile to native objects.
Local image paths are resolved from the workspace; download authorized assets
first. Theme typography is supplied by the brand add-on or user choice.

```sh
node scripts/harness-slides.mjs workspace init --project ./deck-work --file scene.json --format pptx
node scripts/harness-slides.mjs workspace build --project ./deck-work
```

For templates, use native composition or guarded edits instead of rebuilding
an existing deck from scratch. [Editing](editing.md) explains this boundary.
