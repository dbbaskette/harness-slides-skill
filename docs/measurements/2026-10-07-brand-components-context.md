# Brand and content-led generation context

Measured with `cl100k_base`, using the repository context tool. This comparison
starts from the existing image-enabled working tree (0.3.0), not from an older
public release. Raw before/after JSON records retain file hashes and routes.

| Reading path | Before | After | Change |
| --- | ---: | ---: | ---: |
| Bootstrap + current guidance entry | 1,189 | 1,208 | +19 |
| Scoped PPTX edit + review | 2,472 | 2,491 | +19 |
| Scoped Google edit + review | 2,667 | 2,686 | +19 |
| New PPTX native-template deck + review | 3,368 | 3,443 | +75 |
| New PPTX primitive scene + contract + review | 3,555 | 3,665 | +110 |
| New Google primitive scene + contract + review | 4,260 | 4,370 | +110 |
| Optional image guidance + download result | 2,123 | 2,142 | +19 |
| Content-led PPTX + comparison contract + review | — | 4,512 | New optional path |

The selected comparison helper output is **192 tokens**. It returns only that
component's fields and relevant guidance. A full component catalog is available
for discovery but does not need to load for every slide. Catalogs, runtime code,
provider implementation and research documents remain conditional.

A real default Tanzu export, without selected author voice, measured **602 tokens
for DESIGN.md** and **138 for VOICE.md**. These are additional selected views, not
already included in the engine reading-path totals. The view counts include the
actual local reference path and revision, so other installations can differ.
For language-only work, read VOICE.md; visual work reads DESIGN.md. The complete
JSON contract is consumed by helpers and does not need to enter agent context.

Blog Studio's existing character-based inventory was refreshed separately; its
new conditional brand handoff estimates 343 tokens. Those estimates use its
existing characters/4 method and are not directly comparable to the tokenizer
measurements above. Existing author profile storage and task pins are unchanged.

This measures instruction context, not total conversational tokens, model calls,
image generation quota, output deck bytes or latency. Source material, selected
author guides, image pixels and task-specific helper results add separately.
