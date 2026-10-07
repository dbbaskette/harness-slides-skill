# Harness Slides: editable, brand-neutral slide work

Approved direction: the user's October 7 request. Build a standalone engine from
the slide tooling in tanzu-brand, with focused additions from the source review.
Do not retain the image-generation fork as the engine.

## Contract

- Google Slides is the default; native editable PowerPoint is also supported.
- A marketer supplies a brief or source files. The AI owns any intermediate scene
  or outline; JSON is an implementation detail, not an intake requirement.
- Existing-deck intake distinguishes brand-only, polish, redesign preserving
  content, selected-slide edits, and full rework. Retain choices already supplied.
- Brand packages supply fonts, palettes, templates, icons and voice. The engine
  contains no Broadcom, VMware or Tanzu proprietary assets or fixed identity.
- HTML previews use the same scene geometry as native output. They do not certify
  PowerPoint/Google fidelity. Every final slide needs actual rendered inspection.
- Working copies, revision preconditions, preservation checks, immutable versions,
  and hash-bound review prevent silent source loss or stale certification.
- Skills for Codex, Claude Code and Cursor point to one runtime. Context grows
  only along the selected authoring, editing or review path.

## Slices and acceptance

1. Extract brand-neutral scene, Google transport, review and PPTX inspection/icon
   utilities. Preserve tanzu-brand compatibility through thin adapters.
2. Add editable PPTX rendering and template composition, compact template
   inspection, semantic evidence/coverage checks and guarded existing-deck edits.
3. Add an immutable workspace history and a loopback browser studio for previews,
   object selection and optimistic-concurrency scene edits. No embedded account
   tokens or harness-specific model endpoint.
4. Add clear intake/design/edit/review references, shared installers and commands.
   Reuse existing brand installation packaging for the pinned engine snapshot.
5. Verify both engines, native object types, preservation and review invalidation,
   browser controls, installers and actual rendering. Run integrated macOS suites
   in disposable Tart clones using macos-test-suite. Record gaps honestly.
6. Keep a recovery archive of the old fork. Replace its remote with a standalone
   harness-slides repository only after the implementation is verified. The user
   authorized removing the old fork; this does not authorize releasing unfinished
   code or publishing private brand assets.

## Reviewed patterns

office-kit/pptx: editable browser workspace and incremental visual review.
siril9/presentation-skill: semantic object IDs and guarded preservation checks.
mpuig/agent-slides: compact inspections and declarative, scoped operations.
pptx-automizer: reuse real template slides/shapes in PowerPoint output.
Microsoft CAT: template routing from explicit choice and intended use.
dom-to-pptx / mk-present: compile a constrained scene to HTML and native objects;
do not promise arbitrary CSS conversion or flatten unsupported content.
OpenAI Google Slides: native snapshot, working-copy and target-rendered review.
Anthropic's PPTX skill is not incorporated; its directory license is restrictive.

## Completion record

Pending implementation and verification. Original brand repo baseline:
5e5003a48c5aaa44b5d30a8c3fae2557b294b325. Original fork baseline:
dbc2a5992e937760e9ce8e587e11729f970881cb, including unfinished local adaptations.
