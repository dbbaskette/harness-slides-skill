# Compose slides

For new slides with a brand template or neutral defaults. You describe each slide's structure; the
compiler places it, fits the text and builds editable native objects. Get the
[draft](draft.md) approved first, or [the per-slide proposal](design-walkthrough.md)
where there is no draft, and decide what each slide must make the audience
understand before choosing its structure. The `direction`
and each slide's `brief` are the only record of those [design](design.md)
decisions that a composition needs.

Keep a `presentation-brief.md` beside the composition: the request, audience,
delivery, the direction, and the user's approval in their own words.

```sh
node scripts/harness-slides.mjs compose contract --brand brand-contract.json
```

With `--brand` it ends with that brand's sizes: the content area, how many
lines a title holds, gaps, padding and the height of a line in each text role.
Plan fit from those numbers before compiling.

## Decide the deck's direction once

Before the first slide, write a `direction` for the whole deck:

| Field | Decide |
| --- | --- |
| `focal` | The one color that means "look here" |
| `neutral` | The panel color everything else starts as |
| `meanings` | What each other color stands for, such as one product or one state |
| `motif` | One recurring device and the job it does, if the deck has one |

Every slide then follows it. Boxes start neutral, and fills come only from the
neutral, the meanings and the brand's canvas color. A color in `meanings` keeps
that meaning on every slide; never borrow it for decoration. Give a deck of more
than about ten slides two or three meanings, such as each product compared or
a state. Until it has them, `compile` lets cards take up to three supporting
colors from the brand, which `compose contract --brand` names, and `preview`
reports `no-meanings`. Nothing uses the
focal color except the one node a slide names as its point: not another box, not
text, not an arrow. Arrows are drawn in an ink color. There is no limit on how
many fill colors a slide uses; each one has to be in the direction, with a
meaning. Text and icons may use the brand's ink and on-color roles freely.

## Give every content slide a brief

```json
"brief": {"relation": "order", "focal": "step_three", "rhythm": "dense"}
```

1. **The title is the claim.** Write it as a sentence the slide then supports,
   short enough for the title lines the brand allows; most allow one.
2. **Count the real units.** How many things are on this slide? Take the number
   from the content, never from a layout.
3. **Name the relation between them.** It decides the form:

| Relation | The parts are | Draw it as |
| --- | --- | --- |
| `order` | steps in sequence | nodes joined by edges, chevrons, or steps stacked in a column |
| `dependency` | things that rely on or feed each other | nodes joined by edges, or labelled cards in reading order |
| `hierarchy` | levels, parents and children | edges, nested boxes or stacked layers |
| `membership` | a group and its members | a box holding two or more members |
| `contrast` | things compared | side by side |
| `parallel` | peers of equal standing | a grid, or a row or column of like nodes |
| `overlap` | things that share a part | intersecting shapes |
| `quantity` | a number that matters | the `metric` text role, with its context |
| `none` | words best read directly | text, a quote or an image |

4. **Name the focal node**, the box or text that carries the claim. The compiler
   colors it: a box gets the focal fill, a text gets the focal color. Leave its own
   fill and color unset. A slide that compares equals may have none. A focal node
   needs a direction.
5. **Tag the rhythm:** `anchor` for structure, `dense` for information, `breathing`
   for a pause. Content slides default to dense; cover, section and closing slides
   are anchors and take only `rhythm` in their brief. Four dense slides in a row is
   a finding.

`compile` refuses a relation that is not drawn, a second node in the focal color,
and a fill outside the direction. Choose `none` when
the words really are enough; do not draw a diagram to satisfy the rule.

## Design each slide from its content

There are no slide types to pick from. Build the structure the content needs
from four containers and a handful of leaves:

| Use | For |
| --- | --- |
| `stack` (row or column) | Things read in order, or side by side |
| `grid` | Peers of equal weight |
| `free` | A map, an overlap, anything placed by position (fractions of the area) |
| `ring` | Three to eight things around a circle, in order, with an optional `hub` at the center |
| `box` | A shape with text inside, or a card holding other nodes |
| `text`, `icon`, `image` | Words, an approved icon by ID, supplied or generated artwork |
| `metric` | The one number a slide is about, with its label beneath |
| `badge` | A small numbered or lettered disc, for steps and references |
| `rule` | A thin line between the parts of a column or a row |
| `table` | A native table in the brand's table style, for comparing values across rows |
| `chart` | A native bar, line or pie chart in the brand's chart colors, its data editable |
| `spacer` | Deliberate empty space, and room for an arrow label |

A box has four looks, set with `style`:

- `tint` is a light surface of its `fill`, or of the neutral when it sets none.
  It is the supporting card: filled, in the color of what it stands for.
- `bar` is a neutral card with a strip of its color down the left edge.
- `solid` fills it at full strength. Keep that for the point of the slide.
- `outline` draws only a line. Keep it for a boundary, such as a zone or a
  level, and for something empty or secondary.

The line or strip is the focal color on the slide's point, the box's `fill`
where it has one, and a quiet ink otherwise. Under a direction a `fill` is still
one of its meanings.

Supporting cards are `tint` or `bar`; let the one solid shape be the thing to
look at. A slide of thin outlined boxes reads as a wireframe, and a big outlined
box with two lines in it reads as empty. Lead a card with its icon, or a badge
where the brand has no icons, and let a row `align` its cards so they take the
height their content needs.

## Labels on nodes, sentences whole

A diagram node carries a short label: "Base backup", "Zone A", "Primary". An
approved point's sentence stays whole, in one text or card, or in the notes
beside the labelled diagram. Never spread one sentence across several nodes.
An outline point may list `parts`, short labels approved for separate nodes.
Without them, use labelled cards, which also draw a `dependency`.

When the build knows the outline, `compile` refuses a reading deck whose
point is split across nodes and a live deck's preview reports it: pass
`--outline outline.json`, or `--project ROOT` for a project made by `outline start`.

Show a state, not a drawing of one. `state` on a box or text is `muted`,
`struck` (its words struck through) or `failed` (a box, with a status-colored
dashed edge and an × badge); what a box holds is muted with it. An edge's
`style` is `dashed` or `dotted` for a weaker link, such as asynchronous
replication. Never type `- - >` or box-drawing characters, and never draw lines
across words to cross them out. `compile` refuses words drawn over other words.

A box that holds other nodes is a card. Its content starts at the top; set
`align` to `center` or `end` to place it lower. Centre only when every card in a
row holds the same amount of text, or their icons and headings stop lining up.
A card in a shape other than a rectangle holds much less: its content sits
inside the shape's text area, about half the width of a diamond.

In a row, every child fills the row's height. Set the row's `align` to `start`,
`center` or `end` and each child takes only the height its content needs.

`weight` shares space between siblings. A node never goes below the size its
content needs; when that overrides a weight you set, `compile` and `preview`
report `weight-overridden`. For bars drawn to scale use empty boxes, which have
no minimum, and put the labels beside them.

Give every content slide `notes`: what the presenter says, and the source
behind the claim. A deck presented live without them gets a `no-notes` finding.

## Slide furniture

Three things are set on the slide itself, not drawn in the canvas, so they sit
in the same place on every slide:

| Field | What it is |
| --- | --- |
| `subtitle` | One line under the title, in the template's own subtitle line: the section, or the question the slide answers |
| `caveat` | A ruled strip at the foot. Text, or `{"label":"Limit","text":"…"}` with a one-word label |
| `source` | A line under the caveat: a citation the audience can follow, such as "Tanzu for Postgres 4.5 documentation" |
| `provenance` | Never drawn. Finding, objective or research IDs behind the slide; it is added to the speaker notes |

Each takes its height from the canvas, so use the ones a slide needs. Decide
once which of them every slide in the deck carries, and keep to it.

## Use the type range

A slide set in one size has no first thing to look at. The brand's roles give a
range; use it:

- `metric` for the one number a slide is about, with its context beside it in
  the body size.
- `quote` for a statement that is the point of the slide.
- `label` for the heading of a card or a group, the body size for what is
  read, `caption` for a caveat or a source.

One large element and a few supporting ones reads better than six items of
equal weight. A role's own color gives way to plain ink when the deck's
direction has given that color a job, and takes the focal color when the node
is the slide's point.

`connect` joins two nodes with an arrow. It runs the way the layout does:
across between the parts of a row, down between the parts of a column. Between
nodes that are not level a straight arrow slants; set `route` to `elbow` for
right angles, which suits a fan-out or a tree, or to `curve`. Between two
children of a `ring` an elbow or a curve turns once around the outside, which
draws a cycle. A label on an arrow needs room: on a straight arrow it must fit
the gap between the two nodes, so leave a spacer; on a slanted arrow it is
placed beside the line, clear of every node.

Words may sit over an `image` only inside a filled box: put the image and
the box in a `free` container, the image first. `compile` refuses bare text
and outlined boxes over a picture, because no check can promise they stay
readable. There is no see-through scrim; a brand may forbid changing a color's
opacity.

Name a recorded image by its asset ID: `{type:image,id,asset:ID}` or
`picture:{asset:ID}`. Compile with `--asset-project DIR` when the assets are not
in the design project. `assets status` lists the IDs.

A `table` takes `rows`, the first being the header, and optional `widths` that
share the width between columns. Each row is as tall as its tallest cell. Keep
cells to a few words; a table compares values and is not a place for sentences.

A `chart` takes `kind` (`bar`, `line` or `pie`) and `data`: `categories`,
2 to 24 short labels, and `series`, each a `name` with one number per
category. A pie has one series and at most eight slices. Each series, or
each slice of a pie, takes the next brand chart color, and `compile`
refuses more than the brand has. `title` sits in the chart, `units` titles
the value axis and `source` is a caption under it. Use a chart when the
shape of the numbers is the point. For one number use a `metric`; for a few
exact values, a `table`.

Show a sequence, a dependency or a
hand-off with nodes and edges, not with a sentence that describes it. Show
ownership with regions. Use plain text when reading the wording is the point.

The [gallery](gallery.md) has one finished example for each relation. Let the
content choose the structure. Repeat a layout when two slides hold the
same kind of content or are meant to be compared, not because the last slide
used it.

## Cover, section and closing slides

A deck is more than content slides. Open with the template's cover, break long
decks into sections and close with its closing slide:

```sh
node scripts/harness-slides.mjs compose layouts --brand brand-contract.json
```

A slide that names a `layout` from that list fills the layout's own title and up
to its number of subtitle lines (`subtitle`, then `detail`) and has no canvas:
`{"id":"cover_slide","title":"…","layout":"Title 1 - dark","subtitle":"…","sources":[…]}`.
A layout listed with `pictures: 1` has a slot for a photo: add
`"picture":{"src":"assets/cover.png","alt":"…"}` and the image is cropped to
fill it. Left unfilled the slot renders as an empty panel, so without a
picture choose a layout with `pictures: 0`. Content slides stay on the default
layout.

## Brand roles, not values

Colours and type sizes are the brand contract's role names. The contract text
lists them; raw colours and font sizes are refused.

Text with no `textRole` takes the body size the brand sets for how this deck is
delivered: larger for a live talk, smaller for reading. Keep it. Do not step
down to a smaller role to make content fit; cut words, split the slide or
restructure. The smaller roles are for what they name: `caption` for a caveat
or a source, `label` for a heading. A live deck whose slides are set in the
reading size is a defect, and `preview` reports it. Search the brand's icon
library for icon IDs. An icon recorded in the asset manifest is placed by its
asset ID: `{type:icon,id,asset:ID}`, compiled with `--asset-project DIR` when
the assets are not in the design project. An icon keeps the library's colors unless you set its
`color` and `style`: `solid` is a light icon on a colored disc, `outline` a
colored icon in a ring, `plain` a colored icon with no container. On a filled
card use `plain` or `outline` in a color that reads on the fill. Follow the
brand's own icon rules where it has them. An icon needs its label beside it,
stands for one thing throughout the deck, and is not repeated across the cards
of one slide; `preview` reports each of these. Shapes: `rect`, `roundRect`,
`ellipse`, `diamond`, `hexagon`, `chevron`, `can`. An arrow stays attached to
any of them, to a text and to an icon with a disc or a ring, so it follows when
someone moves the node. A text an arrow points at is sized to its words, so the
arrow meets them.

## Build, look, fix

```sh
node scripts/harness-slides.mjs compose compile --file composition.json --brand brand-contract.json
node scripts/harness-slides.mjs compose compile --file composition.json --brand brand-contract.json --output NEW_DIR
node scripts/harness-slides.mjs compose preview --file NEW_DIR --output NEW_PREVIEW_DIR --slide SLIDE_ID
```

Without `--output`, `compile` only checks and writes nothing. One run lists every
problem it can find on every slide: broken rules, parts that do not fit, unknown
icons and layouts. A fit failure names the node and says how many lines the
text runs to and how many fit; for a column it lists what each part needs. Fix
each one by editing the node it names; do not rewrite the file. When it fits,
the result shows how much of each slide's height the content needs. Then add
`--output`. Shorten the wording, split the slide or restructure. Text is never
shrunk to fit.

`preview` returns native images with findings, and `repair` groups each slide's
warnings and errors, blocking slides first, for the next round of fixes. Verified bundles reuse the exact
editable PPTX and pixels when input dependencies are unchanged; no critique or
user approval is copied. A changed deck may still need full native PDF conversion,
but unaffected page images can be reused and thumbnails come from those images.
Google previews are named `Preview: …`. `--file-id` checks its saved ownership
and remote version, then creates a fresh preview while preserving the previous
file. Use the returned ID; a missing receipt or remote edit requires omitting
`--file-id`. A cached local render does not verify a live deck's current state.
Use `--renderer local` when
LibreOffice is installed and Google is unavailable.

Record the user's actual approval of the per-slide design in
`presentation-brief.md`, in their words. A composition without `intent` blocks needs no separate
proposal file. Add `--design-project CONTENT` to `compile` and `preview` when
slides carry `intent` blocks approved through `design propose`. `compile` then
checks the design even without `--output`. A file that holds only some of the
approved slides, neighbours in approved order, adds `--section`. The whole deck
never takes `--section`: it lists every approved slide.

A deck of more than about ten content slides can be
[built in parallel](parallel-build.md) where the harness runs subagents.

Work three slides at a time: write three, check them with one `compile`,
render them with one `preview`, open the three images, revise, and move on.
A batch costs one round trip where three single slides cost three, and the
whole build renders in a few seconds either way. Look at each slide; if it
needs revising, revise it and look at the revision before the next batch. Two revisions is the limit for a slide:
after that, write down what still bothers you and move on. The final review
picks up the worst of them. Findings point at things to look at: an approved sentence split across nodes
(`split-point`, blocking in a reading deck), a source line that reads as
internal provenance, characters standing in for a drawing (`ascii-art`),
wording that describes a relationship
with nothing drawn, a layout repeated from the previous slide, an arrow that
could not be attached, an icon that blends into the card behind it, a weight
the content overrode, a deck with
no direction, a slide with no brief, a title that reads as a label. They are not approval, and no finding does not mean the
slide is good. A card that is mostly empty, a diagram crowded into a corner or
an arrow crossing a label are yours to see.

## Deliver

```sh
node scripts/harness-slides.mjs compose render --file NEW_DIR --output deck.pptx
node scripts/harness-slides.mjs drive import --file deck.pptx --name TITLE
```

Before delivering, run `compose preview` on the finished build without
`--slide`. Beside the slide images it writes `contact-sheet.png`, every slide
numbered on one sheet, and `critic.json`, eight yes-or-no questions to answer
for each slide.

**Have it reviewed by someone who did not draw it.** Where the harness runs
subagents, hand one the preview directory and nothing else. It reads
`critic.json`, looks at the contact sheet and then each image, and answers the
questions; it sees what is on the slide, not what was meant. Where there is no
subagent, answer them yourself and record the reviewer as `author`.

```sh
node scripts/harness-slides.mjs compose critique --file PREVIEW_DIR --assessment critique.json
```

Fill the `answer` template from `critic.json`: `slides` must list every slide
once with eight boolean `answers` and a slide-specific inspection `note`. Every
false answer needs a matching finding; true answers have none. An all-pass review
still answers every question. The command verifies the actual deck and image
hashes. Legacy packets need a new preview; missing/changed artifacts cannot be
certified by an empty findings list.

Each no is a finding: `critical` when the slide misleads or its point cannot be
found, `major` when it is clearly weaker than it should be, `minor` otherwise.
The critique also names the three weakest slides. A critical finding blocks
delivery. Fix the critical and major findings in one pass, preview again and
have the new render critiqued; undo a fix that causes a new finding. A reviewer
does not change brand colors or what a slide says.

When the deck is bound to an approved design, review the build against it
as well: `review --compiled NEW_DIR --output REVIEW --design-project CONTENT`.
It renders `REVIEW/deck.pptx` and asks, for each slide, whether the visual
teaches what the design approved. `review --output REVIEW --packets`
returns every slide's picture and criteria in one call. Inspect each image
and mark it, answer every criterion with `review --assessment`, then
`design present` the review. Without LibreOffice, add `--renderer google`
to `review --compiled`: it renders through Google Drive, and the reviewed
deck is still `REVIEW/deck.pptx`. Deliver `REVIEW/deck.pptx`. The
independent `compose critique` still applies.

That is the final review for a composed deck. Note what was found and fixed in
`presentation-brief.md`, with the deck hash the preview returns. Then show the
user the contact sheet and the images and wait, as
[the walkthrough](design-walkthrough.md#show-rendered-output-and-pause-again)
describes. The preview file and the delivered file are imports of the same
build.

With a native brand template, titles use layout placeholders. Neutral decks use
editable titles and neutral layouts. Both use the same writer for native groups,
attached/routed arrows, tables and charts. Google import preservation still needs
live acceptance for the actual deck; fixture/package checks do not establish it. Read
[review](review.md) for a design-bound review, a requested PDF export or an
editability check.

Hyperlinks are not available in compositions yet. A chart is written as a
native chart with its own workbook, so its data can be edited in PowerPoint.
What Google Slides makes of it on import has not been checked; for a deck
going to Google Slides, look at each chart in the Google preview.
