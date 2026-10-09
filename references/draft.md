# Draft the deck before building it

For a new deck or a full rework. Settle what the deck says on a draft the user
can see, then build it. A round of changes to a draft takes about a minute; a
round of changes to built slides takes minutes a slide.

```sh
node scripts/harness-slides.mjs outline contract
```

## Write the outline

An outline holds words and decisions and no layout. For each content slide:

- **`title`:** the claim, short enough for the brand's title lines.
- **`understand`:** one sentence: what the audience must leave the slide knowing.
- **`relation`** between its parts, and **`focal`**: the point of the slide, in
  words. Give the label of one of the points, or a short statement of its own.
- **`points`:** the real units, counted from the content, each a label, a line
  of text or both. Put all the wording the slide will show here; the build
  draws it and adds no claims.
- **`caveat`**, if the claim needs one.

Cover, section and closing slides take a title and their subtitle lines. The
`direction`, `layouts`, `house` style and source `material` are for the build;
fill them in before it starts.

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
Show the user that page and say what it is: wording and structure only, not a
design. Every slide is redrawn in the build.

## Change it until the story is right

Ask what to change: claims, wording, order, emphasis. Edit the outline and run
`draft` again to the same file. The [walkthrough](design-walkthrough.md) rules
on asking and waiting apply: a draft shown is not a draft approved.

## Start the build

```sh
node scripts/harness-slides.mjs outline start --file outline.json --brand brand-contract.json --output NEW_DIR
```

`start` writes the build's starting files: the cover, section and closing
slides, `parts.json`, `presentation-brief.md`, and one brief per section of
three or four content slides. Record the user's approval in
`presentation-brief.md`, in their words.

Then build each section from its brief, following
[compositions](compositions.md): hand the briefs to workers for a
[parallel build](parallel-build.md), or take the sections yourself in order.
Join them with `compose merge`, then compile, preview and review the deck.

Titles, claims, wording and order are now fixed; how each slide is drawn is
the builder's. A change to the words after this point goes back through the
outline, so the approved record and the deck stay the same.
