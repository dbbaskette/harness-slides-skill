# Structured native-slide critique

Use for new decks/redesigns built directly with native template tools. Compiler
workspaces use [quality](quality.md) for font screening, then the same rendered
review checkpoint. Technical PASS, a bulk inspection note and native text presence
cannot establish explanatory quality or complete visible glyphs.

Save the full native working-copy snapshot and actual Google-rendered preview
manifest against the same presentation ID/revision. Map every delivered native
slide ID once to its approved proposal slide ID, in order:

```json
{"schema":1,"planRevision":"APPROVED_REVISION","slides":[
  {"id":"native_slide_id","planId":"proposal_slide_id","assets":[
    {"object":"native_icon_object","family":"icon","provenance":"approved catalog source/stable ID and retained copy record"}
  ]}
]}
```

Asset records use actual object IDs and retained provenance. Generated/sourced
images must identify native image objects; icons can be native shapes/groups.
Do not label inherited identity artwork as explanatory imagery. A selected asset
missing from the actual deck remains unresolved; revise the proposal or insert it.

```sh
node scripts/harness-slides.mjs review --previews native-previews.json --output REVIEW \
  --design-project CONTENT --native-snapshot snapshot.json --decisions mapping.json
```

The result supplies an assessment binding and saved report. Inspect one slide with
`review --output REVIEW --slide NATIVE_ID` for per-slide questions with actual
object/source IDs, approved copy/composition, expected native text, asset decisions
and deck-wide repeated-geometry groups. Retain these private artifacts. The report
is screening and review context, not an automatic judgment of the pixels.

View every image at readable size. Compare complete titles and heading prefixes,
body labels and caveats with `expectedText`; a string retained in Google does not
prove that it appears in the export. Investigate native/export renderer differences
when text disappears; never mark a defective export clear because the editor's
snapshot still contains the words. Keep any uncertainty explicit.

Assessment: `{schema:1,sceneDigest,qualityRevision,artifactDigest,slides:[{id,checks}]}`.
Use every returned criterion once, with `{criterion,status:"pass"|"issue"|"uncertain",
reason,objects:[actual IDs],sources:[retained IDs]}`. Read cited evidence and judge
content-specific explanatory value, relationships, strongest feasible alternative,
focal hierarchy, asset purpose, delivery density and agreement with the approved
design. Equivalent geometry may be justified for genuinely comparable content.
Creative pass reasons must be specific to each slide, not duplicated bulk approvals.
This targets boilerplate, not a claim that string validation proves comprehension.

```sh
node scripts/harness-slides.mjs review --output REVIEW --assessment critique.json --revision REVIEW_HASH
node scripts/harness-slides.mjs review --output REVIEW --mark 1,2 --revision REVIEW_HASH --note 'Actual pixel findings and repairs'
```

Pixel notes and structured critique are separate. Both must be current before
`design present` opens the final user-review checkpoint. Preparation with changed
native revision, snapshots, design decisions or image bytes invalidates affected
review/acceptance; creative review cannot be downgraded by omitting its inputs.

For a compiled PPTX, bind native pixels to its built quality report and proposal:

```sh
node scripts/harness-slides.mjs review --file WORKSPACE/versions/v000001/build/deck.pptx \
  --output REVIEW --design-project CONTENT \
  --quality-report WORKSPACE/versions/v000001/build/quality-report.json
```

The same assessment command adds approved-design and rendered-text checks to the
compiler's criteria. Requested exports need their own completeness judgment.
Offline receipts never establish that a live Google revision is still unchanged;
read that revision before delivery. Do not publish private snapshots or review text.
