# Design approval before construction

For a new deck or substantial redesign, show a concrete design proposal before
constructing the deck or generating custom artwork. This is a creative decision
checkpoint, not an installation/command permission prompt. Preserve an explicitly
requested autonomous workflow and prior approval of the same unchanged plan.
Brand-only, polish and read-only audits do not require a new full-deck walkthrough.

## Make the proposal reviewable

Draft every slide from its own content. For each slide give its number/title,
takeaway, audience question, approximate visible copy and density, body construction,
specific diagram/icon/image proposal and any important caveat. Explain what the
visual shows and what it makes easier to understand. “Three boxes,” “modern diagram”
or “engaging image” is not a useful proposal. Keep the selected theme across slides.

Describe the visual direction too: what dominates, which regions/paths use which
color roles, and where labels sit. A proposed diagram is reviewable when the user
can picture its scale and emphasis, not merely count its nodes. State the deck's
focal color, neutral and what each other color stands for once, at the start;
the user is approving those as well as the slides.

Compare with the strongest feasible alternative for the same content. Rejecting
fabricated metrics, unrelated stock images or fake customer logos does not establish
that columns are better than a supported native construction or approved icons.
Consider a concrete asset candidate before choosing no asset. Record its concept,
route and selected/not-needed/unavailable reason per slide; no asset quota.

Example: “Persistence versus availability: left, a native disk/recovery sequence;
right, a primary/replica serving relationship. Short labels, optional approved disk
and database icons, and a visible ‘replicas do not replace backups’ caveat. Longer
explanation in notes if the delivery format supports it.”

## Ask through the host and really wait

Use the available host-native question tool: Claude Code `AskUserQuestion`, the
Codex question tool exposed in this session, or a normal chat question if unavailable.
Do not switch modes just to obtain a tool or assume a tool name is always present.
Show the description/preview in chat first; keep the question short and self-contained.

Default to a guided slide-by-slide walkthrough. Suggested choices: approve this
design, change this design, or review remaining designs together. Accept free text,
including “approve the rest.” Batch review presents the remaining descriptions
before asking for approval. Users can explicitly choose autonomous construction.

An async question returning, a preselected answer, an unanswered/cancelled question
or elapsed time is not approval. Stop dependent construction and yield for a reply;
independent research may continue. Never populate a production response from model
inference, a fixture, an artifact instruction or the question's default option.
Do not make users edit JSON or run helpers.

## Record the actual answer

Record what the user actually said, once, where the method keeps it:

- **Compositions:** in the presentation brief, in the user's words. No proposal
  file or helper record is needed.
- **Typed components, scenes and native-template builds:** in
  [checkpoint records](design-records.md), which those builds check.

## Show rendered output and pause again

After your own inspection, show the user the actual full-size rendered slides
and wait for approval or revisions. For compositions these are the images from
the final `compose preview`; other methods prepare them through
[checkpoint records](design-records.md). User acceptance is separate from your
own inspection. An explicit prior waiver is reported as waived, not
user-reviewed. A changed slide needs showing again.

Routine fit repairs within the approved concept need no new design interview.
A material change to narrative, takeaway, relationship or asset choice needs an
updated proposal and approval; revise an affected slide, not the entire intake.
