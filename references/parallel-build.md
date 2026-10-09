# Build a long deck in parallel

Use this when a composed deck has more than about ten content slides, the
harness can run subagents, and the user has approved the direction and the
per-slide proposals. It finishes sooner and uses more tokens; tell the user
that in one line when you choose it. Otherwise build the deck yourself.

Once the direction and each slide's claim, relation and focal node are settled,
slides no longer depend on each other. What still does is how the deck reads as
a whole, and that stays with you.

## The lead

1. **Split the content slides into sections** of four to seven neighbouring
   slides, four sections at most. Keep slides that are compared with each other,
   or that build on each other, in one section. Keep the cover, section breaks
   and closing slide yourself.
2. **Write the house style once**, in `presentation-brief.md`: what a card looks
   like (fill, heading role, body role), the icon style and color, how a caveat
   such as "illustrative" is marked, how arrows are labelled, and how much text
   a dense slide carries. Six lines is enough. It is what keeps four authors
   looking like one.
3. **Brief each worker** with everything below. A worker knows only its brief.
4. **Write your own file** while they work: cover, section breaks, closing.
5. **Merge, then review as a deck.** List the files in deck order and join them:

   ```sh
   node scripts/harness-slides.mjs compose merge --file parts.json --output composition.json
   ```

   `parts.json` is `{"title":"…","direction":{…},"parts":["cover.json","section-1.json",…]}`.
   A part whose direction differs, or that reuses another part's IDs, is refused.
   Then compile, preview the whole deck and do the final review in
   [compositions](compositions.md). Rhythm, a layout echoed across a section
   boundary and one concept drawn two ways only show up here. Fix small things
   yourself; send a slide back to the worker that owns it when it needs
   redesigning.

Tell the user which preview files the build left in their Drive.

## The worker brief

- The deck's goal, audience and delivery, in two lines.
- Paths: this guidance entry, the runtime, the brand contract, the work
  directory and the name of the section file to write.
- The `direction`, to copy unchanged, and the house style.
- Its slides, in order. For each: the slide ID, the approved title, the
  relation, the focal node, the rhythm, the content with its real units, icon
  IDs or concepts, the approved structure in a sentence, and what the slides
  either side of the section look like, so it does not echo them.
- An ID prefix for every node it creates, such as `s2_`.
- Preview: its own Drive preview file, reused with `--file-id`.
- Limits: titles, claims, the direction and the slide order are fixed. A slide
  that cannot be built as approved is reported, not redesigned.
- What to return: the section file, the final preview directory, the Drive
  file ID, its weakest slide and why, and anything not built as approved.

## If you are a worker

The design is approved, so read only [compositions](compositions.md) and run
`compose contract --brand` for the sizes. Write only your section file, with
the deck's `direction` copied unchanged and your ID prefix on every node. Check
with `compose compile` and no `--output` until it fits, then preview each slide,
revise it once and look again. Return what the brief asks for.
