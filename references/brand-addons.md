# Brand add-ons

Brand skills are overlays: identity, palette, typography, voice, approved icons,
templates, layout contracts, exemplars and brand-specific audit policy. Harness
Slides owns format mechanics, preservation, workspace history and visual review.
The selected brand should be resolved once and loaded only when requested or
implied by explicit identity. Product names alone need not choose the deck brand.

Use the add-on's real fonts and tokens in `scene.theme`. Keep template geometry
and protected artwork in native snapshots. Search its functional icon catalog
by concept and use its stable native-copy IDs; the engine does not bundle or
replace proprietary artwork. For missing matches, follow the add-on's asset
policy. Recolor permitted copies, not official logos.

Template manifests may specify `id`, `format`, `useWhen` terms, `priority`,
`default`, `enabled` and a native source file/reference. Explicit user choice
wins. Ambiguous matches require a decision; previews do not establish authority.

`tanzu-brand` keeps private assets and thin adapters; it resolves this separately
installed runtime. New tasks fetch public instructions, while existing work
retains its guidance revision and installed runtime. Use the returned runtime
for executable commands and set `HARNESS_SLIDES_ROOT` to it for Brand adapters.
Instruction refresh never installs or executes repository scripts. The trusted
standalone installer serves Codex, Claude Code and Cursor; runtime updates remain
separate from guidance updates. No additional model or provider account is needed.

The legacy `sync-brand-engine.mjs` utility is for older vendored integrations;
it is not part of the current Tanzu Brand workflow.
