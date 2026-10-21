# 0.16.0 — unreleased

Compositions get a fuller visual vocabulary. A `tint` card is a light surface of
the color it stands for, and guidance makes `tint` or `bar` the supporting card,
keeping `outline` for boundaries. A brand contract with `fills: {tints: false}`
never has a color lightened: its tint cards compile as neutral bar cards with a
strip of the meaning color. A direction without meanings may fill with up
to three supporting brand colors; a deck of more than ten content slides without
meanings gets a `no-meanings` warning. Nodes take `state: muted|struck|failed`
and edges `style: dashed|dotted`, so nothing is crossed out with lines or typed
as `- - >`. Arrows to texts attach at the edge of the words. Labelled cards draw a
dependency without edges. The gallery examples are filled and badge-led, and the
neutral palette adds two accents.

Approved sentences stay whole. Outline points may list `parts`, short labels
for diagram nodes. With `--outline` or an outline `--project`, `compose compile`
refuses a reading deck whose point is split across nodes, and `preview` reports
`split-point`. `source` is a learner-facing citation; `provenance` is never
drawn and goes into the notes, and `internal-source` warns about finding IDs on
a slide. Words drawn over other words are refused. `preview.json` adds `repair`,
the warnings and errors grouped per slide, blocking slides first.

The brand drives the look and Harness Slides drives iteration. When a brand
add-on supplies directions, such as Tanzu Brand's `look samples` and `look
choose`, the look comes from that choice step; without one, the optional
comparison of content samples remains. A studio runner hosts the draft
approval, look choice and final acceptance checkpoints in its own interface and
never skips one by hosting it.

Guidance for 0.16.0 requires runtime 0.16.0; 0.15.x retains guidance at
`5ba00545e36a26b3f6011b65c9923e1f4efe145c`. Existing compositions compile
unchanged unless they draw words over words; an arrow to a text is now attached.

## Earlier development: 0.15.0


Composition output preserves editable groups, routed/attached connectors, native
tables and chart data through the same writer with or without a brand template.
All local image sources are copied and hash-checked in the compiled artifact.

New composition projects keep the editable source, outline/build versions,
previews, review locations and remote preview IDs. Open the compiled folder in
the studio, or register builds in an outline project with `compose compile
--project ROOT`. Studio text changes reflow the source, and restore creates a
new version with fresh review requirements. Neutral live/reading profiles include
cover, section and closing layouts.

Verified native render bundles are shared by preview, design-bound review and
delivery. Unchanged native bytes and pixels are reused across output locations;
equivalent pages can reuse pixels after a revision. Thumbnails use existing
images. Critique and user acceptance are separate and never cached as approval.

Critic packet schema 2 requires every slide's eight answers, an inspection note
and findings for failed answers. Deck and image hashes are checked before the
receipt is recorded. Older packets need a new preview. Older compiled folders
need recompilation to use composition projects/studio.

Google previews store private ownership/version receipts. An unrelated name,
missing receipt or remote edit cannot authorize replacement. An unchanged owned
preview is preserved while a fresh preview is created; use the newly returned
ID. Live provider behavior remains unverified by this implementation's fixtures.

Portable test setup pins Pillow in a private virtual environment. Core and native
GitHub Actions jobs report coverage separately, `doctor` honors configured
renderer paths and reports route prerequisites, and local Markdown links are
checked. See [current verification](../verification.md) for reproducible commands
and limits. Version/capability reporting and guidance compatibility require 0.15.0
for these workflows; 0.14.1 retains guidance at `833832f549f84c3ed689faa4eae93bfc1fd29677`.

This is development work for issues #72 and #71, not a published release.
