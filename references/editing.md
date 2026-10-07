# Scoped editing and preservation

Inspect the source once, retain a working copy and record the selected scope.
Ask about editing freedom only if it is not already supplied. Never reconstruct
the whole deck for a small text/style change. Read [design](design.md) for redesign
work; a brand-only pass does not need a narrative redesign.

```sh
node scripts/harness-slides.mjs pptx inspect --file original.pptx --slide 3
```

Inspection reports stable slide IDs, object IDs, text, geometry and content
hashes. Request `--json` only for full inventories or automation. Build a patch
with `sourceSha256` and operations containing `slide`, `object`, `expectedHash`
and `text`, `runs:[{index,text}]`, `alt` or `title`. Whole-text replacement requires
one native text run; use explicit run edits for rich text so styles/links remain.

```sh
node scripts/harness-slides.mjs pptx patch --file original.pptx --plan patch.json --output revised.pptx
node scripts/harness-slides.mjs pptx compare --file original.pptx --after revised.pptx --allow changes.json
```

The patcher keeps unselected package parts byte-identical and checks slide/object
order, content, style/geometry and relationships before publishing output.
`changes.json` is an explicit list of `{slide,object,fields:[text|alt|title|structure]}`
for authorized differences. It does not excuse unrelated package changes. Failed
preservation prevents delivery. Render any successful patch to check wrapping.

Use the available native authoring tool for style/geometry changes beyond the
patcher's scope; retain an explicit change set and inspect before/after. Exact
part preservation is conservative and may flag harmless editor reserialization;
review that evidence rather than automatically expanding the allow-list.

## Reuse real templates

`template inspect` extracts measured layouts, objects, fonts and colors with a
source hash. These are observations; the brand package supplies actual policy.
`template choose` honors explicit identity, use-case matches and declared defaults;
ties produce candidates for a user decision. Image-heavy exemplars do not imply
their pixels are editable geometry; inspect native masters/layouts.

`pptx compose --plan composition.json --output new.pptx` uses pptx-automizer to
reuse actual slides and related chart parts. The plan contains `root`,
`sources:[{name,file}]` and `slides:[{source,number}]` (one-based numbers).
Animations, media relations and complex layouts need native inspection; this
library is not an in-place preservation guarantee. Inspect and render output.

For Google, use full snapshots, scoped operations and `requiredRevisionId`.
Read back native objects and verify unselected content after a write. Refresh on
conflicts. Do not automatically retry an uncertain write or create duplicates.
