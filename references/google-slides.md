# Google Slides access

Use an already-authorized connector, browser, gws or gcloud transport available
in the harness. Neither gws nor gcloud is an unconditional skill requirement.
Authenticate through the user's approved account/client. Never put tokens into
scene files, URLs, logs, versions or installed skills.

For gcloud Drive operations, install Google Cloud CLI on macOS if requested:

```sh
brew install --cask gcloud-cli
gcloud auth login --enable-gdrive-access --force
node scripts/harness-slides.mjs drive check
```

This uses gcloud's OAuth client for Drive access. Drive export/import access does
not prove native Slides API access; organizational policy, client scopes and API
availability may differ. Check a specific presentation before native authoring:

```sh
node scripts/harness-slides.mjs doctor --google-check --file-id ID
node scripts/harness-slides.mjs google copy --file-id ID --name "Working copy"
node scripts/harness-slides.mjs google snapshot --file-id COPY_ID --output snapshot.json
```

The file ID is between `/d/` and `/edit` in the Slides URL. `copy` creates a
working copy and needs user authorization from the task. Inspect its native
layouts, masters, elements and revision. Adapt existing objects where practical.
Preserve native structure, inherited layout/master styles, notes, links and skipped
status. Save full inventories privately and read compact summaries or selected
objects. Imported PPTX IDs must be resolved again in Google. Edit mixed-style text
by its run/paragraph roles; use native lists and preserve image aspect ratios.
Scene builds use required revision preconditions and read back created/preserved
objects. For other native edits, use scoped operations and `requiredRevisionId`,
read back the changes and verify untargeted objects. Refresh on conflicts; inspect
an uncertain write before retrying so objects are not duplicated.

Duplicate a suitable rich exemplar when it helps; map every content slot to keep,
replace or remove. Remove stale claims and portraits without inventing replacements.
Do not rebuild from extracted text alone. If charts import as images, recreate
editable backing data in the destination and relink charts; copied decks can retain
links to the original spreadsheet. Verify accessible data, notes, styles and native
editability as well as rendering.

If native access is unavailable, use the authorized connector/browser or the
Drive/PPTX path. Do not repeatedly log in to solve a disabled API, require a new
Cloud project that the user cannot create, or claim a PNG-only deck is editable.

```sh
node scripts/harness-slides.mjs drive export --file-id ID --output original.pptx
node scripts/harness-slides.mjs drive import --file revised.pptx --name "Revised deck"
```

Import creates a new Google Slides file. Review actual Google output afterward:
conversion can change fonts, wrapping, charts and layout. Keep the PPTX source
and report conversion limitations. No automatic retries for uncertain uploads.

## Connector compilation and readback

Use the same compiler through an already-authorized native connector when that
transport is available. These operations are offline and do not start another
login or service:

```sh
node scripts/harness-slides.mjs google compile --file scene.json --template before.json --output plan.json --local-images
node scripts/harness-slides.mjs google notes --file scene.json --template after-content.json --output notes-plan.json
node scripts/harness-slides.mjs google verify --file scene.json --template after.json --source before.json
```

Send the structured `requests` and `writeControl` through the connector. Enable
`--local-images` only for a transport with authenticated local-image sidecars;
the plan lists the absolute local paths. Supply those paths as the connector's
image sidecars, with matching createImage URL placeholders. Never silently upload
assets publicly. The ordinary gcloud/workspace apply route still needs HTTPS
image URLs. Images and linked charts fit inside their requested bounds while
preserving intrinsic aspect ratio; readback checks their centered fit.

Notes are a second revision-controlled phase: read actual speaker-notes IDs after
content creation, compile the notes batch, send it, then read the final deck.
Omitted notes preserve existing content; an explicit empty string clears notes.
The gcloud apply helper stages this automatically. A notes failure leaves a
partially completed operation and requires inspection before retrying.

Final readback verifies text, geometry, unequal table widths/overflow, notes,
image alt text, chart source IDs and untouched source objects/slide metadata.
Chart data and styling remain in Sheets; verify its values and refresh the linked
chart after source edits. Readback is not a visual-quality certification. Inspect
native renders and keep revision-bound evidence. The repeatable live fixture and
procedure are in [Google acceptance](../docs/verification/google-quality-acceptance.md).
