---
type: llm
weight: 2
focus: { source: file, path: postmortem.src.html }
---

Judge the structure of this postmortem page from its HTML.

PASS only if all of these hold:
- Before any background or timeline, the page opens with a one- or two-sentence answer that states what happened and the customer impact.
- A visual (a timeline, a stat strip or a bar) appears before long paragraphs of explanation.
- Follow-ups are a numbered list or checklist, and each item has an owner and a date.

FAIL if any item fails.
