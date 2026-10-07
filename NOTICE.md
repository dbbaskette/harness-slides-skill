# Sources and reuse

The generic transport, revision-bound rendering/review and native OOXML/icon
helpers were extracted from Dan Baskette's tanzu-brand project with its owner's
authorization. Brand assets, templates and policy are not included.

PptxGenJS (Brent Ely) and pptx-automizer (Simon Singer) are MIT runtime
dependencies; their installed packages retain their own notices. image-size is
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
