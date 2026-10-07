# Verification

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
its results do not substitute for the engine checks above.
