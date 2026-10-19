---
type: llm
weight: 2
focus: { source: file, path: "{{OUT}}" }
---

The HTML file was built from a content brief. Judge content fidelity only, not looks.

The brief's key facts are:
{{FACTS}}

PASS if every key fact above appears in the page (numbers exact, names exact), and the page invents no new numbers, owners, or dates that the brief lacks.

FAIL if any key fact is missing or altered, or if the page adds a figure the brief does not contain.
