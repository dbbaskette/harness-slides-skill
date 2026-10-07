---
name: harness-slides
description: Create, redesign, edit and visually review editable Google Slides or PowerPoint decks from briefs, source documents or existing presentations, with optional brand add-ons.
---

# Harness Slides

The AI owns story and design unless supplied. A user can provide a brief, source
documents or an existing deck; never require them to design an outline or JSON.
Default to native Google Slides, honoring explicit PowerPoint requests.

## Agent entrypoint

Accept the accompanying plain-language request and operate the needed helpers
from the returned runtime. The AI prepares scenes and patches; never require
users to type commands or design an outline/JSON. A bare invocation should offer
create, edit, preview, resume/restore or review/export and ask for the relevant
brief, deck or workspace. Ask only for missing material decisions. Resolve local
prerequisites within scope; provider access and external changes retain their
normal authorization requirements.

For an existing deck, resolve editing freedom and target slides using
[intake](references/intake.md). Honor choices already supplied. Preserve the
source; work on a copy. Branding is supplied by a brand skill or template, not by
this engine. Apply its selected contract and assets; do not mix identities.

## Load only this task's path

| Task | Read |
| --- | --- |
| New deck, redesign or full rework | [Design](references/design.md), then [choose a method](references/authoring.md); load only that method/format |
| Polish, content-preserving patch or selected-slide edit | [PPTX editing](references/editing.md) or [Google operations](references/google-slides.md), matching the destination |
| Native Google access/operations | [Google Slides](references/google-slides.md) |
| Template or brand extension | [Brand add-ons](references/brand-addons.md); [template reuse](references/templates.md) only for inspection/composition |
| Final rendering and verification | [Review](references/review.md) |
| Workspace browser and version controls | [Workspace](references/workspace.md) |

The guidance snapshot contains instructions only. Resolve references here; run
commands from the task's returned installed **runtime**, never this snapshot. Write artifacts in the user's project. Keep the installed skill unchanged.

```sh
node scripts/harness-slides.mjs --help
```

Use compact inspections and selected records. Read the scene contract only when
using the compiler. Load one brand and one delivery format. Assets and script
implementations need not enter context to execute helpers.

## Delivery contract

- Retain editable text, shapes, tables, diagram relationships and chart data.
  Do not rasterize a slide or silently discard unsupported objects.
- Preserve content, structure, notes, links and protected artwork within the
  agreed editing scope. Use revision/hash preconditions; stop on stale state.
- Render and inspect each built or changed slide while its design context is
  fresh. Fix defects, then inspect every slide in the final deck and its rhythm.
  Record actual findings against the exact rendered revision.
- HTML is a composition preview, not proof of native layout fidelity. Structural
  checks do not prove visual quality. Unrendered output is an unreviewed draft.
- Report what was verified and any remaining limitations. Offline Google status
  cannot certify that a live deck's revision is unchanged.
