# Native import spike

Run October 8, 2026 against Slides `302b8cb`. The base deck was a 36-slide corporate brand template (23 layouts, one master, 23 media parts). `spikes/native-structures.py` added a group of two rounded rectangles joined by an attached connector, plus one custom-geometry shape, to slide 1. The file was imported with `drive import` through `gcloud`.

## Question

Can new slides be built as PPTX and imported into Google Slides without losing native structure, or must they be built directly with the Slides API?

## Route A: build PPTX, import through Drive

Checked by exporting the imported Google deck back to PPTX and comparing slide 1 with the file that went in, and by rendering Google's PDF export.

| Structure | Survived | Evidence |
| --- | --- | --- |
| Group | Yes | One `p:grpSp` before and after, holding the same two shapes and one connector |
| Attached connector | Yes | `a:stCxn` and `a:endCxn` are still present after the round trip, repointed to the shapes' new IDs with the same connection sites (3 and 1) |
| Text in shape | Yes | "Grouped A" and "Grouped B" remain inside their `roundRect` shapes |
| Custom geometry | Yes | Still one `a:custGeom` shape and no pictures; it renders as a filled diamond |
| Placeholders | Yes | Three placeholders on slide 1 before and after |
| Master artwork | Yes | 23 layouts, one master and 23 media parts before and after; logo, gradients and footer render correctly |
| Fonts | Yes | Arial |
| Object names | **No** | Google renames every object (`spike_left` became `Google Shape;176;p25`) |

Not checked: the interactive behaviours in the Google editor (dragging a shape and watching the connector follow, clicking once to select the group). The exported structure says they should work; nobody has tried them by hand.

## Route B: build directly with batchUpdate

Not tested. The Slides API returns HTTP 403 for the `gcloud` OAuth client, so this route is only available through an agent host's Google connector. Route A needs Drive access only.

## Preview timing

| Step | Time |
| --- | --- |
| Drive export of the 36-slide deck to PDF | 3.1 s |
| Poppler render of one slide at 1600 px | 0.2 s |

The import step was not timed separately. Rendering through Drive's PDF export needs neither the Slides API nor LibreOffice; it needs Poppler.

## Decision

**Route A.** Build new slides as PPTX from the brand template and import once through Drive. It keeps groups, attached connectors, text in shapes, custom geometry and placeholders, needs one emitter, and works with Drive access alone.

**Previews come from Google**, through Drive's PDF export and Poppler. LibreOffice is not required.

## Consequences for the emitter

- Object names do not survive, so nothing after import may rely on them. Stable IDs must be carried another way (alt-text descriptions are the candidate to test) or re-derived by position and text.
- The Slides API being unavailable to `gcloud` means post-import edits also need the connector, or a rebuild and re-import.
- Each revision that goes through import creates or replaces a Drive file; the emitter should update one working file rather than create a new one per preview.
