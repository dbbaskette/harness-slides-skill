# Versioned releases

GitHub Releases and immutable `v<package-version>` tags identify supported runtime
code. The release ZIP contains the exact tagged source and installer; its SHA-256
file detects download corruption. Dependencies are resolved from the lockfile,
not bundled account state. The ZIP includes no node_modules, cookies or task data.

Runtime and guidance have separate identities. New tasks fetch current public
instructions and enforce `guidance/manifest.json` compatibility. Starting,
resuming or explicitly using cached guidance reports the actual runtime version
and executable digest. Resumed tasks retain their saved runtime rather than
silently adopting the current installation pointer. A version label alone does
not prove byte identity; the installed content digest and task runtime hashes
identify retained code. A failed compatibility check names both versions.

A runtime older than current guidance needs is not refused outright.
`guidance/compatibility.json` lists, for each earlier minimum, the last `main`
commit whose guidance needed only that minimum. A new task takes the newest
entry the installed runtime satisfies, uses that commit's guidance, and reports
that older guidance is in use, naming the installed version and the version
current guidance needs. The commit must be an ancestor of the fetched `main` and
its own manifest must accept the runtime. With no entry that fits, or an index
that is missing or invalid, the task is refused as before. A task pinned to a
revision is never moved to older guidance. Runtimes up to 0.12.0 predate this and
are still refused.

Users see “Using Harness Slides v0.13.0”. `--version` is an offline human-readable
check; `version` returns `package`, `runtimeVersion` and resolved `runtime` as
JSON. Run it from the returned runtime. This does not authenticate Google or
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
7. Create the release at the explicit verified commit with its ZIP/checksum and
   concise changes, validation and known limitations. Inspect the published tag,
   target commit and asset metadata; download the asset and verify its checksum.

Install/update from the selected release using its trusted shell installer.
Earlier immutable runtime directories remain available to saved work. To return
new work to a prior version, reinstall that release; guidance compatibility still
applies. Do not delete active/saved runtimes or alter authenticated image sessions
as a release/update side effect. Publication is authorized by the user's release
request; there is no new account setup or service lifecycle action.
