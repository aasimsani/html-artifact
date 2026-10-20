# html-artifact v2 — implementation plan

v2 is a general tool for reviewable, interactive documents. Every artifact is assembled from reusable components: a page shell, content and interactive blocks, a review layer, and one channel back to Claude. The agent writes content plus markup contracts. `scripts/build.mjs` inlines the components the page names, and `scripts/verify.mjs` checks the result in headless Chrome. The bench (`bench/`) is the acceptance test.

Picks were made in `research/proposal_html-artifact-v2.html` on 2026-10-19, and the full list is in `research/picks.md`.

## The one contract

Every interactive block registers with the runtime:

```js
HA.register('mind-map', { el, state: () => tree, restore: s => …, summary: () => '3 branches, 2 pruned' });
```

The review layer collects three things into one envelope: document comments, decision answers, and every registered block's `state()`. **Send to Claude** posts that envelope, and the agent edits the source and rebuilds. After the rebuild, highlights re-anchor, the version diff shows what changed, and blocks `restore()` from the previous state. That is the iteration loop. A mind map, a weighted matrix, a test checklist and an RFC all use it unchanged.

## Targets

These come from the 2026-10-19 bench (8 cases, one run each).

| Metric | v0.3 | v2 target |
|---|---|---|
| fidelity / reviewable | 100% / 100% | ≥ 86% / ≥ 86% |
| design | 0% | ≥ 71% |
| code review renders real diff hunks | no | yes |
| dark mode / fits 400px / console clean | 0% / 0% / 100% | 100% / 100% / 100% |
| $ per artifact / output k-tokens | 2.7 / 54 | ≤ 1.6 / ≤ 30 |

## Decisions

- **Zero-dependency scripts.** `build.mjs` uses only the Node standard library. `verify.mjs` drives the system Chrome over the DevTools protocol with Node's built-in `WebSocket`.
- **Components enhance plain HTML.** A `.src.html` page renders readably before the build step.
- **Prompt rules live in per-type references.** SKILL.md is a router. It says how to pick components and when to read `references/types/<type>.md`, and the competitor-derived rules live in those files.
- **One refinement pass, Minto structure.** After drafting, the agent asks of every section whether it is the easiest, simplest and best way to understand the information fastest. If not, it restructures as answer first, then grouped supports, then evidence, with the visual before the prose and detail opening on demand.

## Phases

```
P1–P5 done ─► P6 router + prompts ─► P7 content components ─► P8 code review kit ─► P9 review loop + channel ─► P10 interactive types ─► P11 bench + perf
```

| Phase | Contents | Done when |
|---|---|---|
| P1–P5 | `build.mjs`, `verify.mjs`, shell, review kit, content blocks | ✅ 35 tests green |
| **P6 Router + prompts** | Router and refinement pass in SKILL.md (Minto, show first, progressive disclosure). Per-type references for spec, plan, code review, report, postmortem, decision memo and explainer. Rule files for diagrams, charts and writing (conciseness, lists, sources, redaction). v0.3 `references/` monoliths deleted. Trigger evals. | The plugin's evals pass: it triggers on the two document cases, and it stays quiet on the short-answer and code-only cases |
| P7 Content components | Revise the content blocks. Add the clean and sortable tables, timestamp rail, stepper, incident timeline, roadmap lanes, and the ranked, phased and numbered checklists. Add the cause chain, a weighted matrix, and a diagram kit (shape and edge conventions, happy path, click to expand, copy SVG). | Each block has a test and passes verify in both themes at 400px |
| P8 Code review kit | Annotated diff with margin notes, verdict header with severity counts, findings index, risk map, file tree with viewed state, Conventional Comments labels, suggested-code comments | The stripe-account-tags bench case renders real hunks and passes review-shape |
| P9 Review loop + channel | `HA.register` contract, annotation side panel, delete / replace / global comment types, quick labels, decision blocks, Send to Claude (loopback listener and Monitor, clipboard fallback), version diff, share links | A Submit from a built page arrives as a session notification in a live test |
| P10 Interactive types | Test-plan checklist, data explorer, ERD explorer, mind map, brainstorm grid, slide deck, playground, throwaway editor. Each is a component plus a type reference. | Each type has a fixture test, and its `state()` round-trips through Send |
| P11 Bench + perf | Re-run v2 against v0.3 and the competitors with 3 runs per case, then profile load and init on the largest artifact | Every target above is met |
| Later | Plan-review hook on ExitPlanMode | — |

## Known issues

- `verify.mjs` probes the first long `<p>` in the document. When the header lede sits outside `<main>`, the review kit correctly ignores the selection, so verify reports a false "selection helper did not appear". The probe should select inside `main > section`. P6 fixes it.

## Todos

### Phase 6 — router + prompts ✅

- [x] RED: verify test for a lede outside `<main>`. It was RED once the fixture matched the real review kit. GREEN came from probing `main section p`.
- [x] RED: router graders (answer first, timeline, flow) added to the plugin evals. v0.3 scored 0.25 on the postmortem and 0.33 on the design doc.
- [x] GREEN: router SKILL.md, `references/types/*.md`, `references/rules/*.md`, and v0.3 monoliths deleted. Auto-detecting components added to `build.mjs` (5 tests). All four plugin evals pass, at $0.31–0.33 per artifact.

### Phase 7 — content components ✅

- [x] Families split into `content`, `timeline`, `diagram`, `code` and `table`. New: stepper, roadmap, cause chain, ranked list, checklist, sortable table, weighted matrix, diagram kit, a cleaner table style, and the secret scan in verify.

### Phase 8 — code review kit ✅

- [x] Annotated diffs with `⟦F1⟧` markers, files index with viewed ticks, split view, findings table, risk map, and a blocking flag plus suggested code in comments (7 tests).

### Phase 9 — review loop + channel ✅

- [x] `HA.register` contract (3 tests), decision blocks (5), receiver plus `listen.sh` plus Send to Claude (6), and comment kinds, quick labels, general comments, side panel, version diff and share links (7).

### Phase 10 — interactive types ✅

- [x] testplan, explorer, erd, mindmap, variants, playground, deck and editor. Each has a component, a test file and a type reference. Four agents built them in parallel against `HA.register`. The suite is 149 of 149 green.

### Phase 11 — bench + perf ✅ (with misses)

- [x] v2 arm, 3 runs per case, all arms re-scored with `cdp.mjs`. Results are in PR #1.
- [x] Met: fidelity 95% and reviewable 100%, level with v0.3. Dark mode, phone fit, clean console and round trip all at 100%. Output tokens dropped from 53k to 24k. The real-PR code review renders annotated hunks.
- [x] Perf: review init takes 5 ms on a 1.1 MB page, plus about 0.25 ms per stored comment.
- [ ] Missed: $2.18 per artifact against $1.60. Next step: cut turns by merging the verify and refine passes, and trim the reference reads.
- [ ] Missed: the design judge scored 42% against 71%. Next step: judge a screenshot or the `.src.html`, not 150 KB of built HTML.
- [ ] Missed: built pages average 128 KB against 60 KB. Next step: minify components at build time.

### Iteration 2.1 — speed to first build, then iterate (2026-10-20)

The user re-aimed the work: optimize time to a good first build, then fast review rounds, and ignore cost. Refining facts with the reader beats deliberating over structure.

- [x] `build.mjs --verify` builds and checks in one call, and SKILL.md gathers references in one turn and refines while drafting. The bench runs that completed took 86–205 s against v2's 296 s average.
- [x] Live reload. `build.mjs` announces each rewrite to the session receiver, and open pages reload in place at the same scroll position (2 tests).
- [x] Minified runtime. A typical document's runtime is about 53 KB, guarded by a 55 KB budget test.
- [x] Blind screenshot judge (`bench/judge.py`), replacing the text-only design judge.
- [x] A tour example in `plugins/html-artifact/examples/` uses every component.
- [x] Bench timeouts traced to a slow API window, while the account's five-hour usage sat at 86–87%. The same RCA case took about 850 s in that window and 114–118 s after it reset. Don't run large benches near the usage limit, because it also throttles the user's own sessions.

### Iteration 2.2 — answer first is not optional (2026-10-20)

- [x] Per-case judge notes showed v2.1 headlines and ledes naming the topic or source instead of the answer, because demoting the refinement pass also dropped answer-first. It's now a hard rule in the write step, along with "say on the first screen what the reader must decide".
- [x] On phones the Review pill waits until the reader scrolls or starts reviewing, so it no longer covers first-screen content (1 test).
- [x] On the three affected cases, "understand in 10 s" went from 5.9 (v2.1) to 8.7, above v2's 8.3. Visual went to 7.7 and phone to 7.2, with runs taking 74–167 s.
