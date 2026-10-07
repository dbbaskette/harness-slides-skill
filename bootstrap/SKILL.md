---
name: harness-slides
description: Create, redesign, edit and visually review editable Google Slides or PowerPoint decks from briefs, source documents or existing presentations, with optional brand add-ons.
---

# Harness Slides

This small entrypoint uses current guidance from the public
[harness-slides-skill](https://github.com/dbbaskette/harness-slides-skill) repository.
Run only the locally installed helpers.

## Start or continue

Resolve this installed directory once. For new work, run:

```sh
node "<installed-skill>/scripts/sync-guidance.mjs" start --project "<content-project>"
```

The compact result returns the guidance entry, exact revision, task ID, and
installed runtime. Read that entry, then only the references for this task.
References are relative to the fetched guidance directory; every executable
command uses the returned **runtime**, never the fetched directory. The AI owns
helper JSON and commands; do not require users to run them or repeat settled intake.

Record the returned task ID and runtime with the work. Continue with
`sync-guidance.mjs resume --project "<content-project>" --task <saved-id>`; do not
start a new task merely to resume, inspect status, or revise the same work.
Existing work retains its instructions and runtime. Explicitly adopting new
guidance starts a new task and requires rechecking affected review conclusions.

New tasks check public main. A failed fetch or incompatible runtime is reported,
not described as current. An existing task can resume without fetching. For an
explicitly chosen older task, use `cached` with its saved ID and disclose that
choice. Update executable helpers with the trusted shell installer; guidance
refresh never installs or executes repository scripts.

Honor the user’s scope, sources, editing freedom, and completion boundary.
Research and slide delivery requirements live in the selected guidance.
