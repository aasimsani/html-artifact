---
type: llm
weight: 2
focus: { source: file, path: design_rate-limits.src.html }
---

Judge the structure of this design doc from its HTML.

PASS only if all of these hold:
- The first section states the proposal and its main trade-off in one or two sentences, before any background.
- The request path is drawn as a diagram or flow, not described only in prose.
- The alternatives sit side by side in a table or comparison, not in separate paragraphs.
- The open questions appear as a list or as decision blocks with options.

FAIL if any item fails.
