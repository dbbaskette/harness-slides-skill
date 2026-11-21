# Versioned releases

The current published release is [0.17.0](releases/v0.17.0.md). [0.18.0](releases/v0.18.0.md) and [0.19.0](releases/v0.19.0.md) are merged and not yet published as GitHub Releases.

GitHub Releases and immutable `v<package-version>` tags identify supported runtime
code. The release ZIP contains the exact tagged source and installer; its SHA-256
file detects download corruption. Dependencies are resolved from the lockfile,
not bundled account state. The ZIP includes no node_modules, cookies or task data.

Runtime and guidance have separate identities. New tasks fetch current public
instructions and enforce `guidance/manifest.json` compatibility. A task keeps
its guidance snapshot and nothing of the runtime: starting, resuming or
explicitly using cached guidance returns the runtime installed now, with its
version and executable digest. The returned `runtime` is the installed pointer,
`<shared>/current`, never a version folder, so the same path works after every
update. A task records the version it started on for information only. When
the installed version differs, `resume` and `cached` add `startedRuntimeVersion`
and a one-line `notice`, and the work continues; a pin written before 0.19.0,
which named a version folder and a hash of every runtime file, resumes the same
way with no migration. A version label alone does not prove byte identity; the
returned digest identifies the installed code and changes with every update, so
do not compare it with one saved earlier.

Resume keeps the task's saved instructions rather than fetching again: work in
progress keeps stable instructions and needs no network, and older guidance on a
newer runtime is what `pin` has always allowed. The pin records the minimum
runtime its guidance declared. Only when that is newer than the installed
runtime, as after reinstalling an older release, is the task refused, with the
same "update with this skill's trusted installer" message a new task gets. A
failed compatibility check names both versions. Adopting newer guidance for
existing work is explicit: start a new task.

Records the runtime writes into a project do not depend on which version is
installed either. Builds, previews, critiques, reviews, design sessions and the
asset manifest bind content: the scene, images, approvals and the rendered deck.
The neutral design defaults ship inside the runtime, so an unbranded contract
carries its whole design under its revision and is not checked against the
installation; a brand's own sources are checked as before. Native render bundles
are a cache keyed by the runtime code among other things: after an update the
next preview or review draws again instead of reusing pixels the previous code
drew, and what was already previewed, critiqued or reviewed stays valid. A
record in a format this version no longer reads says which command to run
again, for example "preview the whole deck again".

A runtime older than current guidance needs is not refused outright.
`guidance/compatibility.json` lists, for each earlier minimum, the last `main`
commit whose guidance needed only that minimum. A new task takes the newest
entry the installed runtime satisfies, uses that commit's guidance, and reports
that older guidance is in use, naming the installed version and the version
current guidance needs. The commit must be an ancestor of the fetched `main` and
its own manifest must accept the runtime. With no entry that fits, or an index
that is missing or invalid, the task is refused as before. A task pinned to a
guidance revision is never moved to older guidance. Runtimes up to 0.12.0 predate this and
are still refused.

Guidance is fetched into `.harness-slides/guidance/repository.git` inside the
project, but that repository is not a cache: a project can arrive with one someone
else made, and git honours its config, hooks, alternates, replacement refs and
grafts. Each `start` and `pin` deletes it and fetches into a fresh one, with git's
system and global config ignored, so only the trusted URL decides what is read.

Users see “Using Harness Slides v0.17.0”. `--version` is an offline human-readable
check; `version` returns `package`, `runtimeVersion`, the stable `runtime`
address and `capabilities` as JSON, and `doctor` reports the same address and
version. Run them from the returned runtime. `capabilities` names the
features a caller can rely on, as listed in the
[integration contract](specs/2026-10-14-design-integration-contract.md#detecting-support);
a release that adds a feature adds its name there and in
`scripts/lib/runtime-version.mjs`. This does not authenticate Google or
query releases. The existing `workspace restore --version v000001` remains a
workspace history selector.

## Cut a release

1. Update package/lockfile versions and minimum guidance runtime where required.
   Describe changes and update installation examples to the selected release.
2. If this release raises `minimumRuntime`, add the old minimum to
   `guidance/compatibility.json` with the full SHA of the last `main` commit
   that needed only it: the tip of `main` just before this release merges
   (`git rev-parse origin/main`). Leave the new minimum out. Its last commit is
   not known until the minimum is raised again, so it gets its entry in that
   release. `npm test` checks that each named commit is in history and declared
   that minimum.
3. Verify affected scenarios and the full relevant native gate with the project's
   existing Tart wrapper. Brand's combined macOS gate can own shared verification
   when it runs this exact runtime's complete browser/render suite, installer and
   installed example build/review. Keep required remote gates. Retain tested commit/tree,
   logs, installed-runtime report and cleanup result. Reuse unaffected live-deck
   acceptance; version reporting does not require generating another deck.
4. Integrate the verified source by PR. Confirm the merged tree equals the tested
   tree and that the tag is unused. Never move or overwrite a published tag/asset.
5. Package the exact merge commit with Git's archive command, not a mutable work
   directory. For v0.9.0, replacing COMMIT with its verified merge SHA:

   ```sh
   git archive --format=zip --prefix=harness-slides-v0.9.0/ --output /private/tmp/harness-slides-v0.9.0.zip COMMIT
   shasum -a 256 /private/tmp/harness-slides-v0.9.0.zip
   ```

6. Extract into disposable state. Verify package version, compare file hashes
   against the tagged tree, run the archive's installer with disposable home and
   shared paths, and check `--version` and `version` from that installed runtime.
   Install an earlier release into the same disposable paths first, so the check
   covers the update: one folder left under `versions/` and the skill links on
   `current`.
7. Create the release at the explicit verified commit with its ZIP/checksum and
   concise changes, validation and known limitations. Inspect the published tag,
   target commit and asset metadata; download the asset and verify its checksum.

Install/update from the selected release using its trusted shell installer. It
verifies and stages the new version, points `<shared>/current` at it in one
rename, and only then removes every other folder directly inside its own
`versions/` folder; a folder it cannot remove is reported in `keptVersions` and
the install still succeeds. Nothing is removed when the pointer did not move, a
link inside `versions/` is neither followed nor removed, and nothing else under
the shared folder is touched. Skill links (`~/.claude/skills/harness-slides`,
`~/.agents/skills/harness-slides`, `~/.cursor/skills/harness-slides`) point at
`<shared>/current`; one that pointed into this installation's `versions/` is
moved to it, and a link or folder that leads anywhere else is left as it is and
listed in `skipped`. The result's `runtime` is the stable address and
`versionId` names the folder behind it. Engine packages are installed again for
each new version. A command already running from the previous version when it
is removed may fail and can be run again. To return to a prior version,
reinstall that release; guidance compatibility still applies, to saved tasks
too. Do not alter authenticated image sessions as a release/update side effect.
Publication is authorized by the user's release request; there is no new
account setup or service lifecycle action.
