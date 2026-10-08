# Local workspace

Each workspace owns an immutable `inputs/` source copy, `workspace.json`, and
sequential `versions/v000001/` scenes, previews and native build artifacts.
Saving adds a version; it never overwrites an earlier one. Restoring creates a
new version so history and prior artifacts remain available. An interrupted lock
needs inspection, not blind deletion while another process may still be active.

```sh
node scripts/harness-slides.mjs workspace history --project DIR
node scripts/harness-slides.mjs workspace status --project DIR
node scripts/harness-slides.mjs studio --project DIR
```

Open the printed loopback URL. Select an object in the preview, adjust its text
or geometry, and save. The studio uses the existing scene renderer; it does not
embed a model account or require a specific coding harness. The agent can update
the scene using CLI save with the expected digest, while a person uses the studio.
Stale saves are rejected. Brand-only/polish uses native editing; content-preserving
redesign retains the scene's text and slide order. Native builds remain drafts.

The server binds to 127.0.0.1, uses a random workspace URL, checks Host and Origin,
and accepts bounded JSON operations. It does not expose arbitrary file reads or
shell execution. Google apply/upload remains an explicit CLI operation within
authorized scope. The browser's previews approximate native metrics; charts show
their data contract until target rendering is available.

Builds also write quality reports. Compiled workspaces pin the design report
through `workspace init --design-report FILE` and require current structured
critique; follow [quality](quality.md). The repair packet includes targeted
measurements and review questions. A content critique does not replace viewing
native slides.
