# Harness Slides

Turn a brief, source documents, or an existing presentation into an **editable
Google Slides or PowerPoint deck** with your coding agent. Describe what you
need; the agent handles the story, design, builds, and slide review.

Use `/harness-slides` in Claude Code, `$harness-slides` in Codex, or ask Cursor
to use the skill.

Slides share a theme while their compositions follow their own content: a
comparison, process, architecture, metric, chart, table, quote or image can each
use a different structure. Brand add-ons can supply a resolved design contract
and a separate author-voice handoff. The agent handles these choices and helpers. It screens text using available
font files, reviews each slide’s title and evidence, and checks native rendering.
Missing fonts and uncertain claims are reported for resolution.

## Review the design before it builds

For a new deck, the agent first shows a whole-deck wireframe draft to settle the
story, wording and order. After your approval it shows two or three rendered
looks for a representative slide, unless you supplied an established look.
Your choice sets the direction for the build. Claude and Codex use their
available question interface; chat works when it is unavailable. The agent waits
for your actual answer at each checkpoint. You can explicitly request autonomy.

After building, it shows the rendered slides and pauses for revisions again.
Technical checks, design critique and your acceptance are tracked separately.
You never need to edit a JSON plan or run the internal helpers.

## 1. Install once

You need **Git**, **Node.js 20 or newer**, and **Codex, Claude Code, or Cursor**.
PowerPoint inspection also needs **Python 3.9 or newer**.

Run these commands in your terminal:

```sh
git clone --branch v0.14.1 --depth 1 https://github.com/dbbaskette/harness-slides-skill.git
cd harness-slides-skill
bash scripts/Install-Harness-Slides.sh
```

Installation succeeds when the output contains `"status": "installed"`. It also
installs the engine's packages and reports `"dependencies": "installed"`; add
`--skip-dependencies` to install without network access. The
installer registers the skill with all three agents and preserves unrelated
skills. To preview the changes first, add `--dry-run` to the installer command.

## Know which version you are using

The current published release is [v0.14.1](https://github.com/dbbaskette/harness-slides-skill/releases/tag/v0.14.1).
The development checkout is 0.15.0 (unreleased), with composition projects,
verified critique packets and shared native render bundles. Its guidance requires
the matching runtime; 0.14.1 installations retain compatible guidance.
The skill reports “Using Harness Slides v0.14.1” when starting or resuming work.
A resumed deck may use its older saved runtime and will report that version.
Guidance can refresh independently; its revision does not replace the runtime version.

Ask your agent “Which Harness Slides version are you using?” It can check the
actual executing runtime without Google access. For a manual check:

```sh
node "<installed-runtime>/scripts/harness-slides.mjs" --version
```

`version` returns the version and resolved runtime path as JSON. The installer
also reports the version it installed. Update executable helpers from the
published release with the trusted installer; new guidance cannot upgrade code.
Release ZIP checksums and validation notes are on the release page. Keep earlier
runtimes for saved work; reinstall a prior release to return new work to it.

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

## Add custom images

Ask for the visual as part of your deck request:

```text
/harness-slides Add a custom image of a modern cloud platform to slide 4.
Leave room for the headline and use our brand colors.
```

Images are generated through the Gemini API with your own key, and they cost
money: about five cents for each image at the default size, with no free tier.
Create a key at <https://aistudio.google.com/apikey> and put it in your
environment as `GEMINI_API_KEY` before you start the agent. Never paste the key
into the chat; the agent will not ask for it. The agent tells you how many
images a deck needs and what they will cost before it generates any, and each
image is generated only after you approve it.

Every image in a deck shares one art style, kept as a short `art-style.txt` in
the deck's working folder. Images and their metadata are saved with your deck.
A repeated request returns the saved image instead of paying for another one.

This route was built from Google's documentation and has not yet been verified
against the live API. The earlier route through a signed-in Gemini web session
is still available when you ask for it by name; it needs Chrome and Python 3.11
or newer and uses an unofficial transport. See
[image guidance](references/images.md) for details and
[dependency notices](NOTICE.md) for licensing.

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

The local studio opens scene workspaces and composition projects. Scene objects
support text and geometry edits; composition text edits reflow the source and
preserve attached arrows and groups. Change composition layouts through the agent.
Each save creates a version. Status shows findings and the next review step;
restoring a version requires fresh review. Its browser preview approximates the final layout. Review the actual
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

## Guidance updates

The installer registers a small local entrypoint. For new work, it quietly checks
this public repository’s `main`, saves an exact guidance revision, and returns
only paths and status. The agent reads the entry and relevant references, not
the whole library. Git and network access are needed for first/new-task refreshes;
no GitHub account is required.

Existing decks or research reports keep their saved task and runtime. Resuming
uses that pin without fetching. Explicitly adopting newer guidance starts a new
task and requires rechecking affected reviews. A failed fetch is reported; it is
never described as current.

If the installed helpers are older than current guidance needs, new work uses the
last guidance they support and the agent tells you an update is available. If no
earlier guidance fits, the task is refused until you update.

**Instructions update automatically; executable helpers do not.** Rerun the trusted
shell installer from a current repository copy to update helpers or the entrypoint.
Guidance snapshots contain no executable scripts. The installed helper supports
`start`, `resume`, `cached`, and `pin` through `scripts/sync-guidance.mjs --help`.


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

Run `npm ci --ignore-scripts` and `npm run test:setup` before `npm test`; setup
installs pinned Pillow in an isolated Python environment. `npm test` checks the
engine, preservation, Google fixtures, installer and studio APIs, and reports
optional native checks as skipped. `npm run test:native` requires Chromium
(`npx playwright install chromium`), LibreOffice, Poppler and exact Arial fonts;
it enables browser/render/font checks. GitHub Actions has separate core and native
jobs. `npm run docs:check` checks local Markdown links. `doctor --format pptx`
or `--format google-slides` reports route requirements and configured tool paths.
`npm run ci:local` uses the shared Tart/macOS suite with a disposable
clone, real browser interaction, and LibreOffice rendering. Tests require no
live Google or model account. See [verification](docs/verification.md) for recorded
results and limits, and the [implementation plan](docs/implementation-plan.md)
for architecture and provenance.

<details>
<summary>Instruction context usage</summary>

The skill loads only guidance for the selected task, output format, and optional
brand. These counts cover routed instructions and the stated helper-result samples.
Source documents, image pixels and other tool responses add separately.

<!-- CONTEXT-USAGE:START -->
Measured with `cl100k_base`; cumulative instruction counts, including a normalized
representative guidance-start response. Bootstrap activation is shown separately.

| Reading path | Tokens |
| --- | ---: |
| Discovery metadata | 39 |
| Installed bootstrap | 412 |
| Bootstrap + current guidance entry | 1,543 |
| Scoped PPTX edit + final review | 3,326 |
| Scoped Google edit + final review | 3,913 |
| New PPTX deck from native template + review | 7,476 |
| New Google deck from native template + review | 8,503 |
| Draft stage only: outline + contract | 4,807 |
| New composed deck: draft, then build | 12,506 |
| Parallel build, lead | 11,275 |
| Parallel build, each worker | 9,571 |
| New PPTX scene + contract + review | 6,623 |
| New Google scene + contract + review | 7,762 |
| Content-led PPTX + selected component + review | 8,630 |
| Font screening + structured critique + review | 3,758 |
| Optional image guidance + download result | 2,952 |

Intake, workspace, brand integration and image guidance load only when needed. Native-template
authoring skips the scene contract; scene routes include its actual helper output.
Only the selected delivery format enters context. Brand contracts, source content,
image pixels, other helper results and conversation add separately. The image route
includes one normalized compact download result; it adds no provider code or logs. The JSON report
also exposes direct-handoff paths without the standalone bootstrap/start response.
<!-- CONTEXT-USAGE:END -->

See the [image implementation and before/after measurement](docs/measurements/2026-10-07-gemini-images.md).

Run `npm run context:update` after changing guidance and `npm run context:check`
to check the recorded counts.

</details>
