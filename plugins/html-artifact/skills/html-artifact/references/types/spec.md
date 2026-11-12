# RFC, design doc, spec, proposal

A reviewer should know what you propose, and what it costs, within one screen.

## Spine

1. **Masthead.** The `h1` is the proposal as a sentence ("Rate-limit each API key with a token bucket in Redis"). The lede gives the main trade-off. Under the lede, add a closed `<details>` whose summary is "Why", holding the request in a `<blockquote>`, word for word. The request is usually the user's own message in this session, so quote the sentences that ask for the work and state its constraints. The reader checks the proposal against what was asked, so never paraphrase it. Leave it out only when no request stands behind the page, such as a report you started yourself.
2. **Proposal.** The design in three to five bullets, then a diagram of where it sits: `figure.flow` for a straight path, a text diagram (see `rules/diagrams.md`) for anything with branches or stores. Mark what changes with the accent or a tone.
3. **Problem.** Why now, with numbers. Two or three sentences, or `dl.stats`.
4. **Alternatives.** One table: rows are options, columns are the criteria that decided it, and the last column is the verdict. Put the chosen option first.
5. **Details.** Data model, API shape and failure modes, each as its own `h3`. Use `<details>` for long schemas.
6. **Rollout and risks.** A numbered list of steps. Name risks with a mitigation each.
7. **Open questions, only when some have no options yet.** A numbered list that names who decides each one. A question with options is a decision, and it goes in the section it changes. Leave this section out when every question became a decision, because a section that only points at another one is noise.
8. **Not changing.** A short bullet list of what the proposal leaves alone and what it won't solve, so the reviewer sees where the scope stops.

## Decisions

Put each decision in the section it changes, as a `div.ask` with the option you recommend as its `data-default`. Say what each option changes in a `data-if` block. The reader then answers it while looking at the thing it affects.

## Avoid

- Opening with background before the proposal.
- Alternatives as separate paragraphs. They belong side by side.
- Questions buried in prose, or decisions collected at the end, away from the section they change.
