# Choose the authoring method

For a native template, copy it and reuse its real layouts, masters and elements.
Read [template reuse](templates.md); no scene contract is needed. Keep complex
or unsupported native content in native tools rather than flattening it.

For supported new content, use [content-led components](content-components.md)
to compile per-slide intent into native objects. Unbranded plans use neutral
defaults; selected brands supply their resolved contract. Use the primitive scene or a native
layout when a component does not fit.

For supported new compositions, an AI-owned scene provides stable object IDs,
geometry in points, semantic roles and evidence references. It creates HTML
previews and native output; it is not a general CSS converter. Only this method
needs the scene contract:

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
