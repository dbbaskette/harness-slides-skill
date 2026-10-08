# Optional custom images

Load only for custom raster images or `/harness-slides setup images`. Run helpers
from the returned runtime. Users describe the visual; the agent handles commands.
Use icons, editable shapes and diagrams where they convey the slide's content.
Choose a generated image only when it serves that individual slide. Keep labels,
claims and diagram relationships editable in the deck.

## Setup and readiness

```sh
node scripts/harness-slides.mjs images status
node scripts/harness-slides.mjs setup images
node scripts/harness-slides.mjs images check
```

`status` is offline: configured does not prove current authentication. Setup
installs optional dependencies in a private runtime and opens a dedicated Chrome
profile. Tell the user to sign in to Google and **Quit the dedicated Chrome instance (Cmd+Q on Mac)**;
closing its last window may leave Chrome running and will not save the session. It verifies
Gemini and saves required cookies privately. No service, port, bridge install or
API key is needed. Google Cloud CLI credentials do not replace Gemini cookies.
Setup requires macOS/Linux, Chrome, Python 3.11+ and network access. Resolve local
prerequisites within the existing authorization. The agent must not silently
sign in to an account or spend quota without the user's authorized image work.
The unofficial transport can change; report a live check failure accurately.

## Generate, place and review

Write a brief file specifying subject, intended slide role, aspect ratio,
composition, negative space, visual treatment and brand constraints. Ask for one
original image, avoiding slide text baked into pixels. Reference images must be
authorized local PNG/JPEG/WebP files (maximum five).

```sh
node scripts/harness-slides.mjs images generate --project ./deck-work \
  --id deck-slide-04-v1 --prompt-file ./deck-work/image-brief.txt \
  --output assets/slide-04.png
```

Optional: repeat `--reference PATH` for references; `--model NAME` selects an
exact available model. Omission uses Google's account default, recorded as
`account-default`. `images check` lists account-reported availability, not an
image-capability guarantee. Request one image per operation.

The result contains a local PNG path, actual dimensions, SHA-256 and metadata
path. The sidecar records provider, library pin, model selection, timestamp and
brief/reference hashes. No raw prompt, cookies or authenticated URLs enter it.
Inspect the image, place it with deliberate crop/fit and alt text, then review
the native slide. A downloaded asset is not a reviewed slide. For Google native
image insertion, use the selected Google delivery path's authorized asset
transport; private local files are not publicly accessible URLs.

## Recover without duplicate generation

```sh
node scripts/harness-slides.mjs images download --project ./deck-work \
  --id deck-slide-04-v1
```

Keep the same ID and brief when repeating a request. Successful repeats return
the existing asset; failed downloads retain a private generation receipt.
`download` needs no brief or references and never sends a generation prompt.
Changed briefs cannot reuse an ID. An interrupted/uncertain send is never
replayed: check Gemini history and obtain an explicit new-image request before
choosing a new ID. A rejected web image is not substituted for a generated one.

State, Chrome profile, cookies and receipts live in `~/.harness-slides-images`,
outside the deck. Operations lock that session; a busy result means wait. A new
saved sign-in session can invalidate older receipts. Never read private state
into context, commit it, or print provider logs. Runtime scripts and dependencies
stay on disk. Return the compact helper result and relevant limitations.

Diagnostics importing worker code must run Python with `-I -B`; environment
bytecode flags alone are ignored by isolated Python. Do not create caches in the
immutable installed runtime or exclude unexpected files from its integrity check.
Setup keeps a separate profile, bounds its owned browser wait and preserves
existing saved credentials when verification fails. Never quit unrelated Chrome
processes or replace profiles as a routine retry.
