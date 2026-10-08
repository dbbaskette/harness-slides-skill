# On-demand Gemini Web images: implementation and context cost

Implemented October 7, 2026. The agent entrypoint is
`/harness-slides setup images` (or `$harness-slides` in Codex). Ordinary requests
for a custom slide image route to this capability when needed.

## Operation

Setup installs optional pinned dependencies in a private environment, opens a
Slides-owned Chrome profile for manual Google sign-in, exports only the two
required cookies and checks the authenticated Gemini client. The user closes
that sign-in window. Ordinary image requests use a short-lived Python worker;
there is no daemon, port, HTTP server or Gemini Web Bridge dependency.

A request accepts a brief file and up to five reference images. The worker
requires exactly one `GeneratedImage`, downloads it through the authenticated
library, validates the actual image, normalizes it to PNG and returns its local
path, dimensions, SHA-256 and metadata path. The image and metadata are published
atomically without overwriting existing artwork.

Credentials, browser state and authenticated download receipts live outside the
deck under `~/.harness-slides-images`. A session lock serializes operations. A
durable submission record and audited single-attempt adapter prevent automatic
replay after an uncertain send. Download failure retains the result;
`images download --project DIR --id ID` can recover it without sending a prompt.
Repeated successful requests return the same asset. Brief changes require a new
ID. Receipts are tied to the saved session; switching sign-in can invalidate
older receipts.

Runtime version is now `0.3.0`. Guidance requires that version so older helpers
are not given unsupported image commands. Existing task pins retain their
original runtime. The optional Python worker's AGPL license and upstream
license are explicit in [notices](../../NOTICE.md); other engine code retains
its stated MIT license.

## Measurement

The baseline is the actual working tree immediately before this feature, which
already included per-slide design guidance and existing DNS diagnostics. Counts
use the existing `tools/context-usage.mjs` tool with `cl100k_base`. Both input
digests and route counts are preserved in the
[JSON report](2026-10-07-gemini-images-context.json).

| Increment | Tokens |
| --- | ---: |
| Discovery metadata | 0 |
| Installed bootstrap | 0 |
| Every ordinary task: image routing row | 16 |
| Image guidance, loaded only for image work | 753 |
| One normalized compact download result | 97 |
| Additional image-only load after activation | 850 |

Examples: a scoped PPTX edit/review route grows from 2,456 to 2,472 tokens; a new
PPTX scene/contract/review route grows from 3,539 to 3,555. Using images adds the
conditional 850 tokens to the chosen path. Subsequent images normally reuse the
loaded guidance and add their own results, briefs and image inspection costs.

A standalone image route, including bootstrap, guidance-start response, core
entry, image guidance and one normalized result, is 2,123 tokens. This overlaps
with deck instructions already loaded; it is not an additional 2,123 tokens on
top of an active deck task.

Provider implementation and dependency files are executed from disk and never
loaded as agent instructions. The measurement excludes image pixels/vision,
source material, conversation history and other helper responses. Absolute
path lengths and hash tokenization vary, so the 97-token result is a normalized
sample rather than a guarantee for every response. Setup/model-list responses
are separate from that sample. This measures context input, not generation
latency, Gemini quota or cost.

## Verification boundary

Offline fixtures cover generated-image classification, JPEG/WebP normalization,
reference hashes, exact model selection, repeat/conflicting IDs, uncertain sends,
download recovery across worker instances, metadata recovery, malformed images,
path containment, private permissions, session locking, sanitized responses and
short-lived process completion. Setup fixtures exercise dedicated profile
export and context cleanup. They do not establish real Google sign-in behavior.

The clean macOS gate installs the actual pinned dependencies and checks the
upstream source hashes without opening an account session. It also runs the
full engine/installer/browser/native-rendering suite. Results for the final tree
are recorded in [verification](../verification.md).

Live Google sign-in, account-specific model access and image generation/download
remain an acceptance checkpoint. No live image was requested and no account
quota was consumed by these tests. Linux is supported by the helper interface
but was not validated by the macOS gate.
