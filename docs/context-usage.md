# Instruction context usage

Harness Slides loads guidance for the selected task, output format and optional
brand. These counts cover routed instructions and representative helper results.
Source material, image pixels and conversation add separately.

<!-- CONTEXT-USAGE:START -->
Measured with `cl100k_base`; cumulative instruction counts, including a normalized
representative guidance-start response. Bootstrap activation is shown separately.

| Reading path | Tokens |
| --- | ---: |
| Discovery metadata | 39 |
| Installed bootstrap | 491 |
| Bootstrap + current guidance entry | 1,781 |
| Scoped PPTX edit + final review | 4,522 |
| Scoped Google edit + final review | 4,538 |
| New PPTX deck from native template + review | 8,146 |
| New Google deck from native template + review | 9,173 |
| Draft stage only: outline + contract | 5,620 |
| New composed deck: draft, then build | 15,588 |
| Parallel build, lead | 13,831 |
| Parallel build, each worker | 12,070 |
| Recreate a source: intake, build + review | 12,711 |
| New PPTX scene + contract + review | 7,330 |
| New Google scene + contract + review | 8,469 |
| Content-led PPTX + selected component + review | 9,350 |
| Font screening + structured critique + review | 4,415 |
| Optional image guidance + download result | 3,190 |

Intake, workspace, brand integration and image guidance load only when needed. Native-template
authoring skips the scene contract; scene routes include its actual helper output.
Only the selected delivery format enters context. Brand contracts, source content,
image pixels, other helper results and conversation add separately. The image route
includes one normalized compact download result; it adds no provider code or logs. The JSON report
also exposes direct-handoff paths without the standalone bootstrap/start response.
<!-- CONTEXT-USAGE:END -->

Run `npm run context:update` after changing guidance, and `npm run context:check`
to verify this report. See the [image measurement](measurements/2026-10-07-gemini-images.md)
for an example of how optional guidance is measured.
