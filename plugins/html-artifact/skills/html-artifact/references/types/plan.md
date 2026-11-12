# Implementation plan, rollout, migration

Someone will implement from this page, possibly another agent. Make every step concrete enough to start.

## Spine

1. **Masthead.** The `h1` names what ships. The lede gives the phase count and the hardest constraint. Under the lede, add a closed `<details>` whose summary is "Why", holding the request in a `<blockquote>`, word for word. The request is usually the user's own message in this session, so quote the sentences that ask for the work and state its constraints. The reader checks the plan against what was asked, so never paraphrase it. Leave it out only when no request stands behind the page, such as a report you started yourself.
2. **Summary.** `dl.stats` for scope (endpoints, files, tables, phases). Then the hardest constraint as a callout.
3. **Phase order.** `figure.flow` when the phases run one after another, or a text diagram (see `rules/diagrams.md`) when some run in parallel.
4. **Phases table.** One row per phase: what it delivers, what it needs first, and how you know it's done.
5. **Current phase in detail.** Numbered steps. Each names the files to touch and the test that proves it. Write todos only for the current phase.
6. **Risks.** A numbered list, each with an owner.
7. **Not changing.** A short bullet list of what the plan leaves alone, so the reviewer sees where the scope stops.
8. **Sources.** The code, docs and tickets the plan relies on.

## Decisions

Put each open question in the section it changes, as a `div.ask` with the option you recommend as its `data-default`. Say what each option changes in a `data-if` block. The reader then answers it while looking at the thing it affects.

## Avoid

- Steps like "implement X" with no file, test or acceptance check.
- Todos for every future phase. They go stale.
- Open questions collected in a list at the end, away from the section they change.
