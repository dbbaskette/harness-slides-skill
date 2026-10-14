# Native charts through Google import, 14 October 2026

**Status: not yet run.** This check needs a live Google account that can import
to Drive and read the Slides API. No result is recorded below. Until someone
runs it, nothing is known about what Google Slides makes of a composition
chart. The guidance lines that describe the chart node wait for it (see the
[integration contract](../specs/2026-10-14-design-integration-contract.md#guidance-for-the-release-native-charts)).

## What is automated, and what this adds

`tests/native-charts.test.mjs` proves the PowerPoint side on every `npm test`.
It uses a synthetic brand with a native template and three chart colors. A
three-slide composition, one bar, one line and one pie chart, is compiled and
emitted. The test then reads the PPTX and checks:

- **The package.** It passes the package audit: every part parses, no override
  lacks its part, no relationship dangles. Each chart has its chart part, the
  part's relationship and an embedded workbook, and the content types declare
  the chart and the `xlsx` extension. A template's own sample chart is dropped
  and does not collide with the new ones.
- **The frame.** Each slide holds one graphic frame named after the chart node,
  with alt text, whose relationship points at its chart part.
- **The data.** Each series' name, categories and values are cached in the chart
  as given. The cells its formulas name in the embedded workbook hold the same
  values.
- **The look.** Bar and line series, and pie slices, take the brand's chart
  colors in order. Title, axis and label text use the brand font at the brand's
  chart label size. The units are the value axis title.

What no automated test can show is what Google Slides does with a chart on
import. It may keep it as a chart, link it to a new spreadsheet, or turn it
into a picture. This procedure finds out by hand on the same deck.

## Before you start

- A Google account authorized for Drive import and Slides API reads, checked
  with `node scripts/harness-slides.mjs drive check`. Do not create a project
  or sign in again just for this check. If access is missing, record that and stop.
- Poppler (`pdfinfo`, `pdftoppm`) for the preview images.
- A disposable directory outside this repository, for example
  `/private/tmp/hs-charts-YYYYMMDD`. Keep the snapshot and images there, not in the repository.

## Procedure

1. Record the commit: `git rev-parse HEAD`.
2. Prepare the deck. This runs locally and writes the brand, composition,
   compiled folder, `deck.pptx` and `expected.json`:

   ```sh
   node scripts/acceptance/native-charts.mjs prepare DIR
   ```

   Record `deckSha256` from `DIR/expected.json`.
3. Optionally, open `DIR/deck.pptx` in PowerPoint first. On each chart choose
   **Edit Data**, confirm the workbook opens with the values in
   `expected.charts`, change one value and see the chart follow. Close without
   saving. This confirms the PowerPoint side by hand before Google is involved.
4. Import and render through Google. This uploads `DIR/compiled` as a new Slides
   file, exports its PDF, and writes one image per slide plus the screen findings:

   ```sh
   node scripts/harness-slides.mjs compose preview --file DIR/compiled --output DIR/preview
   ```

   Record `fileId` from `DIR/preview/preview.json`.
5. Read back the native structure:

   ```sh
   node scripts/harness-slides.mjs google snapshot --file-id FILE_ID --output DIR/snapshot.json
   ```

6. Check the snapshot against `expected.json`. Google assigns its own object
   IDs, so match objects by slide number.
   - **What each chart became.** On each slide in `expected.charts`, record the
     page element that holds the chart: a `sheetsChart` (with or without a
     `spreadsheetId`), an `image`, or nothing.
   - **Title and caption.** Slide 1's "Finance close, Q3 2026" caption is
     editable shape text.
   - **Notes.** Slide 1's speaker notes contain the `expected.notes` text.
7. Look at `DIR/preview/slide-01.png` to `slide-03.png` at full size. For each
   chart, compare against `expected.charts`:
   - the bars, line points and slices are in proportion to the values, and the
     data labels show them;
   - the colors are `colors`, in order: two blues for the bars, one blue line,
     and blue, aqua and grey slices;
   - the title and the value axis title read as given;
   - nothing is clipped or overlaps the caption.
8. Open the file in Google Slides. Select each chart and record what Slides
   offers: editing its data, opening a linked sheet, or only moving and
   resizing a picture. Undo any change.
9. Optional round trip:
   `node scripts/harness-slides.mjs drive export --file-id FILE_ID --output DIR/roundtrip.pptx`,
   then `unzip -l DIR/roundtrip.pptx | grep -E 'charts|embeddings'`.
   Record whether the charts come back as chart parts with workbooks.
10. Fill in the results table below, in a new dated file or under a new heading here. Leave
    out file IDs, URLs and private paths. Keep the evidence privately, and
    delete the Drive file if the user does not want it kept.

## Pass criteria

The check passes if each chart arrives with its values, colors, title and units
intact and readable. Whether its data stays editable in Google Slides is
recorded, not required: if the importer turns a chart into a picture or an
unlinked chart, that is a known limitation of Google's importer. It goes into
the guidance lines before they are applied, so users know a chart they must edit
in Slides is better made there. A loss that comes from what the emitter writes
gets a fix and an automated test in `tests/native-charts.test.mjs`.

## Results

| Check | Result |
| --- | --- |
| Commit and `deckSha256` | not run |
| PowerPoint Edit Data opens the workbook (optional) | not run |
| What each chart became after import | not run |
| Values and data labels as given | not run |
| Brand colors, in order | not run |
| Title and units | not run |
| Caption text editable | not run |
| Speaker notes | not run |
| Data editable in Google Slides | not run |
| Round trip to PPTX (optional) | not run |
