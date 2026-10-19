# Implementation plan, rollout, migration

Someone will implement from this page, possibly another agent. Make every step concrete enough to start.

## Spine

1. **Masthead.** The `h1` names what ships. The lede gives the phase count and the hardest constraint.
2. **Summary.** `dl.stats` for scope (endpoints, files, tables, phases). Then the hardest constraint as a callout.
3. **Phase order.** `figure.flow` or an SVG of the phases, showing which ones can run in parallel.
4. **Phases table.** One row per phase: what it delivers, what it needs first, and how you know it's done.
5. **Current phase in detail.** Numbered steps. Each names the files to touch and the test that proves it. Write todos only for the current phase.
6. **Risks and open questions.** A numbered list, each with an owner.
7. **Sources.** The code, docs and tickets the plan relies on.

## Avoid

- Steps like "implement X" with no file, test or acceptance check.
- Todos for every future phase. They go stale.
