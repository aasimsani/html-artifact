# Diagram rules

Use `figure.flow` for a straight chain of up to six steps. Draw inline SVG for anything with branches, stores, actors or feedback loops, and follow every rule below.

## Pick the type from the question

| The reader asks… | Draw |
|---|---|
| What happens, in what order, through which stages? | Flowchart or data flow, left to right |
| Who talks to whom, and when? | Sequence diagram: one lifeline per actor, numbered messages, time going down |
| What states can this be in? | State machine: states as rounded boxes, transitions labelled with the event |
| How does the system fit together? | Architecture map: services, stores, queues, grouped by owner or zone |
| What depends on what? | Dependency graph, layered by depth, with cycles in the crit tone |
| What sits on top of what? | Layered bands, top to bottom |

## Layout

- Pick one direction, left to right or top to bottom, and keep it for the whole diagram.
- Put every node on a grid. Leave at least 40px between neighbouring boxes.
- Keep a diagram to 12 nodes or fewer. Split a bigger picture into a map plus one detail diagram per zone.
- Use `viewBox` and no fixed width, so the figure scales.

## Text never overflows

- Size each box from its label: width ≥ characters × 8 + 32 at 14px. Never guess a width.
- Wrap any label longer than about 12 characters in `<foreignObject …><div class="fo" xmlns="http://www.w3.org/1999/xhtml">Label<small>detail</small></div></foreignObject>`, sized to the node's rect. The `.fo` class centres, pads and wraps the text. Plain `<text>` never wraps.
- Don't tune coordinates by eye. Lay nodes out on a simple grid (for example, columns 220px apart and rows 100px apart), build with `--verify`, and fix only what it reports. A clipped label shows up as a ✗ line.
- Keep 8px of padding between text and the box edge.
- A label over 32 characters is a sentence. Shorten it.

## Edges

- Label every arrow with the data it carries ("FINALIZED sales", "429 + Retry-After"), not the function that moves it.
- Put a small rectangle filled with `var(--bg-elev)` behind each edge label, so the label stays readable where lines cross.
- Solid means a synchronous call. Dashed means asynchronous (a queue or event). Dotted means optional or a fallback. The crit tone marks the problem path.

## Shapes

- A rectangle is a service or step. A cylinder is a data store. A pill is a queue or topic. A dashed box is external or third-party.
- Use colour for meaning only (changed, problem, owner), and use at most three colours. Add a legend whenever shape or colour carries meaning.
- Highlight the happy path or the changed part in `var(--accent)`, and keep everything else neutral.

## Ink and fonts

- Use `currentColor` or theme variables for every stroke and fill, so the figure works in dark mode.
- Set labels in `var(--mono)` at 12–14px. The smallest text in a figure is 12px at its rendered size.
- Caption every figure with what the reader should take from it, in one sentence.
