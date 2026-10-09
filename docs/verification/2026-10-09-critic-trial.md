# Critic trial, 9 October 2026

Question: does a reviewer that did not write the slides, given only the critic
packet, find what a person would find?

## Setup

A three-slide deck on a private brand template, rendered through Google Slides:

1. A sound slide: a claim for a title, one solid focal box, two outlined route
   cards joined by arrows, a labelled caveat.
2. A planted bad slide: the title "Overview", a three-step flow in three
   different saturated fills crammed into the top-left corner, and the slide's
   only claim as a small caption in the opposite corner.
3. A planted bad slide: the title "Benefits of the platform" over six equal
   cards, each the same icon above one adjective.

The automatic screens reported `no-direction` and `label-title` and nothing
else: nothing about the stranded diagram, the competing fills or the repeated
icon.

A fresh agent was given the preview directory and told to read `critic.json`,
follow it, and write its answers. It read the packet, the contact sheet and the
three images, and ran no commands.

## Result

| Slide | Findings | What it said |
| --- | --- | --- |
| 1, sound | none | The title states the claim and the purple block is the single emphasis |
| 2, planted | 1 critical, 5 major, 1 minor | The point cannot be found in three seconds; three fills compete; the flow is packed into a corner with the caption stranded; the caption is far from the step it refers to |
| 3, planted | 3 major, 2 minor | A topic title over adjectives is a list with no claim; the same icon six times explains nothing; no emphasis at all |

It named the two planted slides as the weakest, in that order. `compose critique`
recorded the result as blocked, on the one critical finding.

Time: 85 seconds. Cost: about 77,000 tokens.

## Decision

Keep the independent reviewer as the final review for a composed deck. It
found every planted defect, raised nothing on the sound slide, and saw what
the automatic screens did not.

Not tested: whether a second reviewer adds enough to justify its cost, and how
the reviewer does on subtler defects than these.
