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
a slide. Words drawn over other words, and a word wider than its line, are
refused when the brand font measured them; with an estimated measurement they
are `unverified-fit` warnings. `preview` refuses nothing new but reports an
outline changed since the build (`outline-changed`). `preview.json` adds `repair`,
the warnings and errors grouped per slide, blocking slides first. A failed box's
badge is sized to hold its ×, and a solid icon's glyph is no longer judged
against the card behind it.

A muted or struck card is the neutral panel in secondary ink, never a bare
outline box, and on a neutral surface it takes the canvas color. A struck card
keeps its words readable, without a line through them, and carries a quiet ×
badge in secondary ink beside them (`<id>_state`, grouped with the card); a
struck text is still struck through. A struck or failed box is a rectangle or
rounded rectangle, so its badge sits inside it. What a box holds is muted, whatever its
state. Guidance says when to mute, strike or leave a thing out. The live Google
check had shown a struck card on a brand without tints as an empty white
outline with its word crossed out, which read as a wireframe typo.

Slide text takes code spans: configuration fields, commands, API and file names
in backticks, such as `` `highAvailability` ``, are set in the brand's code
type (`design.slides.typography.code.fontFamily`) or in Courier New, as runs in
the same text box in every writer, and are measured in that font; a fonts
record may name its files as `code` and `codeBold`. `` \` `` is a literal
backtick. Titles, edge labels, badges, tables and charts refuse code spans, as
does a studio edit of a title, and the studio leaves words it was not asked to
change as they were. Guidance asks for a plain-English
lead the first time ("High availability (`highAvailability`) is empty or
omitted"); `outline check` reports `unmarked-code` for camelCase and snake_case
names, paths and configuration file names left unmarked, and the draft page
shows code spans in a monospace face. Runtimes report `compose-code-spans`.

The brand drives the look and Harness Slides drives iteration. When a brand
add-on supplies directions, such as Tanzu Brand's `look samples` and `look
choose`, the look comes from that choice step; without one, the optional
comparison of content samples remains. A studio runner hosts the draft
approval, look choice and final acceptance checkpoints in its own interface and
never skips one by hosting it.

Google previews stop filling Drive with files. `compose preview` and `review
--renderer google` reuse a pool of Google Slides files, `Harness Slides preview
1` to `4` in a `Harness Slides previews` folder made on first use for the
signed-in gcloud account. Each preview replaces the least recently used file
with one Drive media upload that converts the deck in place, keeping the file's
ID and link; if Drive refuses, a new file takes the slot and the old one goes to
the Drive trash, never deleted. Leases in the machine-local pool state keep two
previews off the same file. Results carry `pool`, with a `FILE_ID:GENERATION`
receipt; `--file-id` with a receipt whose file now shows a newer preview is
refused as `preview-replaced`, and a bare ID still works. `--pool-size N` (or
`HARNESS_PREVIEW_POOL_SIZE`) sets the size, `--new-preview-file` keeps the
earlier file-per-preview route, `drive pool` lists the pool, and a renamed pool
file is left alone. Leases are per computer; a render whose pool file was written
by anyone else before it was read back (its `modifiedTime` moved) is refused, the
generation is kept in Drive and rises before Drive is touched, one sign-in token
serves a whole preview, and `compose preview --refresh` redraws a cached build
for a new Drive link. The capability is `google-preview-pool`.

Guidance for 0.16.0 requires runtime 0.16.0; 0.15.x retains guidance at
`5ba00545e36a26b3f6011b65c9923e1f4efe145c`. A composition that uses none of
the new vocabulary compiles to the same scene as before, unless it draws words
over words or has a word wider than its line, both now refused. An arrow to a
text is now attached, and the text is sized to its words, so a rebuilt slide
with such an arrow can change geometry. Google Slides import of dashed and
dotted lines, strikethrough, the failed badge and connectors attached to text
boxes has not been checked live. Nor has Google Slides import of code runs or
of the struck badge.

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
