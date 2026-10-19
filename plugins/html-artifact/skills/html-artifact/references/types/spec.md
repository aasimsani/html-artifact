# RFC, design doc, spec, proposal

A reviewer should know what you propose, and what it costs, within one screen.

## Spine

1. **Masthead.** The `h1` is the proposal as a sentence ("Rate-limit each API key with a token bucket in Redis"). The lede gives the main trade-off.
2. **Proposal.** The design in three to five bullets, then a diagram of where it sits: `figure.flow` for a straight path, an SVG diagram (see `rules/diagrams.md`) for anything with branches or stores. Mark what changes with the accent or a tone.
3. **Problem.** Why now, with numbers. Two or three sentences, or `dl.stats`.
4. **Alternatives.** One table: rows are options, columns are the criteria that decided it, and the last column is the verdict. Put the chosen option first.
5. **Details.** Data model, API shape and failure modes, each as its own `h3`. Use `<details>` for long schemas.
6. **Rollout and risks.** A numbered list of steps. Name risks with a mitigation each.
7. **Open questions.** A numbered list. Each one names the options and who decides.
8. **Out of scope.** A short bullet list.

## Avoid

- Opening with background before the proposal.
- Alternatives as separate paragraphs. They belong side by side.
- Questions buried in prose.
