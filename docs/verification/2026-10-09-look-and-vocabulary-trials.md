# Look trial and vocabulary probes, 9 October 2026

## Look trial

Question: given an approved draft and the guidance alone, does an agent stop to
let the user choose a look, and can it show the looks usefully?

A fresh agent was given a 25-slide approved outline, the reply "The story is
right. Carry on.", and the guidance. It ran no deck build.

What it did: read the draft page, took the reply as approval of the words
only, built one contrast slide three ways (safe, bolder, unexpected), previewed
each through Google Slides, and stopped to ask which the user wanted. Nine
compiles and six previews, none failed.

What it tripped on, and what changed:

| Finding | Change |
| --- | --- |
| The routing table skipped the look step | The route for a new deck now names it |
| "Carry on" could be read as waiving the choice | The page says approving the draft does not choose a look |
| No helper to show renders side by side | `compose sheet` |
| No file to record approval in before `outline start` | The outline's `approval`, copied into the build's brief |
| "Vary the furniture" clashed with "keep the words identical" | The page lists what may vary |
| What colors an outline or a bar was unstated | Stated in the contract and the page |
| One library icon rendered as an empty disc, with no finding | An index entry with one shape is refused at compile |

Not changed: the brand's own icon color rules are narrower than the
composition contract's. The page already says to follow the brand's.

## Edges, rings and tables

A seven-slide probe on a private brand template, rendered through Google
Slides and exported back to PowerPoint format:

- Elbow and curved edges render as bent and curved connectors, including those
  that lead off downward, which are written rotated a quarter turn.
- All 28 connectors kept both attachments after the round trip, on rectangles,
  rounded rectangles, hexagons, chevrons, cans, ellipses and icon discs.
- Rings of three, four, five and six place their nodes evenly; edges between
  neighbours turn once around the outside where there is room for a corner and
  run straight where the nodes are level.
- A four-column table arrives as a native table with its header fill and row
  lines.

The first render showed three defects, each fixed and rendered again: a tree's
edges left the parent's side instead of its foot, row lines appeared only under
the last row, and the fit screen judged cells against an even row height.

## Pictures

- A section layout's picture slot takes an image, cropped to the slot.
- A filled panel of words over a full-width image renders as placed.
- On the template used, one dark section layout loses its dark panel in
  Google's import whether or not it has a picture, leaving light text on
  white. The template's light variant is unaffected. This is in the template
  or the importer, not in what the engine writes; the layout part is
  byte-identical to the template's.

## Not tested

- Any live image generation.
- Whether one reviewer is enough or two find more.
- PowerPoint itself.
