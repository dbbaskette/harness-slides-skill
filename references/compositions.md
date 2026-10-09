# Compose slides

For new slides in a brand template. You describe each slide's structure; the
compiler places it, fits the text and builds editable native objects. Approve
[the per-slide proposal](design-walkthrough.md) first, and decide what each slide
must make the audience understand before choosing its structure. The `direction`
and each slide's `brief` are the only record of those [design](design.md)
decisions that a composition needs.

Keep a `presentation-brief.md` beside the composition: the request, audience,
delivery, the direction, and the user's approval in their own words.

```sh
node scripts/harness-slides.mjs compose contract
```

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
many colors a slide uses; each one has to be in the direction, with a meaning.

## Give every content slide a brief

```json
"brief": {"relation": "order", "focal": "step_three", "rhythm": "dense"}
```

1. **The title is the claim.** Write it as a sentence the slide then supports.
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
lists them; raw colours and font sizes are refused. Search the brand's icon
library for icon IDs. Shapes: `rect`, `roundRect`, `ellipse`, `diamond`,
`hexagon`, `chevron`, `can`. Arrows attach to the first four.

## Build, look, fix

```sh
node scripts/harness-slides.mjs compose compile --file composition.json --brand brand-contract.json --output NEW_DIR
node scripts/harness-slides.mjs compose preview --file NEW_DIR --output NEW_PREVIEW_DIR --slide SLIDE_ID
```

`compile` checks the whole file: structure first, then fit. At each stage it
reports every slide's problems together. A fit failure names the node and the
shortfall. Shorten the wording, split the slide or restructure. Text is never
shrunk to fit.

`preview` builds the deck, renders it and returns the slide image with findings.
The first preview creates one Drive file named `Preview: …`; pass its ID as
`--file-id` afterwards so the same file is reused. Use `--renderer local` when
LibreOffice is installed and Google is unavailable.

Record the user's actual approval of the per-slide design in
`presentation-brief.md`, in their words. A composition without `intent` blocks needs no separate
proposal file. Add `--design-project CONTENT` to `compile` only when slides carry
`intent` blocks approved through `design propose`.

Open every image. Because `compile` checks every slide in the file, either add
slides one at a time or draft them all and then take them in turn with
`--slide`. Either way, look at each slide and revise it once before the next. Findings point at things to look at: wording that describes a relationship
with nothing drawn, a layout repeated from the previous slide, an arrow that
could not be attached, an icon that blends into the card behind it, a deck with
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
That is the final review for a composed deck. Show the user those images and
wait, as [the walkthrough](design-walkthrough.md#show-rendered-output-and-pause-again)
describes. The preview file and the delivered file are imports of the same
build.

The deck is built inside the brand template: the title is the layout's
placeholder, labels sit inside their shapes, arrows are attached, and each card
is one group. All of that survives the import into Google Slides. Read
[review](review.md) only for a requested PDF export or an editability check.

Tables, charts and hyperlinks are not available in compositions yet. Use
[typed components](content-components.md) or a native template slide for those.
