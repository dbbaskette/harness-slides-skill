# Reuse real templates


`template inspect` extracts measured layouts, objects, fonts and colors with a
source hash. These are observations; the brand package supplies actual policy.
`template choose` honors explicit identity, use-case matches and declared defaults;
ties produce candidates for a user decision. Image-heavy exemplars do not imply
their pixels are editable geometry; inspect native masters/layouts.

Choose among the template's native layouts for each slide's content and
relationships. Reuse its theme and protected identity without treating one
selected layout as the default composition for the entire deck. Honor any
explicit layout requirements and the agreed preservation scope.

`pptx compose --plan composition.json --output new.pptx` uses pptx-automizer to
reuse actual slides and related chart parts. The plan contains `root`,
`sources:[{name,file}]` and `slides:[{source,number}]` (one-based numbers).
Animations, media relations and complex layouts need native inspection; this
library is not an in-place preservation guarantee. Unused native source parts
may remain, so use sanitized templates. Inspect and render output.

For Google, use full snapshots, scoped operations and `requiredRevisionId`.
Read back native objects and verify unselected content after a write. Refresh on
conflicts. Do not automatically retry an uncertain write or create duplicates.
