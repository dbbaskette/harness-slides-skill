# Shared brand handoff and content-led slide generation

Direction authorized by the user's “Both together” choice on October 7, 2026.
Implementation choices below follow that direction; no publication or live
Google writes are included.

## Outcome

A marketer supplies a brief and brand. The agent chooses each slide's takeaway,
relationship, evidence and visual treatment independently. Brand identity stays
coherent without forcing the same body layout. Existing canonical Brand data
feeds both slide and blog guidance, with language/author voice kept separate.

## Interfaces and ownership

- Tanzu Brand: `contract export --brand ... --medium slides|blog --output NEW_DIR`
  produces a hash-bound `brand-contract.json`, generated `DESIGN.md` and `VOICE.md`.
  Optional explicit `--voice-profile FILE` consumes an existing portable profile;
  it retains confirmation/provisional status. No company tone is inferred.
- Tanzu Brand owns selected identity, canonical tokens/profile, exact fonts,
  protected template artwork, asset authority, language rules and voice sources.
  Files remain in their existing locations. Generated views are task snapshots.
- Harness Slides accepts the neutral contract and a typed, AI-owned deck plan.
  `deck compile --file PLAN --brand CONTRACT --output NEW_DIR` writes a v2 scene,
  an intent/asset/readability report and exact input hashes. This is additive;
  existing scenes, native templates and guarded edits continue to work.
- Each slide records takeaway, relationship, rationale, evidence and a typed
  component. Initial components cover statement, comparison, categories,
  process, timeline, architecture, metric, table, chart, quote and image.
  Components enforce required content instead of inventing missing evidence.
- Geometry derives from the selected presentation profile and canvas. Typography,
  semantic colors, table treatments and chart styles follow resolved design.
  Explicit local treatments remain local; canonical brand files are unchanged.
- Content-heavy slides report fit warnings and remain drafts. No automatic
  shrinking, wording deletion or decorative asset insertion to meet a quota.
- Native Google table geometry/style and readback are strengthened alongside
  PPTX mapping. Diagrams retain editable nodes, lines and labels; this increment
  does not promise attached connector behavior for arbitrary native node moves.
- Generated imagery uses the existing optional helper. Approved native icons
  and native template artwork continue through their existing Brand tools;
  pending asset needs are explicit, never substituted with unapproved icons.

## Acceptance

A synthetic factual story produces a compact blog brand/voice handoff and a
mixed-content slide plan with distinct justified compositions. The compiled PPTX
retains text, tables, charts and diagram primitives. Selected brand roles resolve
consistently; content stays above reserved footer regions. Changing a canonical
source invalidates a contract check; changing a local copy preference does not
modify organizational policy. A selected voice retains its provenance/status.
Native renders are inspected and repaired. Fixtures verify Google requests and
readback; live target acceptance is reported separately. Context overhead is
measured by selected path, with catalogs and provider code kept on disk.

## Constraints and meaningful alternatives

Native output remains primary; HTML stays a preview. Arbitrary HTML conversion,
new voice training, official artwork reconstruction, global policy promotion,
new hosted services, live Google writes and publishing are outside this increment.
A prose-only improvement would not make content requirements/geometry executable.
Duplicating tokens in a new Brandkit package would create competing authorities.
Neither is the selected approach.
