# Verify actual prompt-led slide quality

Runtime tests prove checkpoint state, revision/hash binding and rejection of
incomplete/boilerplate assessments. They do not prove that a model selects a good
composition or actually examines pixels. Use this field protocol for a candidate
release; do not substitute a hand-constructed component fixture for the trial.

## Fresh-host trials

Run in a fresh Claude Code and Codex conversation using the candidate skill/runtime.
Also exercise a host without a native question tool. Keep generated work private.
Use the installed version report and save the exact guidance revision, runtime
fingerprint, model/host and actual prompt. Use the normal entrypoint, not internal
commands pasted as a user request. Do not give the agent the expected layouts.

Representative basic prompt:

> Make a short technical training deck explaining how saved data, serving
> availability, product packaging and app/service binding affect an architecture
> choice. Use the supplied source brief, selected corporate brand and native
> editable slides. Include one illustrative customer scenario. Explain the
> mechanisms clearly for a live instructor-led session.

Supply a concise source brief with actual actors and supported relationships.
For purely offline demonstrations, label every scenario and claim illustrative.
Do not include private competitive documents or account credentials in public tests.
Do not authorize live model/image quota or publication implicitly for a fixture.

## Required observable events

1. The agent drafts concrete per-slide descriptions. It asks through the available
   question tool or chat and leaves construction/generation pending. Wait without
   answering: no new deck construction should occur.
2. Answer the first design with a meaningful change, such as “show the mechanism
   with labeled nodes instead of paragraphs.” The updated proposal retains that
   feedback. An old question/default answer cannot approve the revised slide.
3. Select batch review or approve the remainder. Only the real answer permits
   construction. In a separate trial explicitly request autonomous construction;
   it must preserve the final review unless you separately waive it.
4. Inspect the actual authored content: distinct recovery and serving relationships,
   visible layers/ownership, meaningful approved asset choices and retained caveats.
   Repeated comparisons and reference slides may legitimately remain text-first.
5. Native-template output gets a structured assessment with actual object/source
   IDs and pixel/text comparison. Inject a missing selected asset or a missing
   rendered heading prefix in a disposable fixture: readiness remains unresolved.
6. The rendered deck is shown and the agent waits for revision/acceptance. Request
   a change; an old render acceptance does not apply to changed output.
7. For an authorized generated-image trial, verify local download/metadata,
   aspect ratio, insertion and pixel inspection. Asset generation is not evidence
   of improved slide quality; captions and factual relationships stay editable.

## Record the evidence honestly

Retain the conversation/tool events, approved proposal, actual answers, native
snapshot/revision, render manifest/hashes, per-slide findings, asset provenance and
final user response. Record observed departures from the approved plan. Give
specific before/after examples, not only layout counts or successful JSON validation.

A fixture pass is a fixture pass. A construction demonstration establishes output
capability, not autonomous behavior. Report real prompt trials as untested until
performed. Do not call source-presence checks OCR or claim they detect missing
pixels automatically. Native/export rendering defects require comparing the
actual images, not merely counting strings in the native API resource.
