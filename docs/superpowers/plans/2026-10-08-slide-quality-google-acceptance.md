# Slide quality and native Google acceptance

User-authorized scope: iterate research priorities 1–3, then push, open a PR and merge.
Start from merged Harness Slides `f030fe5`; preserve the original dirty checkout.

## Outcomes and coherent increments

1. Font-backed text fitting and geometry review. Add a lazy Fontkit runtime dependency,
   resolve exact regular/bold fonts from explicit files or known system locations,
   record font hashes and coverage, and measure shaped widths and wrapping in points.
   Flag missing fonts/glyphs, overflow and unintended content collisions. Do not
   substitute fonts silently, shrink type, rewrite claims or treat measurements as
   target-editor proof. Integrate quality reports with compilation, workspace builds
   and focused repair packets. Record intentional image annotations explicitly.
2. Structured content critique. Carry the compiler's per-slide intent into a pinned
   workspace design report. Offer artifact-bound review prompts and assessments for
   title/evidence support, visual relationship, reading order and justified repetition.
   Numeric inconsistencies and geometry defects are automated findings; persuasive
   meaning and factual source support require explicit reviewer judgment. Uncertain
   or unresolved assessments keep delivery in draft. Tie repairs to slide/object IDs.
3. Native Google acceptance. Create only named, synthetic benchmark resources using
   existing authorized transports. Include unequal-column tables, long labels,
   signed/zero linked chart values, annotated imagery, editable architecture,
   notes and accessibility descriptions. Strengthen compiler/readback where the live
   test exposes gaps. Verify edits and chart refresh, untargeted preservation, and
   revision-bound Google renders. Never certify unavailable live coverage.

## Interfaces and files

- `scripts/lib/text-metrics.mjs`, `slide-quality.mjs` and regression tests own fitting
  and critique contracts; `deck-plan.mjs`, `workspace.mjs`, CLI and routed references
  connect them to normal authoring and repair.
- `google-slides.mjs` owns staged native notes, explicit typography, asset transport
  capability boundaries and semantic readback. A synthetic acceptance fixture and
  runner produce reusable input/readback evidence without credentials in Git.
- Keep one user-facing `/harness-slides` entrypoint and progressive disclosure.
  Converter adoption, attached connector primitives, new image providers, voice
  training and global skill installation are outside this increment.

## Verification ownership

The primary agent owns all changes and final verification; no delegation.
Run targeted suites at the fitting/critique and Google milestones. Use the existing
Tart wrapper once for the final complete suite, browser/native rendering, installer,
context and dependency audit. Retain exact tree and environment evidence and confirm
owned-VM deletion. Separately run authorized live native Google acceptance, inspect
all delivered slides and report actual limits. Update context inventory and relevant
research status, verify source/provenance, then push/PR/merge with remote gates intact.
