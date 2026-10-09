# Build a long deck in parallel

Use this when a composed deck has more than about ten content slides, the
harness can run subagents, and the user has approved the direction and the
per-slide proposals. It finishes sooner and uses more tokens; tell the user
that in one line when you choose it. Otherwise build the deck yourself.

Once the direction and each slide's claim, relation and focal point are settled,
slides no longer depend on each other. What still does is how the deck reads as
a whole, and that stays with you.

A worker is a designer, not a typist. Hand over what each slide must make the
audience understand and everything it has to work with, and let the worker
decide how to draw it. A brief that dictates the structure gets that structure
back, at the quality of a one-line sketch.

## The lead

1. **Split the content slides into sections** of three or four neighbouring
   slides, one worker each, up to about eight workers; past that, make the
   sections larger. A designing worker spends several minutes on a slide, so a
   small section is what keeps the build short. Keep slides that are compared
   with each other, or that build on each other, in one section. Keep the
   cover, section breaks and closing slide yourself.
2. **Write the house style once**, in `presentation-brief.md`, and keep it to
   what has to match across sections: what each color stands for, the icon
   style and color, where a caveat such as "illustrative" goes, and how arrows
   are labelled. Do not say what a card looks like or cap what a slide may
   hold; that turns every section into the same boxes.
3. **Brief each worker** with everything below. A worker knows only its brief.
   `outline start` writes these briefs from an approved [draft](draft.md); add
   what it cannot know, the guidance entry and each worker's preview file.
4. **Write your own file** while they work: cover, section breaks, closing.
5. **Merge, then review as a deck.** List the files in deck order and join them:

   ```sh
   node scripts/harness-slides.mjs compose merge --file parts.json --output composition.json
   ```

   `parts.json` is `{"title":"…","direction":{…},"parts":["cover.json","section-1.json",…]}`.
   A part whose direction differs, or that reuses another part's IDs, is refused.
   Then compile, preview the whole deck and do the final review in
   [compositions](compositions.md). Rhythm, a layout echoed across a section
   boundary and one concept drawn two ways only show up here. Name the three
   weakest slides in the whole deck. Fix small things yourself; send a slide
   back to the worker that owns it when it needs redesigning.

Tell the user which preview files the build left in their Drive.

## The worker brief

- The deck's goal, audience and delivery, in two lines.
- Paths: this guidance entry, the runtime, the brand contract, the work
  directory, the name of the section file to write, and the source material,
  so it can draw on more than the brief repeats.
- The `direction`, to copy unchanged, and the house style.
- Its slides, in order. For each: the slide ID, the approved title, what the
  audience must understand, the relation, the focal point and the rhythm; then
  all of the content, with its numbers, names and examples. Describe a
  structure only where the user approved a specific one, and say that they did.
- What the slides either side of the section look like, so it does not echo
  them.
- An ID prefix for every node it creates, such as `s2_`.
- Preview: its own Drive preview file, reused with `--file-id`.
- Limits: titles, claims, the direction and the slide order are fixed. How each
  slide is drawn is the worker's to design.
- What to return: the section file, the final preview directory, the Drive
  file ID, what it changed after looking, and anything it could not do.

## If you are a worker

The claims are settled; the drawing is yours. Read [design](design.md) from
"Choose each slide from its content" and [compositions](compositions.md), and
run `compose contract --brand` for the sizes. Design each slide from what it
must make the audience understand, not from the nearest row of boxes. Keep the
brand's body size for this deck's delivery; a section that shrinks its text to
fit more in will not match the others. Write
only your section file, with the deck's `direction` copied unchanged and your ID
prefix on every node. Check with `compose compile` and no `--output` until it
fits, then preview each slide, and revise and look again where it needs it,
twice at most. Before returning, name your weakest slide, fix it and preview
once more. Report what still bothers you instead of polishing further: the
lead reviews the deck as a whole.
