# Approved design walkthrough and slide-quality implementation

The user approved implementing the complete real-deck audit plan, including host-native question tools. Scope: Harness Slides workflow/runtime and Tanzu Brand identity guidance. Preserve older dirty checkouts and installed runtimes. Publication, installation, and changes to the reviewed Google deck are separate actions.

## Contract

1. New decks and substantial redesigns propose a concrete description per slide before construction: takeaway, audience question, approximate visible text, relationship, composition, specific asset purpose and strongest feasible alternative. Default to a guided walkthrough. User may select batch review or explicitly authorize an autonomous build.
2. Use Claude Code `AskUserQuestion`, the available Codex question tool, or a chat question. Question tools are an interface, not proof of approval. Async return, preselection and timeouts do not advance dependent work. Record actual user responses against the proposed revision and requested slides. Build remains blocked while decisions are pending. Retain feedback and invalidate affected approvals on changes.
3. After technical/creative review, show actual rendered slides and wait again for revisions unless the user explicitly waived that checkpoint. Keep technical QA, creative critique and user acceptance distinct.
4. Give native-template output a structured, revision-bound critique with real slide/object IDs, source coverage, asset purpose, explanatory value, hierarchy, text completeness and repeated-geometry judgment. Bulk technical notes cannot alone certify creative review.
5. New content preserves brand identity and protected native artwork while selecting the body construction from meaning. Text fitting a template is not proof that the template explains layers, topology, ownership or a decision. Compare with the best feasible alternative, not fabricated evidence or decorative assets.
6. Choose a specific icon, native construction, image or art brief per relevant slide. No image/layout quotas. Clarify allowed Broadcom conceptual illustration separately from approved photographs. Keep evidence and labels editable; generated art never supplies factual proof.
7. Add regression coverage for walkthrough state transitions, feedback, explicit autonomy, stale revisions, native critique and missing rendered text. Add a real-prompt field protocol and representative before/after rendering checks. Label scripted tests and construction demonstrations honestly; they do not prove an autonomous model follows instructions.

## Implementation slices

- A: Persist design proposals/questions/actual responses and final rendered acceptance; integrate build/asset/authoring gates without breaking existing saved tasks or preservation edits.
- B: Native critique reports and assessments bound to plan, snapshot and render hashes; readiness separates pixel coverage, critique and user acceptance.
- C: Cross-host walkthrough guidance and clear new-content/template-preservation precedence; strengthen per-slide alternatives and asset decisions.
- D: Brand handoff, Broadcom illustration policy and user-facing first-use documentation.
- E: Meaningful unit/integration regressions, field protocol and examples; targeted milestone tests followed by the relevant full suite in the existing disposable Tart infrastructure. Update measured context reports.

## Validation boundary

No live provider generation, private-deck upload or global installation is needed for implementation verification. Disposable tests use scripted user responses explicitly labeled fixtures. Record actual source tree and environment. Real host UI and prompt-led signed-in native-deck generation remain a separately identified acceptance check if they cannot be exercised here.

## Progress

- Plan includes host-native question tools and explicit waiting semantics.
- A–D implemented: guided/batch/autonomous design decisions, retained feedback, revision-bound build/image gates, separate rendered acceptance, native/PPTX structured critique, content-led template precedence and Brand asset policy/handoff.
- E complete for engineering verification: 90/90 Slides tests; 292 passing Brand core tests (four optional cases deferred); 15/15 browser/native checks; existing packaging and clean installer checks passed in a disposable macOS 27.0 / Node 22.23.2 Tart VM. The unchanged Research integration also passed 36/36 tests.
- Final Slides candidate archive SHA-256: `d0f9ace3c3e7fb87dee1f3cb0e379e1e0ba0f74b33b2b692a00e7f8d67a411b8`, based on `2a42263dd9cc528e7ac24af128c4f4e1d4fd43de`. Brand based on `5a6d55aa116938be55a7d6b98baff9ead4eaf410`; its tested source-file digest was `0e12fa52de29a213009f31d8efc177c3dde12c6d2d3def12099049edbc0e0ce3`.
- Four hand-authored Broadcom demonstration slides use different constructions and approved editable icons. Pixel/creative inspection and selected native master/layout byte comparisons passed. This narrows the source teaching examples and is not a content-equivalent deck replacement or autonomous prompt benchmark.
- Both skill frontmatter validators and refreshed context receipts passed. Harness activation adds 94 tokens; the new native-deck workflow adds 2,326 conditional instruction tokens. Proposals/pixels/helper results add separately.
- The full CI runner removed its disposable VM and retained its logs. No signed-in/base VM was changed.
- Fresh real Claude/Codex/no-question-host trials and live generated-image acceptance remain explicitly untested, with the field protocol in `docs/verification-design-quality.md`. Publication, release, user-Mac installation and edits to the reviewed live deck remain outside this increment.
- Post-CI changes only record these results in the plan; runtime instructions/code remain the tested state.
