---
type: llm
weight: 1
focus: { source: file, path: "{{OUT}}" }
---

Judge whether a reviewer can give structured feedback that reaches the agent, from the page's HTML and JavaScript.

PASS if the page lets a reader (a) attach a comment to a selected text range or to a specific section, and (b) export or submit all their feedback as one block of text or JSON (copy button, submit button, or file write) that names where each comment points.

FAIL if feedback is impossible, or if comments cannot be exported in one action.
