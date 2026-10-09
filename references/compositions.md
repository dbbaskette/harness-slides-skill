# Compose slides

For new slides in a brand template. You describe each slide's structure; the
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
that meaning on every slide; never borrow it for decoration. Nothing uses the
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
| `dependency` | things that rely on or feed each other | nodes joined by edges |
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
from three containers and five leaves:

| Use | For |
| --- | --- |
| `stack` (row or column) | Things read in order, or side by side |
| `grid` | Peers of equal weight |
| `free` | A hub, a map, anything placed by position (fractions of the area) |
| `box` | A shape with text inside, or a card holding other nodes |
| `text`, `icon`, `image` | Words, an approved icon by ID, supplied or generated artwork |
| `spacer` | Deliberate empty space, and room for an arrow label |

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
| `source` | A line under the caveat naming where the claim comes from |

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

`connect` joins two nodes with an arrow. A label on an arrow needs room: on a
straight arrow it must fit the gap between the two nodes, so leave a spacer; on a
slanted arrow it is placed beside the line, clear of every node.

Show a sequence, a dependency or a
hand-off with nodes and edges, not with a sentence that describes it. Show
ownership with regions. Use plain text when reading the wording is the point.

Let the content choose the structure. Repeat a layout when two slides hold the
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
Prefer layouts listed with `pictures: 0`; a picture slot cannot be filled yet and
renders as an empty panel. Content slides stay on the default layout.

## Brand roles, not values

Colours and type sizes are the brand contract's role names. The contract text
lists them; raw colours and font sizes are refused.

Text with no `textRole` takes the body size the brand sets for how this deck is
delivered: larger for a live talk, smaller for reading. Keep it. Do not step
down to a smaller role to make content fit; cut words, split the slide or
restructure. The smaller roles are for what they name: `caption` for a caveat
or a source, `label` for a heading. A live deck whose slides are set in the
reading size is a defect, and `preview` reports it. Search the brand's icon
library for icon IDs. An icon keeps the library's colors unless you set its
`color` and `style`: `solid` is a light icon on a colored disc, `outline` a
colored icon in a ring, `plain` a colored icon with no container. On a filled
card use `plain` or `outline` in a color that reads on the fill. Follow the
brand's own icon rules where it has them. Shapes: `rect`, `roundRect`, `ellipse`, `diamond`,
`hexagon`, `chevron`, `can`. Arrows attach to the first four.

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

`preview` builds the deck, renders it and returns the slide image with findings.
The first preview creates one Drive file named `Preview: …`; pass its ID as
`--file-id` afterwards so the same file is reused. Use `--renderer local` when
LibreOffice is installed and Google is unavailable.

Record the user's actual approval of the per-slide design in
`presentation-brief.md`, in their words. A composition without `intent` blocks needs no separate
proposal file. Add `--design-project CONTENT` to `compile` only when slides carry
`intent` blocks approved through `design propose`.

A deck of more than about ten content slides can be
[built in parallel](parallel-build.md) where the harness runs subagents.

Work three slides at a time: write three, check them with one `compile`,
render them with one `preview`, open the three images, revise, and move on.
A batch costs one round trip where three single slides cost three, and the
whole build renders in a few seconds either way. Look at each slide; if it
needs revising, revise it and look at the revision before the next batch. Two revisions is the limit for a slide:
after that, write down what still bothers you and move on. The final review
picks up the worst of them. Findings point at things to look at: wording that describes a relationship
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

Before delivering, run `compose preview` on the finished build without `--slide`
and open every image, in order: each slide, then the run of slides as a deck.
Name the three weakest slides and what is wrong with each, fix them, and
preview again. That is the final review for a composed deck. Note what you
found and fixed in `presentation-brief.md`, with the deck hash the preview
returns. Show the user those images and
wait, as [the walkthrough](design-walkthrough.md#show-rendered-output-and-pause-again)
describes. The preview file and the delivered file are imports of the same
build.

The deck is built inside the brand template: the title is the layout's
placeholder, labels sit inside their shapes, arrows are attached, and each card
is one group. All of that survives the import into Google Slides. Read
[review](review.md) only for a requested PDF export or an editability check.

Native tables, charts and hyperlinks are not available in compositions yet. A
small comparison table can be built as a grid of boxes and text. A deck that
needs a real table or chart is built with [another method](authoring.md); the
methods cannot yet be mixed in one build.
