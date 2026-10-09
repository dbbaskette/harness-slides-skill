# Harness Slides: design quality review

October 9, 2026. Reviewed at 0.10.1 (`cfe8e9e`).

Scope: Harness Slides only. What it does, how, where its design decisions come from at each level, what comparable skills do, and what to change so decks are more artistic, better reasoned and smarter about how to show a concept.

Evidence used:
- The current guidance and code.
- The 25-slide Valkey deck built with 0.10.1.
- A read of ten external slide skills and tools.
- Published guidance on choosing visual forms, colour, icons, Gemini image generation and slide evaluation.

Where a claim comes from a secondary source or was not verified, it says so.

## 1. What it does

Harness Slides turns a brief, source documents or an existing deck into an editable PowerPoint or Google Slides deck. It has no brand of its own; a brand add-on supplies a contract (colours and type by role, template, icon library).

Its distinguishing promise is editability. Titles sit in the template's placeholders, labels live inside shapes, arrows stay attached, cards are groups, and icons are native geometry. Nothing is rasterised.

## 2. How it does it

| Stage | What happens | Who decides |
| --- | --- | --- |
| Intake | Editing freedom, target slides, delivery format | Agent asks the user |
| Design walkthrough | Per-slide proposal in prose; user approves | Agent proposes, user approves |
| Composition | Agent writes a tree per slide: stack, grid, free; box, text, icon, image, spacer; edges | Agent |
| Compile | Positions everything in the content area, measures text with the brand font, refuses what does not fit | Code |
| Emit | Writes slides into a copy of the brand template | Code |
| Preview | Imports to Drive, exports Google's render, returns PNGs and screening findings | Code |
| Look and fix | Agent opens each image and revises | Agent |
| Critique and review | Structured per-slide critique, then the user sees rendered output | Agent, then user |

The code guarantees fit, brand roles and editability. It makes no visual decision. Every choice about what a slide should look like is made by the agent from about 1,070 words of design prose.

## 3. Where it stands

The Valkey deck shows both the gain and the ceiling.

**What improved.** Twelve of nineteen content slides show a relationship (hub, flows, a branch, a decision, a fan-in) where the earlier deck had columns of text.

**What it still looks like.** Grey rectangles, three flat colours, identical blue icon chips, large empty lower thirds, and every content slide built on the same heading-plus-panel skeleton. It is clear and correct. It is not artistic.

The reasons are structural:

1. **No deck-level art direction.** Nothing is decided once for the whole deck: no focal colour rule, no motif, no rhythm. Each slide is designed alone.
2. **The "how do I show this?" decision is prose, not a procedure.** `design.md` lists options in a table and says they are "not a fixed menu". There is no step that classifies the content and derives a form.
3. **The vocabulary is small.** The compiler can draw filled shapes, text, icons, images and straight arrows. It cannot draw an outline, a tint, a big number, a badge, a divider, a bent arrow, a ring, or text over an image.
4. **Colour has roles but no jobs.** A slide may use up to three fills. Nothing says which one is the emphasis, or that purple must mean the same thing on slide 9 as on slide 13.
5. **The author reviews their own work.** The agent that built the slide opens the image and judges it. The screens catch mechanics, not design.
6. **Artwork is bolted on.** Generation works through an unofficial cookie route, each image is briefed from scratch, and nothing ties one image's style to the next.

## 4. Level by level

Each level lists what exists today, what comparable skills do, and what to change.

### 4.1 Brief

**Today.** Intake settles editing freedom and format. Live versus reading delivery is in the brand contract, not asked.

**Elsewhere.** frontend-slides asks purpose, length and density in one batch. PPT Master confirms a "communication contract" and separates how the deck argues (pyramid, narrative, instructional, showcase, briefing) from how it looks.

**Change.**
- Ask three things up front: who is in the room, live or read-ahead, and what they should do afterwards.
- Record an argument mode for the deck. It changes slide count, density and how titles are written.

### 4.2 Story

**Today.** "Prefer a short claim title." Not checked.

**Elsewhere.** baoyu and PPT Master require narrative headlines and ban a content-free closing slide. The assertion-evidence literature reports better comprehension and recall for sentence headlines with visual evidence than for topic titles with bullets (Garner and Alley, 2013).

**Change.**
- Require every content title to be a sentence with a verb. Screen for bare noun phrases.
- Add a title read-through check: the titles alone, in order, should give the argument.
- Require the closing slide to carry a takeaway or next step.

### 4.3 Deck-level art direction (missing today)

**Elsewhere.** This is the most consistent pattern across the stronger skills. Anthropic's skill, slides-grab, baoyu, PPT Master and guizang all commit a deck-wide system before any slide is drawn: one dominant colour, one accent, one motif, a rhythm.

**Change.** Add a `direction` block to the composition, written once:

| Field | Meaning |
| --- | --- |
| `focal` | The one colour role that means "look here" |
| `meanings` | Colour role to meaning for the whole deck, such as Jade for Valkey and Steel Purple for Redis |
| `neutral` | The panel colour |
| `motif` | One recurring device, with its job stated |
| `rhythm` | Each slide tagged anchor, dense or breathing |

The compiler and preview then enforce it: at most one focal element per slide, a category colour never used for a second meaning, and no run of four dense slides.

### 4.4 How to show the concept (the core gap)

**Today.** A table of options and a paragraph of cautions.

**Elsewhere.** PPT Master has the most direct answer found. Each slide records a Relationships line naming its units and the relation between them: order, link, parent, membership, contrast, overlap or none. A yes/no then decides whether geometry must carry that relation. A second rule separates forms: if values set the geometry it is a chart, if rows and columns are the model it is a table, if sequence or hierarchy sets the form it is a structure.

The older frameworks reduce to the same chain: state the message, classify the relationship, pick the form (Zelazny for data, Roam and Duarte for concepts, Berinato for concept versus data).

**Change.** Replace the options table with a short procedure, recorded per slide as a light `intent`:

1. **Claim.** The title sentence.
2. **Units.** What are the things on this slide, and how many are there really? Counts come from the content, never from a layout's slots.
3. **Relation.** One of: order, dependency, hierarchy, membership, contrast, overlap, quantity, none.
4. **Form**, derived from the relation:

| Relation | Form |
| --- | --- |
| Order | Flow or timeline with edges |
| Dependency | Nodes and edges, hub or fan |
| Hierarchy | Tree or layers |
| Membership | Containers with members inside |
| Contrast | Aligned pair or matrix |
| Overlap | Intersecting regions |
| Quantity | Chart, or one large number with context |
| None | Text, quote or image |

5. **Focal.** Which single node carries the claim. The compiler gives it the focal colour.

Then check it: a relation other than "none" with nothing drawn is an error, not a notice.

### 4.5 Composition vocabulary

**Today.** Seven shapes, flat fills, straight arrows, one text style per box.

**Change, in order of visual payoff:**

| Addition | Why |
| --- | --- |
| Tints of brand roles (for example Sapphire at 15%) | Depth and grouping without new hues |
| Outlines (stroke without fill) | Lighter secondary elements; ends the wall of grey |
| A `metric` leaf: one large number with a caption | The strongest device for quantity; absent today |
| Numbered badges and dividers | Order and separation without boxes |
| Bent and curved connectors, and a ring container | Cycles, feedback loops, cleaner fan-ins |
| An overlay container: image, scrim, text | Covers and concept slides with artwork |
| Emphasis inside text (one bold phrase) | Signalling within a sentence |
| Tables and charts as leaves | Still routed to the old components |

### 4.6 Colour

**Today.** Brand roles only, at most three fills per slide, contrast checked against the card.

**Elsewhere.** Anthropic: one colour carries 60 to 70 percent of the weight, one or two support it, one is the accent. Knaflic: make everything grey, then colour the one thing the title is about. guizang refuses colours outside its curated themes.

**Change.**
- Default every element to neutral. Colour is added for a reason: focal, category, or state.
- One focal element per slide, enforced.
- Deck-wide colour meanings, enforced (4.3).
- Never encode meaning by colour alone; require a label. A greyscale render is a cheap check.

The Valkey deck broke the meaning rule once: the three "outcomes" chevrons used Sapphire, Jade and Purple for decoration, then Jade and Purple meant Valkey and Redis two slides later.

### 4.7 Icons

**Today.** 859 library icons placed as native geometry, in the library's own colours. No rules on when.

**Elsewhere.** Nielsen Norman Group: always pair an icon with a label, and if no fitting icon comes to mind in about five seconds, do not use one. PPT Master: one icon library and one stroke weight per deck, and icons are a "compact category cue", not filler. Paper2Slides does the opposite (icons per paragraph to fill space), which is the mistake to avoid.

**Change.**
- An icon needs a job: category marker, step marker, or scan aid in a parallel list. No job, no icon.
- Screen: every icon has adjacent text; icons in a group are the same size; one icon means one thing across the deck.
- Recolour by role, with an inverse variant for filled cards. Today an icon vanishes on a card of its own colour.

### 4.8 Artwork with Gemini

**Today.** An unofficial cookie-based worker (AGPL), one image per brief, each brief written from scratch, sidecar provenance kept.

**Current Google line-up.** Per Google's image generation page as fetched on October 9, 2026 by the research pass: the recommended default is `gemini-nano-banana-2.1`, a Pro model (`gemini-3-pro-image`) offers dedicated style-reference slots, and Imagen is shut down in the Gemini API. These names post-date my own knowledge and should be confirmed against the live page before coding to them.

**Elsewhere.**
- baoyu writes one style block and copies it verbatim into every image prompt, describing fonts by appearance.
- PPT Master decides a source per image (provided, web, generated, none), never generates a named real product, place or person, and does not let a missing key change whether an image is planned.
- Google's own guidance: write a narrative brief, not keywords; state the image's purpose; ask for a single subject in a named corner against a large plain area when text will sit over it.

**Change.**
- Add an official-API provider, selected by an API key. Keep the cookie route opt-in.
- Add an `art-style` file per deck: palette as hex, medium, lighting, composition habits, exclusions. It is prepended verbatim to every brief.
- Chain the first approved image as a style reference for the rest.
- Always "no text in the image". Text stays native.
- Restrict placement: cover, section breaks, one concept-metaphor per idea slide, and backgrounds with a scrim that keeps text at 4.5:1. Never data, technical diagrams, logos, or anything presented as a real screenshot.
- Each image passes a job test before generation: what does it make easier to understand or feel?

### 4.9 Render and critique

**Today.** Preview returns images and mechanical findings. The authoring agent judges its own slide.

**Elsewhere.**
- Anthropic recommends a fresh subagent for visual review and a single fix pass.
- slides-grab runs two independent critics on fresh renders (one for system integrity, one for audience impact), grades findings Critical to Note, and blocks export on Critical.
- PPT Master adds a don't-touch list (brand tokens, content), caps soft fixes at two per pass, and rolls back a fix that causes a new hard failure.
- Published evaluations agree that asking a model to "rate this slide" is weak and that explicit flaw checklists work better (SlideAudit; PresentBench, the latter from a summary only).

**Change.**
- Add an independent critic step: a separate agent sees only the PNG and the title, and answers a fixed list of yes/no questions.

| Question |
| --- |
| After three seconds, what is the main point? Does it match the title? |
| Where does the eye land first? Is that the focal element? |
| Is there exactly one emphasis? |
| Does every element support the title? |
| Is each label next to what it names? |
| Is the space balanced, or is a region stranded or crowded? |
| Is this slide consistent with its neighbours? |
| Is any image or icon decorative? |

- Grade findings and stop after one fix pass.
- Add a contact sheet of the whole deck for a rhythm and repetition check.
- Keep geometry checks in code; vision models are weak at pixel-accurate judgments (VLM-SlideEval, from a summary only).

### 4.10 Approval

**Today.** The user approves a prose description of each slide.

**Elsewhere.** frontend-slides and slides-grab show rendered previews instead of asking questions: three single-slide directions, one safe, one bold, one wildcard.

**Change.** With a five-second preview loop, render one pivotal slide in two or three directions and let the user pick. Approve the outline in prose; approve the look by seeing it.

### 4.11 The guidance itself

**Today.** `design.md` is dense, hedged prose. An agent can satisfy every sentence and still produce grey boxes.

**Change.**
- Rewrite as a procedure (4.4) plus a short list of defaults and a short list of bans.
- Add a gallery of six to ten rendered examples of good composed slides, with their compositions. Examples teach form faster than rules.
- Bans, adapted for a branded template: equal-weight card rows as the default answer; icon-and-blurb grids; centred body text; label titles; filler icons; a close with no takeaway.

## 5. What to borrow, and from where

| Idea | Source | Fits at |
| --- | --- | --- |
| Relationships line and geometry decision | PPT Master | 4.4 |
| Argument mode separate from visual style, style separate from palette | PPT Master | 4.1, 4.3 |
| Rhythm tags and run check | PPT Master, guizang | 4.3 |
| Deck-wide system before slide one | Anthropic, slides-grab, baoyu | 4.3 |
| Verbatim style block for every image | baoyu | 4.8 |
| Per-image source decision; real subjects never generated | PPT Master | 4.8 |
| Dual critics with severity gating | slides-grab | 4.9 |
| Don't-touch list, fix caps, rollback | PPT Master | 4.9 |
| Fresh-eyes reviewer, single fix pass | Anthropic | 4.9 |
| Three rendered directions instead of questions | frontend-slides | 4.10 |
| Measured overflow with a graded fix ladder | guizang | Compile errors |
| Contact sheet and intentional-overlap markers | OpenAI slides skill | 4.9 |

Two cautions:
- **Licences.** `NOTICE.md` already records that Anthropic's skill is service-licensed and not incorporated. Borrow ideas, not text, and check each project's licence before reusing wording or assets.
- **Do not borrow** whole-slide generated images (baoyu, Paper2Slides, and reportedly NotebookLM). They look distinctive and cannot be edited, which is the one thing this skill exists to protect.

## 6. Recommended order

| Step | Work | Why first |
| --- | --- | --- |
| 1 | Deck `direction` block and per-slide `intent` (claim, relation, focal), with enforcement | Fixes reasoning and colour discipline together; mostly validation code |
| 2 | Tints, outlines, `metric`, badges | Biggest visual lift for the least code |
| 3 | Independent checklist critic and contact sheet | Stops the author marking their own work |
| 4 | Official Gemini provider, `art-style` block, overlay container | Brings artwork in properly |
| 5 | Rendered direction previews for approval | Better decisions earlier |
| 6 | Rewrite `design.md` as a procedure with a gallery | Locks the behaviour in |
| 7 | Icon recolouring and icon screens; connectors and ring; tables and charts | Rounds out the vocabulary |

Step 1 changes what the agent decides. Steps 2 and 4 change what it can draw. Step 3 changes who judges. A deck will not look designed until all three move.

## 7. Limits of this review

- External skills were read from their repositories; none was run. PPT Master's documents are dense and I did not test whether an agent can follow them.
- PPTAgent, DeepPresenter and AutoPresent were read at abstract and README level.
- Several book frameworks (Zelazny, Roam, Duarte, Berinato, Minto) come from secondary summaries.
- The Google model names and parameters were read by a research pass from Google's page dated October 9, 2026 and not independently confirmed.
- The judgment that the Valkey deck is "clear but not artistic" is mine, from the rendered slides.
