# Harness Slides

Turn a brief, source documents, or an existing presentation into an **editable
Google Slides or PowerPoint deck** with your coding agent. Describe what you
need; the agent handles the story, design, builds, and slide review.

Use `/harness-slides` in Claude Code, `$harness-slides` in Codex, or ask Cursor
to use the skill.

## 1. Install once

You need **Git**, **Node.js 20 or newer**, and **Codex, Claude Code, or Cursor**.
PowerPoint inspection also needs **Python 3.9 or newer**.

Run these commands in your terminal:

```sh
git clone https://github.com/dbbaskette/harness-slides-skill.git
cd harness-slides-skill
bash scripts/Install-Harness-Slides.sh
```

Installation succeeds when the output contains `"status": "installed"`. The
installer registers the skill with all three agents and preserves unrelated
skills. To preview the changes first, add `--dry-run` to the installer command.

## 2. Open your project

Open **the folder where you want your deck saved** in your coding agent, then
start a new session so it can discover the installed skill. This can be any
project folder.

Put your brief or source documents in that folder, or attach them if your agent
supports attachments. For the example below, save your brief as `brief.md`.

## 3. Ask for your first deck

Choose the prompt for your agent and replace the filename and audience with
your own:

**Claude Code**

```text
/harness-slides Create an editable PowerPoint deck from brief.md for a
10-minute customer presentation. Use only this brief, and visually review
every slide before handing it back.
```

**Codex**

```text
$harness-slides Create an editable PowerPoint deck from brief.md for a
10-minute customer presentation. Use only this brief, and visually review
every slide before handing it back.
```

**Cursor**

```text
Use the harness-slides skill to create an editable PowerPoint deck from
brief.md for a 10-minute customer presentation. Use only this brief, and
visually review every slide before handing it back.
```

The agent reads your material, asks for any important missing details, builds
the deck, and reviews the rendered slides. It returns a link to the deck and
explains any checks it could not complete. You can keep asking for changes in
the same conversation.

**No brief ready yet?** Try the bundled example:

```text
/harness-slides Build the bundled PowerPoint example in ./example-work
and open its local preview studio.
```

Use `$harness-slides` in Codex, or ask Cursor to use the skill. The agent handles
the setup and returns a preview link. This example is a draft for trying the
workflow; ask for native rendering and visual review before using it as a
finished presentation.

## Choose your output and style

- **PowerPoint:** say “editable PowerPoint” or “.pptx” in your request. The agent
  prepares local authoring dependencies when needed. No Google account is required.
- **Google Slides:** say “Google Slides.” This is the default if you do not choose
  a format. The agent needs authorized access to your Google presentation; see
  [Google setup](references/google-slides.md) if access is unavailable.
- **Your branding:** supply a company template or name an installed brand skill,
  such as Tanzu Brand. Harness Slides uses the identity you provide.

## Improve an existing deck

Supply the deck and say what the agent may change. For example:

```text
/harness-slides Polish launch.pptx. Improve spacing, alignment, and typography
on slides 3–6. Keep the wording, slide order, and speaker notes. Work on a copy
and visually review the changed slides.
```

You can ask for branding only, visual polish, a redesign that keeps the content,
or a full rework of the story and structure. Name any slides, claims, or artwork
that must stay unchanged. Use your agent's invocation syntax as shown above.

## Preview, revise, and continue later

Use the same entrypoint for the rest of the workflow:

| What you need | What to ask |
| --- | --- |
| See the available workflows | Invoke `/harness-slides` or `$harness-slides` without a request, or ask Cursor what the skill can do. |
| Open the local editor | “Open the preview studio for ./deck-work.” |
| Revise a slide | “Make slide 4 easier to read. Keep its claims and chart data.” |
| Continue later | “Continue the deck in ./deck-work and fix the remaining review findings.” |
| Recover earlier work | “Show the saved versions of ./deck-work so I can choose one to restore.” |
| Inspect a template | “Inspect company-template.pptx and suggest layouts for this brief.” |
| Review before sharing | “Render and visually review the final deck, fix any issues, and return the editable file.” |

Replace `./deck-work` with the workspace path returned by your agent. To continue
later, reopen the same project and name that workspace.

The local studio lets you select objects, edit text or geometry, and save a new
version. Its browser preview approximates the final layout. Review the actual
PowerPoint or Google Slides render before sharing the deck.

## If something gets stuck

| Problem | Next step |
| --- | --- |
| The agent cannot find the skill | Confirm installation returned `"status": "installed"`, then start a new agent session. |
| The invocation is not recognized | Use `/harness-slides` in Claude Code, `$harness-slides` in Codex, or “Use the harness-slides skill” in Cursor. |
| You typed the command in a terminal | Skill invocations belong in your agent's chat. The installer does not add a terminal command to `PATH`. |
| PowerPoint dependencies or rendering tools are missing | Ask the agent to identify and prepare the missing local tools. The installer also prints a command for manual authoring dependency setup. |
| Google access is unavailable | Follow [Google setup](references/google-slides.md), or request a local PowerPoint deck. |
| Installation finds an unrelated existing skill | Review the named location before moving anything; the installer preserves it. |

## For maintainers

Normal use happens through the agent. The helper CLI is available from this
checkout or the installed skill directory:

```sh
node scripts/harness-slides.mjs --help
```

The agent owns scene and patch JSON. Helper commands cover workspaces, previews,
version history, template inspection, native edits, Google access, and review.
See [workspace controls](references/workspace.md), [editable authoring](references/authoring.md),
and [native editing](references/editing.md) for the relevant command examples.

`npm test` checks the engine, preservation, Google fixtures, installer, and
studio. `npm run ci:local` uses the shared Tart/macOS suite with a disposable
clone, real browser interaction, and LibreOffice rendering. Tests require no
live Google or model account. See [verification](docs/verification.md) for recorded
results and limits, and the [implementation plan](docs/implementation-plan.md)
for architecture and provenance.

<details>
<summary>Instruction context usage</summary>

The skill loads only guidance for the selected task, output format, and optional
brand. These counts cover instruction loading, excluding source documents,
images, tool responses, and generated artifacts.

<!-- CONTEXT-USAGE:START -->
Measured with `cl100k_base`; cumulative whole-file instruction counts.

| Reading path | Tokens |
| --- | ---: |
| Discovery metadata | 40 |
| Activated entrypoint | 740 |
| Scoped PPTX edit + final review | 1,837 |
| New PPTX deck + final review | 2,178 |
| New Google deck + final review | 2,632 |

Intake, workspace and brand integration guides load only when needed; brand
contracts and query results add task-dependent context.
<!-- CONTEXT-USAGE:END -->

Run `npm run context:update` after changing guidance and `npm run context:check`
to check the recorded counts.

</details>
