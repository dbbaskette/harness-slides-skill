# PowerPoint scene authoring


The package needs its production dependencies for new PPTX authoring. Text,
shapes, lines, tables, images, notes and chart data compile to native objects.
Local image paths are resolved from the workspace; download authorized assets
first. Theme typography is supplied by the brand add-on or user choice.

```sh
node scripts/harness-slides.mjs workspace init --project ./deck-work --file scene.json --format pptx
node scripts/harness-slides.mjs workspace build --project ./deck-work
```

For templates, use native composition or guarded edits instead of rebuilding
an existing deck from scratch. [Template reuse](templates.md) explains this boundary.
