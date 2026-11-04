# Harness Slides 0.17.0 verification

Tested commit `46d7d58037c0d44702167509ec530a8fc1a21e52`, tree
`e79f2d0f636f932e8e292337a5d10bc64a0efc3a` in a disposable macOS 27 VM,
Node.js 22.23.2. All 354 tests passed, zero failures or skips. The native gate
included Chromium, LibreOffice/Poppler, isolated image-runtime setup, context
budget checks, dependency audit, installer/version checks and a newly installed
editable workspace build/review. No live Google, image or model request ran.
The owned VM was deleted; detailed logs remain on the verification host.

The 30-slide synthetic iteration rasterizes one changed page and inspects the
changed slide plus two neighbors; 27 verified earlier inspections stay traceable.
The exact current whole deck still needs its final consistency receipt. Global
brand/font/layout/question changes, order and renderer changes invalidate reuse.
These counts do not establish live model latency or eliminate whole-deck PDF
conversion. Existing calls remain revision-based. User approval is never reused.

Earlier gate attempts found only a stale capability inventory assertion and its
required documentation-table entry; both were corrected before this clean pass.
