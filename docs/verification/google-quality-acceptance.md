# Native Google quality acceptance

This benchmark checks actual native behavior using synthetic content, separately
from mocked API/unit tests. It requires an already-authorized Google transport;
it never creates a paid project, asks for another login or starts a service.

## Repeatable procedure

1. Run `node scripts/acceptance/google-quality.mjs prepare NEW_DIR`. This writes a
   local editable PPTX cover with notes, a three-row signed-data CSV, a synthetic
   image and a brief. Import the PPTX as native Slides and CSV as native Sheets
   into the user's authorized location. Keep the baseline; copy it once for work.
2. Read the complete working-copy native inventory into a private file and parse
   its design system. The synthetic baseline has one cover and no rich exemplars
   suitable for the table/chart/diagram/image roles. Keep the cover and its notes;
   add content-specific compositions using the compiler. Do not use a real
   customer deck or credentials as fixture content.
3. Add a native column chart to the imported Sheet using A1:B4 (one header row,
   categories Negative/Zero/Positive and values -8/0/24). Confirm Sheet/chart IDs.
   Use Arial, a signed axis including zero and a brand-consistent source color.
4. Run `node scripts/acceptance/google-quality.mjs scene DIR SHEET_ID CHART_ID`.
   The scene has comparison, unequal-column table, chart, editable diagram and
   local-image slides, each with notes and synthetic-source labels.
5. Use `google compile` against the fresh working-copy snapshot with
   `--local-images`. Send its exact structured requests and revision through the
   authorized connector, supplying the local image path as an image sidecar.
   Read the native output, then compile/send the notes phase with that revision.
6. Read back and run `google verify --source before.json`. Confirm text,
   typography, centered image/chart fit, table widths/row overflow, notes,
   description and exact chart backing IDs. Confirm untouched source metadata,
   shapes, notes and cover content/styles.
7. Change the Sheet's positive value from 24 to 32 and read its bounded A1:B4.
   `benchmarkEdits(scene,snapshot)` returns a revision-bound edit plan: title and
   caveat, table cell, diagram label, coordinated node/line geometry, chart
   refresh. Send that plan once, read back and verify the edited scene. These
   diagram lines do not promise automatic attachment after arbitrary node moves.
8. Run the Google Slides skill's local issue checker, export one final native
   PDF and render every page with its export/render helper. If reference-backed
   export cannot materialize locally, use the helper's inline export path rather
   than claiming a render succeeded. Verify page count/order against native IDs.
   View every slide at readable size, gather defects, repair within scope and
   inspect the resulting exact revision.
9. Generate font screening and a structured critique bound to the final native
   snapshot/PDF hashes. Cite actual fixture evidence for title support; address
   relationship, reading order and technical fit individually. Keep raw private
   inventories, source values, PDF/PNGs and receipts with the workspace. Do not
   commit expiring media URLs or authentication state.

## Live run: 2026-10-08

Executed with the authorized Google Drive connector on native Slides and Sheets,
using the local baseline/import/copy and compiler/native-batch workflow above.
The final deck contains six slides: the preserved cover plus five new roles.

| Check | Observed result |
| --- | --- |
| Text/table editability | Changed native title and table cell; retained text/font styles, 210/450 pt column allocation and readable long labels. |
| Diagram editability | Relabeled draft and arrow label; moved target node and extended the line without recreating slides or flattening objects. |
| Linked chart | Source changed -8/0/24 → -8/0/32; refresh succeeded; native PDF visibly shows negative bar, zero category and positive bar at 32. Backing Sheet/chart IDs verified. |
| Local image | Authenticated sidecar insertion; intrinsic aspect ratio contained, descriptive alt title/description retained. |
| Notes | Explicit synthetic notes on all five new slides; protected cover and original notes unchanged. |
| Preservation | Full source cover element/style, page metadata and notes comparison passed. |
| Native review | All six 120 dpi pages viewed; zero local issue-checker findings. No clipping, collision or hidden content found. |
| Font/critique | 27 exact Arial regular/bold measurements; all five content slides received individual current, source/object-specific judgments. Five small-footer warnings reviewed as intentional labels. |

Live testing found and fixed two cases that mocked success could miss:
newly empty notes reject `deleteText` over ALL (insert without deleting); native
linked charts preserve intrinsic aspect ratio within a requested bounding box
(verify centered containment, not stretching to every edge).

Final native revision: `h2ap-HGPwGTaeQ`.
Final native PDF SHA-256:
`0557033a4b2171164d82f2b96c70325b4d61f4884947fa2a5e1cb6b1c21ff596`.
Full connector response SHA-256:
`50509d1d0fcb787f878d17b53017ceb29e948a16e4dfacbddd78b0fc00b14047`.
Private evidence retained under `/private/tmp/slides-quality-google-20261008` on
the execution host. Resource IDs and private inventories are not bundled here.

This proves the exercised native path and fixture, not every font, language,
chart type, organization policy or PowerPoint→Google conversion. Font screening
is an early repair aid; native pixels and source review remain authoritative.
