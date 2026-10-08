# Render, inspect, repair

Inspect each built/changed slide while its design context is fresh. A reviewer
must actually view the rendered pixels; rendering alone is not an inspection.
Fix clipping, overlaps, wrapping, awkward spacing, contrast and missing artwork.
Check content, notes, links, diagram relationships and editability separately.

For new decks, redesigns and full reworks, check each slide's composition against
its own takeaway, relationships and evidence. Reconsider inherited lists or
grids when a diagram, image, meaningful icon, color grouping, chart or plain text
would communicate that slide better. Numbers must convey useful order or
reference. Assets should explain the content, and grouping should clarify real
relationships. Repair within the agreed editing scope.

For PPTX, rendering needs LibreOffice (`soffice`) and Poppler (`pdftoppm`,
`pdfinfo`). Font availability and LibreOffice differences can affect fidelity;
verify in the intended editor. The helper renders a PDF once and rasterizes
changed slides. Fingerprints include related masters/assets; cached renders are
reused only with matching renderer/font signatures and verified image hashes.

```sh
node scripts/harness-slides.mjs review --file deck-work/versions/v000001/build/deck.pptx --output deck-work/versions/v000001/build/review
```

For Google, prepare actual native previews or use a connector's full native
preview manifest. Do not substitute scene HTML. A manifest needs presentationId,
revision, renderer, expectedSlideCount and all slides `{id,title,hidden,image}`.
The thumbnail command covers every API-visible slide; verify skipped/hidden
status in the editor when relevant.

```sh
node scripts/harness-slides.mjs google previews --file-id ID --output ./native-previews
node scripts/harness-slides.mjs review --previews ./native-previews/native-previews.json --output ./review
```

Keep text selectable, diagrams as editable shapes/connectors/labels, and tables
as native cells. Embed PowerPoint chart data; retain required formulas/links.
Google charts need accessible backing Sheets. In a disposable copy, change a
title, move/relabel a diagram node, edit a table cell and change a chart value
for the object types present. If verification is only structural or objects stay
flattened, disclose the limitation; do not claim full editability.

Compare delivered count/order, content, relationships, notes, links and hidden
status with the source within the agreed scope. Review requested exports too.
Master/theme/font changes require rechecking every affected slide. Reuse unchanged
iteration evidence, then complete final coverage on the delivered revision.
Open every final image at readable size. Then review deck consistency and rhythm:
keep theme and narrative coherent while checking that repeated formats are
justified by similar content, rather than copied from the first slide. Do not
change a suitable composition merely to manufacture variety.
After viewing, record real findings with the returned revision hash:

```sh
node scripts/harness-slides.mjs review --output ./review --mark 1,2 --revision HASH --note "Inspected at delivery size; findings and fixes..."
```

Use `--status unresolved` for remaining defects. Any deck/revision change clears
final coverage. Do not mark unseen slides as reviewed. Workspace status stays a
draft until its current artifact is reviewed; Google delivery also requires a
fresh native revision check. HTML previews and structural PASS are not visual QA.

Use `workspace repair --project DIR --slide ID` for a compact repair packet,
including only the selected slide, findings and expected scene digest. After a
repair, build/render affected slides and complete final coverage of the deck.

Compiled decks also require [font screening and structured critique](quality.md).
Use technical findings to target repairs, then judge the title against actual
evidence and the composition against the slide’s intended relationship.

## Export completeness

Run `delivery inspect --file scene.json --format pdf [--companion PATH ...]` for
requested PDF delivery. The report records scene/order, companion hashes, visible
URLs and notes/reference concerns; it is screening, not factual or access approval.
Judge whether essential explanation, reasoning and claim-changing caveats are
actually available in each delivered format. A PDF does not expose slide notes.
Keep important qualifications visible, or deliver the explicitly referenced
authorized companion and verify its contents and reader access. Missing material
keeps delivery unresolved. Preserve scoped wording/count/order; adding notes or
restructuring requires the existing scope.

Verify real hyperlink destinations and appendix coverage, exported count/order
and every final page's pixels. Native editability remains a separate check. A
dense legitimate reference appendix and a text-focused slide are valid; neither
needs artwork for approval. Save the completeness judgment with delivered hashes
and target revision. Changed scenes, companions, assets or exports need fresh
review of affected evidence.
