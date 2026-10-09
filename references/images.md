# Optional custom images

Load only for custom raster images or image setup. Prefer icons, editable shapes
and diagrams; generate an image only when it serves that slide, and keep labels
and claims editable.

Images come from the Gemini API, model `gemini-nano-banana-2.1`. **This provider
is unverified:** built from Google's documentation and tested against stubs, never
the live API. Treat the first `check` and `generate` with a real key as a trial and
report exactly what they return.

## Key and cost

`images status` is offline and says whether a key is set. If none is, tell the user:

1. Open <https://aistudio.google.com/apikey> and choose **Create API key**.
2. Put it in the environment as `GEMINI_API_KEY`. (`GOOGLE_API_KEY` also works and wins if both are set.)
3. Run `images check`: one unbilled request that confirms the key and model, not billing.

The key is a password. Never ask for it in chat, read it, print it or write it to
a file. It belongs to a Google Cloud project, which carries the billing; a work
account may not be allowed to create one.

**Images cost money.** There is no free tier: about $0.05 per 2K image at October
2026 list prices. Put the image count and cost in the plan the user approves, and
generate only the image approved in [the walkthrough](design-walkthrough.md).

## Style and brief

Every image in a deck shares one style. Write it once as `art-style.txt` in the
project: a few lines naming medium, palette words, lighting and what to avoid. It
is sent verbatim before every brief. Agree it with the user, then leave it
unchanged. Pass the first approved image as `--reference` to later ones.

The brief file describes one image: subject, role on the slide, composition and
where empty space must fall. Describe the scene wanted, not a list of exclusions.
No slide text in the image; no style words in the brief.

```sh
node scripts/harness-slides.mjs images generate --project ./deck-work \
  --id deck-slide-04-v1 --prompt-file ./deck-work/slide-04-brief.txt \
  --output assets/slide-04.png --design-project CONTENT --slide APPROVED_SLIDE_ID
```

Options: `--aspect` (default `16:9`), `--size 1K|2K|4K` (default `2K`), up to five
`--reference` images, `--style PATH`. One call makes one image. Google keeps the
brief and references in the key's project for up to 55 days.

The result gives the saved path, dimensions and a sidecar of hashes, never the
brief or key. Use the returned path: a JPEG answer is saved as `.jpg`. Inspect the
image, place it with deliberate crop and alt text, then review the native slide.

## Repeats and failures

- Same ID and brief: the saved asset is returned; nothing is sent.
- Any change to brief, style, references, size or model needs a new ID and the user's request.
- API error (key, quota, billing, refusal): nothing was generated. Fix the cause; rerun the same ID.
- `generation_uncertain`: Google may have generated and charged. It is never resent. Check AI Studio logs, then ask before using a new ID.
- `download_failed`: the image is held privately. Run `images download` with the same `--project` and `--id`.

Receipts live in `~/.harness-slides-images`; never read them into context or commit them.

The older unofficial Gemini web route stays behind `--provider gemini-web` (first
`setup images --provider gemini-web`). It is never chosen automatically and cannot
apply the art style.
