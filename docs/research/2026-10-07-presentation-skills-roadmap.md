# Presentation skill research and proposed additions

Research date: October 7, 2026. This is a source review and a proposed backlog,
not an implementation or a new runtime benchmark. Recommendations compare
public skill instructions with this repository's current guidance and helpers,
including the local changes requiring a separate design decision for each slide.
Public branch links can change; historical sources below include their recorded
commits. Existing unrelated workspace changes are outside this research.

## Recommendation

Prioritize better composition decisions, usable visual building blocks, and
content-aware review. More themes alone will not fix repetitive numbered lists.
Keep theme, brand and narrative consistent while choosing the layout, assets and
reading path separately for each slide.

The first implementation slice should connect a per-slide design decision to
executable composition helpers and an explicit review finding when the chosen
structure does not communicate the content. Add asset selection and measured
text fitting alongside those helpers. A theme gallery is a later enhancement.

## Which skills were previously reviewed?

The clearest historical record is Tanzu Brand's
[October 6 research report](../../../tanzu-brand/docs/research/2026-10-06-presentation-integrations.md)
and its [pinned source list](../../../tanzu-brand/docs/research/presentation-integrations/sources.json).
These are local companion-project references; they will not resolve for someone
who has cloned only Harness Slides.

| Earlier reference | Recorded commit | What was relevant |
| --- | --- | --- |
| [CPO Labs Brandkit](https://github.com/cpo-labs/skills/tree/main/skills/brandkit) | `dd65f348394bf80a5d5cf031ba261ffa72699521` | Separate visual and language contracts, exact identity values, and recognizable brand treatment. |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), specifically its historical `brand` subskill | `477bcb28c9812b385cb51a4605ddf30d7b2266e2` | Compact brand summaries, conflicts between tokens, and asset hygiene. The current public brand-subskill URL was not retrievable during this review; the historical description comes from our saved report. |
| [agent-slides](https://github.com/mpuig/agent-slides) | `820782a5fb8cb8f251d7c0750e4299c321cd068c` | Template extraction, scoped operations and concise inspection output. |
| [presentation-skill](https://github.com/siril9/presentation-skill) | `2776d8a7d08e64924a69cbf5bdb1271c5bedf99b` | AI-owned planning, evidence records, semantic IDs and focused repair context. |
| [Frontend Slides](https://github.com/zarazhangrui/frontend-slides) | `9906a34d640d2111f724544cbc50f7f130569ae1` | Representative visual previews, browser editing and selective loading of design references. |
| [GX html2pptx](https://github.com/GX-Alex/html2pptx) | `1887e4b0997e9a2fc1f314336daa6172f46e4a37` | Browser geometry translated into editable PowerPoint objects. |
| [Hasasasa HTML to editable PPTX](https://github.com/Hasasasa/html-to-editable-pptx) | `17c1dbb76e958543dc2741a7d50ca374354f33b7` | Measured layout, preserved source and artifacts for comparing output. |
| [google-slides-generator](https://github.com/oimiragieo/google-slides-generator) | `e9afc00dcefaf073a501fea240ede4b88ce9b035` | One scene model for HTML previews and native Google objects, with readback. |

The brand references the user remembers were **Brandkit and UI UX Pro Max's
brand subskill**. Tanzu Brand itself supplies our approved identity, assets and
brand-specific adapters.

There are two different provenance records. The October 6 report explicitly
describes research recommendations and prototypes. Harness Slides'
[NOTICE](../../NOTICE.md) records direct extraction of generic tooling from
Tanzu Brand, and source-reviewed ideas from office-kit/pptx, presentation-skill,
agent-slides, Microsoft CAT, dom-to-pptx, mk-present and OpenAI Google Slides.
It says no third-party skill source was copied. Its runtime dependencies are
PptxGenJS and pptx-automizer. The old nexu-io/codex-slides image-generation fork
and Anthropic's PPTX skill are not incorporated.

The prior converter experiments matter: the saved report documents dropped
artwork, lost native table/chart semantics and typography/canvas differences.
Those historical results support retaining our shared-scene/native-output
approach; they do not establish the quality of current converter versions.

## What current skills suggest

- **Presentation Skill:** optional auditions using the same content, semantic
  planning records, reproducible figures and bounded repair packets. These are
  useful complements to our immutable scenes and visual-review receipts.
  [Source](https://github.com/siril9/presentation-skill/blob/main/SKILL.md).
- **agent-slides:** separates technical auditing from narrative critique. The
  latter asks whether a title is supported and whether the visual structure
  represents the relationship. We should adopt that distinction inside one
  user-facing workflow. [Critique](https://github.com/mpuig/agent-slides/blob/main/skills/slides-critique/SKILL.md),
  [audit](https://github.com/mpuig/agent-slides/blob/main/skills/slides-audit/SKILL.md).
- **Brandkit:** treats identity as explicit visual and language data, with
  provenance for values. Its logo-removal test is useful for judging whether a
  composition actually reflects a brand. Existing canonical tokens should
  remain authoritative. [Source](https://github.com/cpo-labs/skills/blob/main/skills/brandkit/SKILL.md).
- **Frontend Slides:** previews actual deck content in candidate treatments and
  distinguishes a live-talk deck from a reading deck. Optional previews should
  be feasible in the chosen native output.
  [Source](https://github.com/zarazhangrui/frontend-slides/blob/main/SKILL.md).
- **deck-builder:** explicitly maps content chunks to treatments and records
  why they belong in the narrative. Its image quotas and compulsory layout
  alternation should not become our rules.
  [Content analysis](https://github.com/lowrentkicker/deck-builder/blob/main/content_analysis.md).
- **PPTX Builder:** makes palette and shape treatment explicit and samples
  supplied templates instead of guessing. It also checks logos against their
  backgrounds. Those techniques fit a reusable brand adapter; its default-icon
  policy need not be adopted.
  [Source](https://github.com/Julien339/pptx-builder-skill/blob/master/SKILL.md).
- **Anthropic PPTX:** useful inspection patterns include placeholder checks,
  template-relative file validation and attention to font substitution during
  rendered review. It is a reviewed reference, not incorporated source.
  [Source](https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md).
- **office-kit/pptx:** describes read/edit/write preservation and checks against
  Open XML validators. That suggests a stronger compatibility gate, rather than
  assuming a successful LibreOffice render proves PowerPoint compatibility.
  [Source](https://github.com/office-kit/pptx).

These observations describe published instructions and project claims. No new
third-party installation, generated-deck comparison or live Google test was
performed for this report.

## Proposed feature and technique backlog

P0 = first implementation slice; P1 = next; P2 = later. Status distinguishes
instructions from executable support. Acceptance examples are proposed checks,
not evidence that these additions already work.

| Priority | Addition | Where we are now | What we should add or verify |
| --- | --- | --- | --- |
| P0 | **Persist a design decision per slide** | Fresh content-driven choices are now required by guidance; scenes contain geometry, not a rationale or semantic slide intent. | A compact plan linking takeaway, evidence, relationship, chosen treatment and needed assets. A process, a measured result and an architecture should receive independently justified compositions. |
| P0 | **Executable composition helpers** | `layouts.mjs` returns ten prose recipes. Agents still position primitive objects manually. | Native layout helpers for comparisons, timelines, flows, layers, annotated imagery and grouped categories. Inputs should be semantic content with adaptable spacing, rather than a fixed slide sequence. |
| P0 | **Asset planning and resolution** | We can insert images, copy native brand icons and preserve input hashes. | Search the selected approved icon library by concept; resolve supplied/sourced/generated imagery when useful. Record origin, usage rights, checksum, crop, alt text and generation metadata. Missing assets should be explicit. |
| P0 | **Measured text fitting and geometry checks** | Scenes check bounds, density, declared contrast and some font sizes; native wrapping, clipping and overlap remain primarily visual checks. | Measure text with actual fonts, reserve padding/footers, and detect overflow and unintended collisions. Account for intentional image overlays and text within shapes. Repair allocation or composition before shrinking essential content. |
| P0 | **Content-aware critique** | We require rendered inspection and now reconsider inherited formats. Review receipts hold findings in free text. | Structured findings for title/evidence mismatch, wrong visual relationship, unclear reading path and unsupported repetition, tied to slide/object IDs. Technical fit and persuasive clarity need separate judgments. |
| P1 | **Richer editable diagram primitives** | Generic scenes have rectangles, ellipses and straight lines. | Groups, attached connectors, bends, junctions, labels, swimlanes and semantic nodes. Moving a diagram node should retain its relationships, without rasterizing the diagram. |
| P1 | **A semantic type and color system** | The generic theme has one font, title/body sizes and a small palette. | Distinct heading/body/caption/metric/source roles, optional font pairing, spacing scales, semantic color roles and label styling. Existing brand contracts override neutral defaults. |
| P1 | **Representative-slide auditions** | Templates can be routed and inspected; we have a browser studio. | When the design direction is uncertain, render the same real evidence in a few viable treatments. Preview a content slide as well as the cover; preserve the user's established choice. |
| P1 | **Numeric and claim-level evidence checks** | Source-ID coverage detects omitted references. | Bind critical values, units, denominators and caveats to their source locations, and compare the final chart/table/text with that evidence. Presence of a source ID is not verification of a claim. |
| P1 | **Reproducible chart and table pipelines** | PowerPoint supports native bar/line/pie data; Google uses existing linked Sheets charts. | Source-bound transformations from CSV/XLSX, richer chart choices and chart-selection guidance. Tables need adaptable column widths, emphasis and readable footnotes. Preserve editable data and rebuild inputs. |
| P1 | **Native file and placeholder validation** | We inspect packages, preserve protected parts and render outputs. | Detect residual template prompts and broken relationships; add appropriate OOXML/schema and target-editor compatibility checks with source-template baselines. Baseline preexisting defects without hiding new regressions. |
| P1 | **Structured brand handoff** | Brand add-ons supply identity, tokens, native assets and policy. | A compact contract for approved fonts, semantic palette, layout constraints, logo variants, imagery treatment and voice. Detect inconsistent supplied sources; retain one canonical token source. |
| P2 | **Audience and delivery modes** | Intake asks about live talk versus reading deck and duration. | Carry the choice through density, speaker notes, appendix placement and pacing. Preserve supplied notes; generate new narration only within the user's requested scope. Google scene notes currently need native tools. |
| P2 | **Semantic studio edits** | Studio selects individual objects and edits text/geometry with version history. | Replace an asset, edit diagram nodes, rearrange a meaningful group, or try a different treatment while retaining content and provenance. Preserve stale-edit protection. |
| P1 | **A representative deck benchmark** | Rendering, native objects, preservation, studio and guidance have regression tests. | A common brief containing data, comparison, process, architecture, quote and product imagery. Check factual retention, native editability and visual review across outputs; assess repetition against content rather than count layouts. |

The current-state assessment is based on
[scene validation](../../scripts/lib/scene.mjs),
[layout recipes](../../scripts/lib/layouts.mjs),
[PowerPoint rendering](../../scripts/lib/pptx-render.mjs),
[Google compilation](../../scripts/lib/google-slides.mjs),
[review](../../scripts/lib/slide-review.mjs),
[studio](../../scripts/lib/studio.mjs), and the routed guidance in
[SKILL.md](../../SKILL.md). Some richer features can already be authored through
native tools or templates; the gaps above concern their systematic support in
the generic scene/workspace path.

## Existing capabilities to retain

- Editable text, shapes, native tables, PowerPoint chart data and linked Google charts.
- Working copies, protected content, hash/revision preconditions and scoped changes.
- Immutable workspace versions, restore and stale-save rejection.
- Browser previews plus actual native rendering, contact sheets and artifact-bound review records.
- Compact inspections and repair packets, separate brand overlays and focused reference loading.
- Explicit failures for unsupported conversions instead of silently flattening a slide.

## Techniques to adapt cautiously

Use repeat detection as a prompt for judgment, not a quota. A series of comparable
results may legitimately use one layout. Do not require imagery on a quote or a
simple statement, forbid adjacent similar layouts, or manufacture generated
images to hit a percentage. Avoid arbitrary HTML conversion as the default when
it loses native chart/table semantics. Keep the current agent entrypoint and
invoke specialized stages internally; users should not need seven slash commands
or a mandatory design interview for every deck.

## Suggested order

1. Per-slide planning, concrete composition helpers and content-aware critique.
2. Asset resolution, text measurement and focused repair of rendered problems.
3. Diagram/type-system extensions, evidence binding and native-file validation.
4. Optional auditions and richer studio edits once the native outputs support them.

Build the representative benchmark alongside the first slice. Judge the result
by whether the slide makes its content easier to understand, retains evidence
and stays editable—not by how many colors, pictures or layout names appear.
