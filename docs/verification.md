# Verification

## Current development verification — 0.16.0, 21 October 2026

The visual vocabulary change (tint cards, node states, dashed edges, attached
text endpoints, supporting colors, split-point and provenance audits, refusal
of words over words and of words wider than their line, `repair` clusters) has
tests for each behaviour in `tests/visual-vocabulary.test.mjs`; existing tests
were updated where behaviour changed on purpose (an arrow to a text now
attaches; a direction without meanings accepts supporting fills).

Host (macOS, Node 25): **314 tests, 310 passed, four skipped (native render,
exact font and browser checks), zero failures**; `context:check` and
`docs:check` pass. Disposable Tart VM from `tanzu-brand-golden-gate-base`
(macOS 27.0, Node 22.23.2, LibreOffice and Poppler, Playwright Chromium):
`npm run test:native` **314 passed, zero failures or skips**. The VM also
converted before/after proof decks built with `compose render` through
LibreOffice and Poppler, the conversion `compose preview --renderer local` runs,
and the refreshed gallery images in `docs/gallery/` come from that run. No
Google, Gemini or other provider requests were made; Google import of dashed
lines and strikethrough is unverified.

## Development verification — 0.15.0, 19 October 2026

Issue #72 closes the reproduced gaps in unbranded native structure, direct-source
image snapshots, critique coverage and preview ownership. The native writer is
shared between neutral and template compositions. Tests inspect real PPTX XML,
package relationships, notes, groups, connections, table row heights and routing;
these checks establish structure, not native pixel fidelity.

Reproduce the local gate with `npm ci --ignore-scripts`, `npm run test:setup`,
`npx playwright install chromium`, then `HARNESS_BROWSER_TESTS=1 npm test`.
Python dependencies stay in `.harness-slides/test-python`. `npm run context:check`
and `npm run docs:check` check the routed context counts and local Markdown links.
The scene and composition studio browser tests exercise selection, text edits,
new versions and restore. HTTP tests additionally exercise stale saves and moved
projects. Bundle tests verify unchanged reuse, one-page rasterization after a
revision, missing/corrupt artifacts, and exact PPTX reuse through preview,
design-bound review and delivery. Fixtures never stand for visual acceptance.

The development verification environment is Intel macOS 15.7.9, Node 25.9.0 and
Python 3.9.6. LibreOffice/Poppler are unavailable in that environment; native
pixel rendering and exact-font integration are not claimed by this run. The
new GitHub Actions workflow has separate portable core jobs (Node 20/22) and a
native job provisioning LibreOffice, Poppler, Arial and Chromium. `npm run
test:native` enables all optional checks and fails if those tools are missing.
The existing Tart gate remains available for clean macOS integration.

No live Google or Gemini requests were made for this change. Google ownership,
version conflicts and preservation of old previews are covered with transport
fixtures. Google import fidelity, live image generation and target-editor
appearance remain separate acceptance checkpoints, regardless of issue state.
The native icon/chart procedures below still need live account evidence.

`node tools/benchmark-render.mjs` measures real local rendering where LibreOffice
and Poppler are installed. `--fixture` replaces that transport while retaining
real native PPTX construction. The recorded [12-slide fixture run](measurements/2026-10-19-render-bundles.json)
had a 51.9 ms median unchanged reuse and rasterized only page 1 for a one-slide
revision. This is orchestration evidence, not a comparison to historical native
conversion timings or a production latency guarantee.

Local full gate: **297 tests, 295 passed, two skipped, zero failures**. The two
skips are the native-render and exact-font checks. Both real-browser tests ran.

GitHub Actions [native job on `4ae6444`](https://github.com/dbbaskette/harness-slides-skill/actions/runs/39292682801/job/118197101829):
**297 passed, zero failures or skips**, including real browser, LibreOffice/Poppler
rendering and exact Arial checks. The same run exposed two core-test assumptions
about Arial availability. The contrast fixture now permits the separate missing-font
warning; the shape-fit fixture checks the same explicit lines against rectangle
and diamond bounds, including a deliberately unavailable font. These changes
preserve the production missing-font warnings and fallback behavior.

The records below are historical evidence for their named revisions.

Host milestone, October 7, 2026: 26/26 tests passed with both real-browser and
real-rendering checks enabled. The suite verifies native chart/workbook and
table objects, notes, native images, source immutability, exact unedited XML
bytes, package-part preservation, stale edits, evidence omissions, browser
selection/save/restore, copied image inputs, installer identity and review
invalidation. Dependency audit reports zero vulnerabilities after pinning the
patched image parser. The skill frontmatter validator is a separate schema check.

Three example slides were rendered through LibreOffice/Poppler and manually
viewed at full size. Geometry, labels, table cells and chart data were readable
without clipping or overlap. Automated review-receipt tests exercise the gate;
their notes are explicitly test evidence, not human visual-quality acceptance.

The clean macOS Tart suite is the final integration gate. Its wrapper reuses
macos-test-suite, creates a disposable clone, installs dependencies and renderer
tools inside the clone, exercises the actual browser and rendering paths,
tests the shared installer and retains logs/artifacts. The base is not modified.
The tested commit and result are recorded below.

Google API behavior is tested with synthetic transport fixtures. No live Google
account was used by this implementation's tests. Organizational OAuth/Slides
availability and import fidelity still require verification on the user's
authorized working copy; offline or mocked results do not establish those.
The [native icon import procedure](verification/2026-10-14-native-icons-google-import.md)
covers whether icons and editable diagrams survive Google import. It has not been run yet.
The [native chart import procedure](verification/2026-10-14-native-charts-google-import.md)
covers what Google makes of a composition's bar, line and pie charts. It has not been run yet.

PowerPoint composition uses native templates and keeps chart dependencies.
Automizer cleanup is disabled because it removed a required chart relation in
the regression fixture. Unused native source parts may remain; use sanitized
templates and inspect actual output. Animations and complex layout/media features
are outside the composition guarantee. Guarded text patches use byte-level XML
edits and validate the result before publishing a new file.

## Clean-machine result

October 7, 2026: **PASS** on commit
`1fc24655b39f7d30df63e999e6a25c77239203d2`.

- Environment: macOS 27.0, Node 22.23.2, Python 3.9.6; disposable Tart clone.
- Full suite: 26 passed, zero failures or skips. Real browser and native rendering
  checks enabled; context counts, shared installation and dependency audit passed.
- Three example slides rendered with LibreOffice/Poppler and manually inspected.
  The table renderer now emits legal centered OOXML anchors, checked by a native
  XML regression assertion. No visible clipping or overlapping content was found
  in these examples. This does not certify arbitrary future decks.
- Logs: `~/Library/Logs/MacOS Test Suite/harness-slides/`
  `harness-slides-test-20261007121709-63343-8ebad873/`.
- The owned clone was stopped/deleted; its VM directory was confirmed absent.
  Base and signed-in VMs were not changed.

Later documentation-only commits reuse this evidence for the unchanged runtime.
The brand adapter has a separate full integration/installer suite in tanzu-brand;
its results do not substitute for the engine checks above. That suite passed on
brand commit `21103d9f53c5944c7c453f9efd7bd58bdffeed25`: 283 active tests passed
(four optional tests skipped), plus 15/15 browser checks, source and release
installer smoke, archive checksums and installed engine inspection. It used
macOS 27.0/Node 22.23.2 and the same runtime pin; its clone was also removed.


## Public guidance bootstrap — October 7, 2026

The new installed bootstrap and guidance-only refresh passed the combined Brand
clean-Mac integration gate. Scripts stay in a separately installed local runtime;
new tasks fetch current public instructions and resumes retain their exact pins.
Freshness, ancestor pins, compatibility, changed guidance/runtime detection,
unsafe caches, concurrent refresh locks and installed discovery placement are
covered by behavioral tests. Public main was also fetched using actual installed
entrypoints without a GitHub account, and saved tasks resumed without refetching.

Tested runtime: `6b964f075ddf23ed2fa93543ace7e8c81965ed6a`; macOS 27.0 /
Node 22.23.2; **34/34 passed**, zero skips, including real browser editing and
native PPTX rendering. Brand also built a native editable deck through the
separately installed runtime.

Combined logs: `~/Library/Logs/Tanzu Brand/Tart Tests/`
`tanzu-brand-test-20261007135019-46797-595efb92/`.
The owned clone was deleted; no base or signed-in VM changed. No live model or
Google account was used. A prior browser-version setup failure was corrected in
Brand's combined guest script; the full rerun passed. These local candidates
remain unpublished. This record changes documentation only.

## On-demand Gemini Web images — October 7, 2026

Final working-tree gate: **PASS**, 42/42 Node tests, zero failures or skips,
including the image worker's 11 offline cases. Real browser interaction and
LibreOffice/Poppler rendering were enabled. Dependency audit, context report,
shared installer and the bundled workspace build/render passed. Both skill
entrypoints also passed the frontmatter validator.

- Base commit: `3ad89ccf35afc3c37e04cfab5abc9635418a6cf8`, with the local image
  implementation and existing guidance/DNS changes. These changes are uncommitted.
- Installed runtime: `0.3.0-5d0ce4b144c0b3aad576`.
- Runtime content digest:
  `5d0ce4b144c0b3aad5765a683df742b4ed1112edd399b9532a6f394d7ef1d023`.
  The host dry-run and guest installation reported the same digest.
- Environment: macOS 27.0, Node 22.23.2, system Python 3.9.6 for existing
  presentation tools; the optional image environment used Python 3.11.17.
- The actual pinned Gemini dependency installed in disposable private state and
  passed its source-hash audit without authenticating or generating an image.
- Logs: `/private/tmp/harness-slides-image-ci/`
  `harness-slides-test-20261008021803-91228-6d8b4de2/`.
- The exact disposable clone was stopped/deleted and its VM directory confirmed
  absent. The stopped base and other VMs were not changed.

The earlier preliminary run also passed, but the digest above identifies the
final executable state, including atomic asset/metadata publication, clearer
Python prerequisites and the runtime compatibility guard. Documentation and
measurement records added afterward do not change that runtime.

Measured context increase: 16 tokens on ordinary routes; conditionally 753 tokens
of image guidance plus a 97-token normalized result. See the
[measurement report](measurements/2026-10-07-gemini-images.md) and its JSON counts.
These are `cl100k_base` counts and exclude image pixels/vision and conversation.

Provider fixtures establish local orchestration, receipt recovery, classification,
locking and file safety. They do not certify live Google sign-in, account-specific
image generation or authenticated download behavior. Those remain a live
acceptance checkpoint. No real Google account, model request or account quota
was used, and this gate does not establish Linux parity.
