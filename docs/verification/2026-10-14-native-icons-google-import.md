# Native icons and editable diagrams through Google import, 14 October 2026

**Status: not yet run.** This check needs a live Google account that can import
to Drive and read the Slides API. No result is recorded below. Until someone
runs it, the claim that icons and diagrams survive Google import rests only on
the hand probe in the [9 October trials](2026-10-09-look-and-vocabulary-trials.md),
which used a private brand.

## What is automated, and what this adds

`tests/native-icons.test.mjs` proves the PowerPoint side on every `npm test`.
It uses a synthetic brand with a native template and a vector icon library: three
SVG icons in `tests/fixtures/native-icons/`, indexed by the real indexer. A
two-slide composition is built through `compose compile` and `compose render`.
The test then reads the PPTX XML and checks three things:

- **Icons.** Each icon is one native group, with no picture and no media part. Its
  drawing's custom-geometry path matches the source SVG point for point. The
  group's child frame is the indexed bounds and its outer frame fills the
  compiled slot.
- **Identities.** Each group is named after its composition node, with the
  library label as alt text. The render report and `structure.json` tie each
  node to its library icon ID.
- **The diagram.** Cards are native groups of a shape and its text. Both arrows
  are connectors attached at both ends, one end on an icon's disc.

What no automated test can show is what Google Slides makes of that deck. This
procedure checks it by hand on the same deck.

## Before you start

- A Google account authorized for Drive import and Slides API reads, checked
  with `node scripts/harness-slides.mjs drive check`. Do not create a project
  or sign in again just for this check. If access is missing, record that and stop.
- Poppler (`pdfinfo`, `pdftoppm`) for the preview images.
- A disposable directory outside this repository, for example
  `/private/tmp/hs-icons-YYYYMMDD`. Keep the snapshot and images there, not in the repository.

## Procedure

1. Record the commit: `git rev-parse HEAD`.
2. Prepare the deck. This runs locally and writes the brand, library,
   composition, compiled folder, `deck.pptx` and `expected.json`:

   ```sh
   node scripts/acceptance/native-icons.mjs prepare DIR
   ```

   Record `deckSha256` from `DIR/expected.json`.
3. Import and render through Google. This uploads `DIR/compiled` as a new Slides
   file, exports its PDF, and writes one image per slide plus the screen findings:

   ```sh
   node scripts/harness-slides.mjs compose preview --file DIR/compiled --output DIR/preview
   ```

   Record `fileId` from `DIR/preview/preview.json`.
4. Read back the native structure:

   ```sh
   node scripts/harness-slides.mjs google snapshot --file-id FILE_ID --output DIR/snapshot.json
   ```

5. Check the snapshot against `expected.json`. Google assigns its own object
   IDs, so match objects by slide number, alt text and text.
   - **No pictures.** No page element on either slide has an `image`.
   - **Icons.** For each entry in `expected.icons`, find an `elementGroup` on
     its slide whose `description` is the entry's `label`. It holds `shapes`
     shapes and no image. Note which `shapeType` the drawing reports. Its size
     must be square, as the slot is.
   - **Connectors.** Slide 1 has two `line` elements, one with `lineCategory`
     `STRAIGHT` and one `BENT`. Each has a `startConnection` and an
     `endConnection`. The straight line runs from the rectangle behind "API gateway" to
     the ellipse in the Queue group. The bent line runs from that ellipse to the
     rectangle behind "Database".
   - **Cards.** "API gateway" and "Database" are editable shape text. Each
     sits in one group with its card rectangle and its icon.
   - **Notes.** Slide 1's speaker notes contain the `expected.notes` text.
6. Look at `DIR/preview/slide-01.png` and `slide-02.png` at full size. Each icon
   shows its drawing, not an empty disc. On slide 2 the solid icon is a light
   drawing on an aqua disc, the outline icon is a blue drawing in a blue ring,
   and the plain icon is a blue drawing with no disc. Nothing is clipped.
7. Open the file in Google Slides and edit it by hand:
   - drag the Queue icon and confirm both arrows follow it;
   - change "Database" to another word;
   - select one icon's drawing inside its group and confirm Slides treats it as
     a shape you can edit, not as a picture.

   Close the file without keeping the edits, or undo them.
8. Optional round trip:
   `node scripts/harness-slides.mjs drive export --file-id FILE_ID --output DIR/roundtrip.pptx`,
   then `node scripts/harness-slides.mjs pptx inspect --file DIR/roundtrip.pptx`.
   Record whether the group names, the alt text and the connector attachments
   survive the return to PowerPoint format.
9. Fill in the results table below, in a new dated file or under a new heading here. Leave
   out file IDs, URLs and private paths. Keep the evidence privately, and
   delete the Drive file if the user does not want it kept.

## Pass criteria

The check passes if every icon arrives as native, editable geometry with its
drawing, label and style intact, and both arrows stay attached. A loss that
comes from Google's importer, rather than from what the emitter writes, is
recorded as a known limitation, not hidden. One example is a group's alt text
being dropped. The emitter-side cause of any failure gets a fix and an automated
test, as `tests/native-icons.test.mjs` already does for the PowerPoint side.

## Results

| Check | Result |
| --- | --- |
| Commit and `deckSha256` | not run |
| No pictures after import | not run |
| Icon groups, labels and shape counts | not run |
| Drawing `shapeType` reported by Google | not run |
| Connectors attached at both ends | not run |
| Card text editable | not run |
| Speaker notes | not run |
| Rendered icons and styles | not run |
| Manual edits (move, retype, select drawing) | not run |
| Round trip to PPTX (optional) | not run |
