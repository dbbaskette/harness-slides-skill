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

`tanzu-brand` ships a pinned subset of this engine inside its existing shared
package. Thin adapters supply its tokens/profile and preserve existing commands.
The brand installer still works offline and avoids a second model or account.
The standalone engine has its own shared installer for Codex, Claude Code and
Cursor. A deployment may place one engine centrally and point several brand
skills to it; retain a known version so offline reproducibility does not depend
on a moving repository.
