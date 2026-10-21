# Gallery

One finished slide for each relation, as a composition you can read, compile
and preview. Open the one for the relation you are drawing; do not read them
all. They use the neutral brand, so the form carries over and the colors do not.

| Relation | File | What to take from it |
| --- | --- | --- |
| `order` | [order.json](gallery/order.json) | Numbered tint cards joined by arrows, with only the last step solid, because the last step is the point |
| `dependency` | [dependency.json](gallery/dependency.json) | Arrows run to the thing depended on, which is the one solid shape; the dependents are quiet tint cards |
| `hierarchy` | [hierarchy.json](gallery/hierarchy.json) | Levels drawn as boxes inside boxes, so inheritance is seen, not described |
| `membership` | [membership.json](gallery/membership.json) | One tinted region in the color that means the group, holding white member cards, with a source line beneath |
| `contrast` | [contrast.json](gallery/contrast.json) | Two cards, each tinted in the color that means its option, compared line for line, then the conclusion as the one large line |
| `parallel` | [parallel.json](gallery/parallel.json) | Peers as equal tint cards led by lettered badges, sized to their content, and a caveat that applies to all of them |
| `overlap` | [overlap.json](gallery/overlap.json) | Two outlined boundaries that really intersect, with the shared part named inside the intersection |
| `quantity` | [quantity.json](gallery/quantity.json) | One number in the metric size with its label, and what it is made of beside it |
| `none` | [none.json](gallery/none.json) | A single statement in the quote size on an otherwise empty slide |

Each one has a claim for a title, one thing to look at first, speaker notes,
and nothing drawn that the claim does not need. Copy the reasoning, not the
layout: a slide with five steps or two dependencies wants its own structure.

Cards are filled: `tint` or `bar`, in the color that means what the card stands
for. Outlines are kept for boundaries, such as the levels of a hierarchy and the
two regions of an overlap. The neutral brand has no icon library, so the examples
lead with badges; with a brand icon library, lead each card with its icon instead.

Rendered images of all nine are in the repository under `docs/gallery/`.
