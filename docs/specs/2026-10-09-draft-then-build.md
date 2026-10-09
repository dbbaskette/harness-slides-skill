# Draft, then build

Status: proposed, not built. Written 2026-10-09 after the 0.11.0 trials.

## Why

Drawing a slide well costs about seven minutes of model time. Today that cost is
paid before the user has seen anything but a text description, so every change
to a claim, the wording or the slide order throws some of it away.

The 0.11.0 trials showed both halves of this:

- A build where the lead dictated plain structures produced 17 slides in 13
  minutes. As a finished deck it was flat. As something to argue the story
  over, it cost the right amount.
- A build where workers designed each slide produced a good 18-slide deck in 25
  minutes and about a million tokens.

So the work splits into two stages with different jobs. The first settles what
the deck says. The second draws it.

## The two stages

| | Draft | Build |
| --- | --- | --- |
| Settles | Story, order, each slide's claim and wording | How each slide is drawn |
| The agent writes | Words only | Compositions |
| Rendered by | A local wireframe page, in under a second | The brand template, through Google |
| A round of changes costs | About a minute | Minutes per slide |
| The user approves | "This is what the deck says" | "This is how it looks" |

Both are stages of this one skill. They share the brand contract, and the
build takes the approved draft as its input with nothing retyped.

## The outline

The draft stage produces one file, `outline.json`. It holds words and decisions,
and no layout:

```json
{
  "version": 1,
  "title": "Valkey vs Redis: what to say, check and prove",
  "audience": "Solutions architects",
  "delivery": "live",
  "direction": {"focal": "accentPurple", "neutral": "canvasSecondary",
                "meanings": {"accentAzure": "Valkey", "identityAccent": "Redis"}},
  "slides": [
    {"id": "cover_slide", "kind": "cover", "title": "Valkey vs Redis",
     "subtitle": "What to say, check and prove"},
    {"id": "migrate_slide", "kind": "content",
     "title": "The source version picks the migration route",
     "understand": "There are two routes, and the customer's current Redis version decides which.",
     "relation": "order", "focal": "The question that decides the route",
     "rhythm": "dense",
     "points": [
       {"label": "Redis 7.2 or earlier", "text": "Snapshot or replication path, for supported source versions"},
       {"label": "Redis 7.4 or later", "text": "Data files are not compatible; qualify a separate conversion route"}
     ],
     "caveat": "No unconditional drop-in or zero-downtime claim.",
     "sources": ["research_report"]}
  ]
}
```

`kind` is `cover`, `section`, `content` or `closing`. `relation`, `rhythm` and
`direction` mean what they mean in a composition. `understand` is one sentence:
what the audience must leave the slide knowing. `focal` names the point of the
slide in words; there are no node IDs yet.

## Commands

```sh
node scripts/harness-slides.mjs outline check --file outline.json --brand brand-contract.json
node scripts/harness-slides.mjs outline draft --file outline.json --brand brand-contract.json --output draft.html
node scripts/harness-slides.mjs outline start --file outline.json --brand brand-contract.json --output NEW_DIR
```

- **`check`** reports, in one run: titles that do not fit the brand's title
  lines, slides over the word budget for the delivery, a content slide with no
  `understand` or no relation, four dense slides in a row, and repeated titles.
  It measures with the brand font, as `compile` does.
- **`draft`** writes one self-contained HTML page with every slide as a
  wireframe, in deck order. It runs locally and needs no Google access.
- **`start`** turns an approved outline into the build's starting files: the
  lead's cover, section and closing slides, `parts.json`, a
  `presentation-brief.md`, and one brief per section of three or four content
  slides, ready to hand to a worker. A serial build reads the same briefs.

## What a wireframe looks like

A draft must not be mistaken for a finished slide, or the user will judge its
looks.

- Grey outlines on white, in the brand font at the delivery's real sizes. No
  brand color, no template artwork, no icons.
- The title where the title goes; the points arranged by a fixed, deliberately
  plain rule for the relation: left to right with arrows for `order`, side by
  side for `contrast`, a grid for `parallel`, a box holding its members for
  `membership`, stacked layers for `hierarchy`, a hub and spokes for
  `dependency`, a large figure for `quantity`, a text block for `none`.
- The focal point has a heavy outline. The caveat sits at the bottom.
- Each slide carries its number, its relation and its word count, and a footer
  reading "Draft: wording and structure only".
- Text that is too long is shrunk to fit and the slide is flagged as over
  budget. A draft never fails to render because of length; length is a
  finding about the words.

The fixed arrangements are the kind of layout library that was removed from the
build in 0.10. They belong here because a draft is meant to be generic: its job
is to carry the words, and the build stage redraws every slide.

## How it is built

- The outline is turned into a plain composition by one rule per relation, then
  laid out by the existing compiler in a draft mode that shrinks text instead
  of failing.
- The page is rendered by the existing `renderSceneHtml`, with a wireframe
  theme and the slides tiled as a contact sheet.
- Nothing in the build path changes. `outline start` writes ordinary files that
  `compose` and the parallel build already understand.

## Approval

1. The agent writes the outline from the brief and sources, runs `check`, and
   shows the draft page.
2. The user changes claims, wording, order and emphasis until the story is
   right. Each round is an edit to the outline and a re-render.
3. The user's approval is recorded in `presentation-brief.md`, in their words,
   with the outline's hash. This replaces the text-only walkthrough for a new
   deck.
4. The build runs. Titles, claims, wording and order are fixed; drawing is the
   builder's. The rendered deck is shown for approval as it is today.

A change to wording after the build starts goes back through the outline, so
the approved record and the deck cannot drift apart.

## Targets

- A 20-slide outline written in one pass of about five minutes.
- `draft` and `check` in under a second each.
- A round of user changes in about a minute.
- No change to build time; fewer slides rebuilt because the words moved.

These are estimates until measured the way the 0.11.0 trials were.

## Out of scope

- Drawing quality. Flat rectangles, missing photography and the small type
  range are build-stage problems, tracked in issues 24, 26 and 29.
- Tables and charts.
- Existing decks. A redesign that keeps the content could start from an outline
  extracted from the deck, but that is a later step.

## Decisions for the user

1. **Wireframes laid out automatically from the outline** (recommended), or
   plain compositions written by the agent for each slide. The automatic route
   is what makes a draft take minutes; the other keeps one format but brings
   the fit loop into the draft.
2. **One HTML page as the draft** (recommended). It works in every harness and
   offline. The alternative is images, which need a browser to produce.
3. **One skill with two stages** (recommended), or two skills. Two skills means
   two sets of guidance and two releases to keep in step.
4. **Shrink long text in a draft and flag it** (recommended), or refuse to
   render until it fits.

## Build order

1. The outline format, `outline check`, and tests.
2. The relation rules, draft mode in the compiler, the wireframe theme and
   `outline draft`.
3. `outline start`, generating the files the parallel build already uses.
4. Guidance: a draft page, and the walkthrough pointing to it for new decks.
5. A trial: draft the Valkey deck with a fresh agent, time each round of
   changes, then build from the approved outline and compare with the 0.11.0
   parallel build.
