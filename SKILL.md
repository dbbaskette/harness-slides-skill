---
name: harness-slides
description: Create, redesign, edit and visually review editable Google Slides or PowerPoint decks from briefs, source documents or existing presentations, with optional brand add-ons.
---

# Harness Slides

The AI owns story and design unless supplied. A user can provide a brief, source
documents or an existing deck; never require them to design an outline or JSON.
Default to native Google Slides, honoring explicit PowerPoint requests.

For new creative work, decide each slide's content and assets on its own merits
and review what the visual explains; generated art is one option, not a quota.
Choose each slide's composition and visual assets from its own content. Carry
the theme and narrative across the deck; do not carry a list or layout choice
across slides by default. Follow [design](references/design.md) for creative work. Before building,
walk through concrete slide proposals and wait for actual user approval via the
available question tool or chat; follow [design walkthrough](references/design-walkthrough.md).
Honor explicitly requested autonomy. Show native output and pause again for
revisions unless that checkpoint was explicitly waived.

## Agent entrypoint

At start/resume, tell the user “Using Harness Slides v<runtimeVersion>” from the
helper result; guidance revision is separate. Offline version checks use
`harness-slides.mjs version` from the returned runtime.

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
| New deck or full rework | First [draft](references/draft.md) it and get the draft approved, asking and waiting as the [walkthrough](references/design-walkthrough.md) says. Then, to build: [design](references/design.md) and [compositions](references/compositions.md) |
| Redesign that keeps the content | [Design](references/design.md) and [walkthrough](references/design-walkthrough.md), then [compositions](references/compositions.md) |
| More than about ten content slides, in a harness that runs subagents | Also [parallel build](references/parallel-build.md), once the walkthrough is approved |
| A deck that needs a native chart, or that compositions cannot express | [Other methods](references/authoring.md); load only the one chosen |
| Polish, content-preserving patch or selected-slide edit | [PPTX editing](references/editing.md) or [Google operations](references/google-slides.md), matching the destination |
| Native Google access/operations | [Google Slides](references/google-slides.md) |
| Writing a brand add-on or choosing among templates | [Brand add-ons](references/brand-addons.md); [template reuse](references/templates.md) only for inspection/composition. A deck that only uses an exported brand contract needs neither |
| Final rendering and verification, other than of a composed deck | [Review](references/review.md); its first table says which checks apply to the method used |
| Workspace browser and version controls | [Workspace](references/workspace.md) |
| Custom image generation or image setup | [Images](references/images.md) |

The guidance snapshot contains instructions only. Resolve references here; run
commands from the task's returned installed **runtime**, never this snapshot. Write artifacts in the user's project. Keep the installed skill unchanged.

```sh
node scripts/harness-slides.mjs --help
```

Use compact inspections and selected records. Read a method's contract only when
using that method. Load one brand and one delivery format. Assets and script
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
