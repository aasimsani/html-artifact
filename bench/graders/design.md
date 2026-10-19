---
type: llm
weight: 2
focus: { source: file, path: "{{OUT}}" }
---

Judge the page's design from its HTML and CSS.

PASS only if all of these hold:
- The layout fits the content. Comparisons sit side by side, sequences are drawn as timelines or flows, tabular facts are real tables. It is not markdown translated into headings and paragraphs.
- Typography has a clear hierarchy, body text is 15–18px with a line length near 60–80 characters, and colour encodes meaning (severity, status) instead of decoration.
- It has fewer than two of these tells: gradient hero, emoji section headings, cards-everywhere grid, four or more decorative accent hues, a "hero stat row" on a non-dashboard page, glassmorphism.
- Dark mode exists (prefers-color-scheme or a data-theme toggle) and a layout rule collapses to one column under about 700px.

FAIL if any item fails.
