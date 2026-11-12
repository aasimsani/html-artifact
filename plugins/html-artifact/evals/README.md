# Evals

The suite checks two things. The skill fires for the right requests, and the page it builds has the structure the skill asks for. Run it after you change `SKILL.md`, a file under `references/`, or a grader, then add a row to the log at the end of this file.

| Case | The prompt asks for | Graders check |
|---|---|---|
| `should-not-trigger/code-only` | a Python function | no HTML file is written and the Skill tool is never called |
| `should-not-trigger/short-question` | a two-sentence answer | no HTML file is written and the Skill tool is never called |
| `should-trigger/postmortem` | an outage writeup | the skill loads, the page is built and verified, the source file is kept, the first section states the answer, and the page has a timeline |
| `should-trigger/design-doc` | a rate-limit design doc | the skill loads, the page is built, the first section states the proposal, and the page has a flow or a text diagram |

## Run it

Run the whole suite before you merge. It costs about $5 and takes about 4 minutes.

```bash
cd plugins/html-artifact
claude plugin eval . --allow-tools Write Edit Bash -j 4 --no-publish --trust-plugin
```

Each case runs 3 times with the plugin and 3 times without it. The plugin is loaded from the working tree, so the run tests your uncommitted edits and ignores any installed copy.

| Flag | What it does |
|---|---|
| `--allow-tools Write Edit Bash` | Lets the child session write the page and run `build.mjs`. The eval withholds these tools until you grant them. |
| `-j 4` | Runs four sessions at once. They share your rate limit. |
| `--no-publish` | Keeps the HTML report on your machine. |
| `--trust-plugin` | Skips the trust prompt, which a script can't answer. |

After you fix one case, run that case alone. It costs about $1.20 and takes about 80 seconds.

```bash
claude plugin eval . --allow-tools Write Edit Bash -j 3 --no-publish --trust-plugin \
  --case design-doc --ablation none
```

`--ablation none` drops the runs without the plugin. Run the whole suite again before you merge, because an edit that fixes one case can break another.

## Read the result

- **Score** is the weighted share of graders that pass, averaged over the runs. `answer-first` has weight 2 and every other grader has weight 1. The command exits 1 when any case scores under 1.00.
- **A run with both arms leaves `skill-fired` out of the score**, because that grader can't pass without the plugin. A run with `--ablation none` counts it. This means one failing grader costs 0.20 in the first kind of run and 0.17 in the second, so compare a score only with rows of the same kind.
- **Without** is the same prompt with no plugin loaded. A trigger case should score far higher with the plugin. If the two scores are close, the graders don't measure what the plugin adds.
- **The two no-trigger cases** should score 1.00 in both arms. A lower score with the plugin means the skill description claims too much.
- **Seconds per page** is `durationSeconds` of each run with the plugin. One page takes 53 to 82 seconds. Runs of the same case differ by up to 20 seconds, so a smaller change is noise.

When a case fails, open `results/<timestamp>/report.html` and read the grader verdicts before you edit anything. Then decide whether the page is wrong or the grader is wrong. `answer-first` is an LLM judge with three votes, and the report warns that a judge is unreliable on a long page. A grader is wrong when the skill has changed and the grader still checks for the old markup. If you change a grader, say so in the log, because that row can't be compared with the rows before it.

## Record it

Each run writes `results/<timestamp>/`, which git ignores. Those files hold absolute paths from the machine that ran them. Add one row to the log instead. Every number comes from `aggregate-result.json`:

- The scores are `cases[].aggregates.score` and `scoreWithout`.
- The cost is `costUsd`.
- Seconds per page is the range of `durationSeconds` over `cases[].arms.with` for the two trigger cases.

## Not covered

- No case asks for a plan, so nothing here tests `references/types/plan.md`.
- No case has repo code, so nothing here tests code filled from `data-src`.
- No grader checks where a decision sits. Two of the three design docs in the last run grouped their decisions in a section of their own.

## Log

Scores read "with plugin / without". A dash means the run left that case or that arm out. Times are UTC and match the folder name under `results/`.

| Run | Plugin | Runs per case | code-only | short-question | postmortem | design-doc | Cost | Seconds per page | What the run tested |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-19 21:50 | 0.3.0 | 1 | – | – | 0.25 / – | 0.33 / – | $2.00 | 200–323 | The v0.3 skill against the new router graders. It was meant to fail. |
| 2026-10-19 22:24 | 0.3.0 | 1 | 1.00 / – | 1.00 / – | 1.00 / – | 1.00 / – | $0.78 | 64–70 | The v2 router skill and components, before the version changed in `plugin.json`. |
| 2026-11-12 06:12 | 2.2.0 | 3 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 0.14 | 0.87 / 0.20 | $4.72 | 53–78 | Lint, `data-src`, text diagrams, mockups and `data-if`. Two design docs drew a text diagram, and `flow-component` accepted only `class="flow"`. |
| 2026-11-12 06:19 | 2.2.0 | 3 | – | – | – | 0.89 / – | $1.14 | 59–72 | The grader now also accepts `type="text/diagram"`. The "Why" quote and "Not changing" were added to the spec type. One page kept an "Open questions" section that only pointed at the decisions, and `answer-first` failed it. No page quoted the request. |
| 2026-11-12 06:21 | 2.2.0 | 3 | – | – | – | 1.00 / – | $1.28 | 76–82 | The spec type names the user's message as the request and says to drop an empty "Open questions" section. All three pages quote the request. |
