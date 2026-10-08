# Google scene authoring


Read [Google access](google-slides.md) only for this route. Get a full native
snapshot of the authorized working copy. Its canvas must match the scene. New
slides may select a verified `layoutId`; existing slides enumerate `replace` and
`protect` top-level object IDs. Unlisted objects and slides remain untouched.

```sh
node scripts/harness-slides.mjs workspace init --project ./deck-work --file scene.json --template snapshot.json
node scripts/harness-slides.mjs workspace build --project ./deck-work
node scripts/harness-slides.mjs workspace apply --project ./deck-work --dry-run
```

Inspect the version's HTML, then apply within the user's authorized editing
scope. Google needs public HTTPS images or authorized native insertion. Editable
charts require an existing linked Sheets chart. Local images, arbitrary chart
data require native insertion/backing Sheets on this route; the compiler stops
rather than dropping them. Explicit scene notes are staged after creation using
actual speaker-notes IDs and a fresh revision. The connector compiler supports
local image sidecars; follow [Google access](google-slides.md). The final renderer is Google, not HTML.

