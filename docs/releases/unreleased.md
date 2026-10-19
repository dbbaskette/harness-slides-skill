# 0.15.0 — unreleased

Composition output preserves editable groups, routed/attached connectors, native
tables and chart data through the same writer with or without a brand template.
All local image sources are copied and hash-checked in the compiled artifact.

New composition projects keep the editable source, outline/build versions,
previews, review locations and remote preview IDs. Open the compiled folder in
the studio, or register builds in an outline project with `compose compile
--project ROOT`. Studio text changes reflow the source, and restore creates a
new version with fresh review requirements. Neutral live/reading profiles include
cover, section and closing layouts.

Verified native render bundles are shared by preview, design-bound review and
delivery. Unchanged native bytes and pixels are reused across output locations;
equivalent pages can reuse pixels after a revision. Thumbnails use existing
images. Critique and user acceptance are separate and never cached as approval.

Critic packet schema 2 requires every slide's eight answers, an inspection note
and findings for failed answers. Deck and image hashes are checked before the
receipt is recorded. Older packets need a new preview. Older compiled folders
need recompilation to use composition projects/studio.

Google previews store private ownership/version receipts. An unrelated name,
missing receipt or remote edit cannot authorize replacement. An unchanged owned
preview is preserved while a fresh preview is created; use the newly returned
ID. Live provider behavior remains unverified by this implementation's fixtures.

Portable test setup pins Pillow in a private virtual environment. Core and native
GitHub Actions jobs report coverage separately, `doctor` honors configured
renderer paths and reports route prerequisites, and local Markdown links are
checked. See [current verification](../verification.md) for reproducible commands
and limits. Version/capability reporting and guidance compatibility require 0.15.0
for these workflows; 0.14.1 retains guidance at `833832f549f84c3ed689faa4eae93bfc1fd29677`.

This is development work for issues #72 and #71, not a published release.
