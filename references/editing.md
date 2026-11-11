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

## Polish: settle the near-misses, then say what changed

A polish pass is not finished at the title block. On every content slide look for
peers that are almost aligned, almost the same size or unevenly spaced: cards in a
row with different tops or heights, text in peer cards anchored differently, a
content block that stops short of the margin its title uses. Where the runtime has
it (`harness-slides.mjs --help` lists `pptx align`), run the audit first:

```sh
node scripts/harness-slides.mjs pptx align --file original.pptx
node scripts/harness-slides.mjs pptx align --file original.pptx --output settled.pptx
```

Without `--output` it only reports. With it, rows share a top edge, columns a left
edge, same-size panels one size and near-equal gaps become equal; a shape that
moves carries the shapes drawn inside it, and only offset and size tags are
rewritten. Icon parts, different artwork and centred or bottom-anchored loose text
are left alone. `review` entries are what geometry cannot decide (mixed text
anchors, unequal card widths, a block short of the margin): judge and fix those by
hand. The audit is a floor, not the review: render and look at every changed slide.

Every edit to an existing deck ends with a slide-by-slide summary the person can
check against the deck, shown in the reply and saved beside the work:

```sh
node scripts/harness-slides.mjs pptx changes --file original.pptx --after revised.pptx --output changes.md
```

Add what you saw and left alone, and why (a text edit, a colour decision, the same
in the source). On older runtimes write the same summary by hand.

A Google deck reached only through Drive can still be edited in place: export,
edit, then replace the file's content with a Drive upload update to the same file
ID, which keeps its link and its revision history. Do that only for a file the
person named or one this task created; otherwise import a new copy.

For template inspection or composition, load [template reuse](templates.md).
For Google-only edits, use [Google operations](google-slides.md), scoped native
objects and revision controls; the PPTX patch schema above is not needed.
