# Compose slides

For new slides in a brand template. You describe each slide's structure; the
compiler places it, fits the text and builds editable native objects. Approve
[the per-slide proposal](design-walkthrough.md) first, and decide what each slide
must make the audience understand before choosing its structure.

```sh
node scripts/harness-slides.mjs compose contract
```

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

Vary structure with the content. Repeat a layout only when two slides are meant
to be compared.

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
node scripts/harness-slides.mjs compose compile --file composition.json --brand brand-contract.json --design-project CONTENT --output NEW_DIR
node scripts/harness-slides.mjs compose preview --file NEW_DIR --output NEW_PREVIEW_DIR --slide SLIDE_ID
```

`compile` fails when content cannot fit at the brand's size, naming the node and
the shortfall for every slide that needs a change, in one pass. Shorten the wording, split the slide or restructure. Text is
never shrunk to fit.

`preview` builds the deck, renders it and returns the slide image with findings.
The first preview creates one Drive file named `Preview: …`; pass its ID as
`--file-id` afterwards so the same file is reused. Use `--renderer local` when
LibreOffice is installed and Google is unavailable.

Record the user's actual approval of the per-slide design in the presentation
brief, in their words. A composition without `intent` blocks needs no separate
proposal file.

Open every image. After each new slide, look at it and revise once before moving
on. Findings point at things to look at: wording that describes a relationship
with nothing drawn, a layout repeated from the previous slide, an arrow that
could not be attached, an icon that blends into the card behind it. They are not approval, and no finding does not mean the
slide is good. A card that is mostly empty, a diagram crowded into a corner or
an arrow crossing a label are yours to see.

## Deliver

```sh
node scripts/harness-slides.mjs compose render --file NEW_DIR --output deck.pptx
node scripts/harness-slides.mjs drive import --file deck.pptx --name TITLE
```

The deck is built inside the brand template: the title is the layout's
placeholder, labels sit inside their shapes, arrows are attached, and each card
is one group. All of that survives the import into Google Slides. Then follow
[review](review.md) on the delivered deck.

Tables, charts and hyperlinks are not available in compositions yet. Use
[typed components](content-components.md) or a native template slide for those.
