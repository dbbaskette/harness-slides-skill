# Sources and reuse

The generic transport, revision-bound rendering/review and native OOXML/icon
helpers were extracted from Dan Baskette's tanzu-brand project with its owner's
authorization. Brand assets, templates and policy are not included.

PptxGenJS (Brent Ely) and pptx-automizer (Thomas Singer and contributors) are MIT runtime
dependencies; Fontkit (Devon Govett and contributors, MIT) provides shaped font
measurements. Their installed packages retain their own notices. Font files are
resolved from the user’s system or explicit paths and are never distributed. image-size is
pinned to a patched release through an override. No third-party skill source was
copied. Source-reviewed ideas informed our original implementation:

- [office-kit/pptx](https://github.com/office-kit/pptx): editable preview workspace.
- [presentation-skill](https://github.com/siril9/presentation-skill): evidence
  coverage, semantic object IDs and guarded edits.
- [agent-slides](https://github.com/mpuig/agent-slides): compact inspections and
  declarative operations.
- [Microsoft CAT](https://github.com/microsoft/cat-agent-skills): template routing.
- [dom-to-pptx](https://github.com/atharva9167j/dom-to-pptx) and
  [mk-present](https://github.com/textboy/mk-present): constrained semantic scenes.
- [OpenAI Google Slides](https://github.com/openai/plugins/tree/main/plugins/google-drive/skills/google-slides): native template/target rendering workflow.

The nexu-io/codex-slides image-generation fork is not part of this implementation.
Anthropic's service-licensed PPTX skill is not incorporated.

## Optional Gemini images

The default image route calls Google's Gemini API directly with Node's built-in
`fetch` (`scripts/lib/gemini-api.mjs`, MIT like the rest of this repository) and
adds no dependency. The earlier Gemini Web route below remains as an explicit
alternative, selected with `--provider gemini-web`.

The on-demand image worker in `scripts/images/worker.py` is licensed under
AGPL-3.0-only; see `scripts/images/LICENSE`. It installs
[HanaokaYuzu/Gemini-API](https://github.com/HanaokaYuzu/Gemini-API) separately at
revision `8c5b1dcbf54ecf093551cc20bd25cef438190ba8`, which carries the GNU Affero
General Public License v3. Its original source and license remain in that
installation; no upstream library source is vendored here. The rest of this
repository retains its stated MIT license. The worker's cookie export and
single-attempt strategy adapt the owner's Gemini Web Bridge implementation.
Pillow (MIT-CMU) and Playwright (Apache-2.0) are optional installed dependencies
with their own notices. These dependencies are installed only by
`setup images --provider gemini-web`.

The neutral conceptual-greenhouse fixture is authorized Gemini-generated art,
not a copied product screenshot or customer evidence. Its sanitized sidecar
records verified dimensions and hashes; no account session data is distributed.
