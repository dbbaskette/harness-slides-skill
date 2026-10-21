# Development

Normal use happens through the agent. This guide covers working on the skill
and its helper runtime from a source checkout.

## Setup and checks

```sh
npm ci --ignore-scripts
npm run test:setup
npm test
npm run docs:check
npm run context:check
```

`test:setup` installs pinned Pillow in `.harness-slides/test-python`, leaving
system Python unchanged. The test runner uses that environment automatically.
Core tests cover editable output, preservation, Google fixtures, installation,
project history, and studio APIs. Optional native checks are reported as skipped
unless enabled.

For browser, native-rendering and exact-font checks, install Chromium,
LibreOffice, Poppler and Arial fonts, then run:

```sh
npx playwright install chromium
npm run test:native
```

GitHub Actions runs separate core and native jobs. `npm run ci:local` uses the
external macos-test-suite Tart setup with a disposable clone. See
[verification](verification.md) for the tested environments and limitations.
No live Google or model account is needed for these tests; fixtures do not
establish live provider behavior or visual acceptance.

## Helper commands

```sh
node scripts/harness-slides.mjs --help
node scripts/harness-slides.mjs doctor --format pptx
node scripts/harness-slides.mjs doctor --format google-slides
```

The CLI supports authoring, workspace controls, native edits, previews, assets,
and review. Agents prepare the JSON inputs. Commands run from the installed
runtime returned for the task; guidance snapshots contain instructions only.

- [Workspace and composition projects](../references/workspace.md)
- [Composition authoring](../references/compositions.md)
- [Other authoring methods](../references/authoring.md)
- [Native PowerPoint editing](../references/editing.md)
- [Runtime capabilities and integration contract](specs/2026-10-14-design-integration-contract.md)
- [Architecture and provenance](implementation-plan.md)

## Documentation and releases

Keep the README focused on getting started. Put detailed workflow instructions
in `references/` and maintainer records in `docs/`. After changing guidance, run
`npm run context:update` to refresh [context measurements](context-usage.md),
then check local links with `npm run docs:check`.

[Release procedures](releases.md) explain runtime versions, compatible guidance,
checksums, updates, and rollback. The development runtime is 0.16.0; the current
published release remains 0.14.1.
