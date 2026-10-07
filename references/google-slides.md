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
Scene builds use required revision preconditions and read back created/preserved
objects; still compare text, styles and notes in native tools before delivery.

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
