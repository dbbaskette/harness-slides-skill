# Draft the deck before building it

For a new deck or a full rework. Settle what the deck says on a draft the user
can see, then build it. A round of changes to a draft takes about a minute; a
round of changes to built slides takes minutes a slide.

```sh
node scripts/harness-slides.mjs outline contract --brand brand-contract.json
```

With `--brand` the contract ends with what this brand allows: how long a title
may be and how many words a slide carries.

## Write the outline

An outline holds words and decisions and no layout. How a slide is drawn, and
what assets it uses, are decided in the build; a draft needs only what each
slide says. Size the deck to the time first: a live talk moves at about two
minutes a content slide. Then for each content slide:

- **`title`:** the claim, short enough for the brand's title lines.
- **`understand`:** one sentence: what the audience must leave the slide knowing.
- **`relation`** between its parts, and **`focal`**: the point of the slide, in
  words. Give the label of one of the points, or a short statement of its own.
- **`points`:** the real units, counted from the content, each a label, a line
  of text or both. The title, the points, a focal statement of its own and the
  caveat are all the wording the slide will show; the build draws them and
  adds no claims.
- **`caveat`** and **`source`**, if the claim needs them: one line each, shown
  at the foot of the built slide.
- **`notes`**: what the presenter says, and the source behind the claim. They
  go into the built slide's notes.
- **`sources`:** what the slide rests on, as IDs: a section of the source
  material, or `request` when it comes from the brief.

A cover or section slide takes a title and a subtitle; a cover may add a
`detail` line such as the audience or date. A closing slide is a title.

## Check it and show it

```sh
node scripts/harness-slides.mjs outline check --file outline.json --brand brand-contract.json
node scripts/harness-slides.mjs outline draft --file outline.json --brand brand-contract.json --output draft.html
```

`check` lists every structure problem in one run, then findings about the
words: a title too long for the brand, a slide over the word budget for its
delivery, four dense slides in a row, a repeated title, a slide with no point
named.

`draft` writes one self-contained page with every slide as a grey wireframe,
laid out by a plain rule for its relation. It runs locally in under a second.
Send or open that file for the user and say what it is: wording and structure
only, not a design. Every slide is redrawn in the build. The page is reviewed
as a whole, not one slide at a time.

## Change it until the story is right

Ask what to change: claims, wording, order, emphasis. Edit the outline and run
`draft` again to the same file. The [walkthrough](design-walkthrough.md) rules
on asking and waiting apply: a draft shown is not a draft approved. When they
approve, add what they said to the outline's `approval`, in their words.

## Choose the look from real slides

The draft settled the words. Settle the look the same way, by seeing it, before
the deck is built in a look the user did not choose. Approving the draft
approves what the deck says; it does not choose a look.

1. Pick one content slide that will show the look well: one with a relation to
   draw and a point to mark.
2. Build that slide two or three ways, each as its own one-slide
   [composition](compositions.md) with its own `direction`: one safe, one
   bolder, one unexpected. Keep the title, points and caveat as approved and
   vary the look: the focal color and the neutral, solid, outline or bar
   cards, the icon style, how much the one large element dominates, and
   whether a slide carries its section as a subtitle. Where the harness runs
   subagents, give each look to a worker.
3. Preview each, then put the renders on one sheet and show it with a line on
   what differs. Ask which they want, and wait.
4. Their pick becomes the outline's `direction` and `house` style. Add what
   they said to the outline's `approval`.

```sh
node scripts/harness-slides.mjs compose sheet --image A/slide-01.png --image B/slide-01.png --image C/slide-01.png --output looks.png
```

Previews that share one Drive file run one after another; the file then holds
the last look, which does not matter.

Showing looks is not choosing one. Choose for the user only when they asked
you to work on your own, and then say which you chose and why. Skip this step
when the look is already fixed: a house style was supplied, or the deck is
being rebuilt in a look the user has approved before.

## Start the build

Before starting, add what the build needs to the outline: the `direction` and
`house` style the user picked, the template `layouts` for cover, section and
closing slides (run `compose layouts`), and the source `material`. Run `draft`
once more so the page shows the direction.

```sh
node scripts/harness-slides.mjs outline start --file outline.json --brand brand-contract.json --output NEW_DIR
```

`start` writes the build's starting files: the cover, section and closing
slides, `parts.json`, one brief per section of three or four content slides,
and `presentation-brief.md`, which carries the outline's `approval`.

Then build each section from its brief, following
[compositions](compositions.md): hand the briefs to workers for a
[parallel build](parallel-build.md), or take the sections yourself in order.
Join them with `compose merge`, then compile, preview and review the deck.

Titles, claims, wording and order are now fixed; how each slide is drawn is
the builder's. A change to the words after this point goes back through the
outline, so the approved record and the deck stay the same.
