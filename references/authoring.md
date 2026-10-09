# Other authoring methods

New slides in a brand template are [composed](compositions.md). Use a method
below only for a deck compositions cannot express; one build uses one method. Approve [the proposal](design-walkthrough.md) first; these methods keep
it in [checkpoint records](design-records.md).

| Need | Method |
| --- | --- |
| A chart | [Typed components](content-components.md) |
| A template's own rich slide, reused or adapted | [Template reuse](templates.md); no contract needed |
| Anything else, or an unbranded deck | An AI-owned scene, below |

Keep complex or unsupported native content in native tools rather than
flattening it.

## Scenes

A scene gives stable object IDs, geometry in points, semantic roles and evidence
references. It creates HTML previews and native output; it is not a general CSS
converter. Only this method needs the scene contract:

```sh
node scripts/harness-slides.mjs scene contract
node scripts/harness-slides.mjs scene validate --file scene.json
```

Assign actual source IDs to material claims/sections. Pass their JSON list with
`--required`; coverage catches omitted material but does not prove factual truth.
Mark illustrative data and proposed ideas. Load only the selected format:
[Google scene authoring](authoring-google.md) or
[PowerPoint scene authoring](authoring-pptx.md). Inspect HTML during composition,
then follow [native review](review.md) before delivery.

For a starting pattern, query one for the slide's relationship, for example
`layouts --query "comparison" --limit 3`. Prefer a brand add-on's verified
native layouts where it offers them. Choose per slide; do not load the catalog.
