# Artifact bench

The bench rebuilds real artifacts from facts-only briefs with each skill arm and compares the results. Everything under `corpus/` and `runs/` is gitignored, because the briefs quote internal Taxwire data.

## Arms

| Arm | Source |
|---|---|
| `original` | The existing artifact, built earlier with this skill (reference only, never re-run) |
| `baseline` | No plugin. It's the `without` arm of the `ours` ablation run |
| `ours` | `plugins/html-artifact` at v0.3 |
| `v2` | `plugins/html-artifact` at v2.0 |
| `dogum` | `dogum/html-artifacts` |
| `flabs` | `f-labs-io/agent-html-skills` (`plugins/html-skills`) |

## Run it

```bash
cd bench                                            # render.mjs drives the system Chrome via the skill's cdp.mjs
python3 extract_brief.py <artifact.html> corpus/<slug>/brief.md   # per corpus entry, plus an entry in corpus/cases.json
python3 gen_cases.py                                # writes runs/evals/
# Copy runs/evals into each arm under runs/arms/<arm>/evals, then for each arm:
claude plugin eval . --runs 1 --ablation none -j 2 --threshold 0 \
  --allow-tools Write Edit Bash --trust-plugin --no-publish --keep-temp \
  --json ../../results/<arm>.json                   # use --ablation with-without on `ours` for the baseline
python3 collect.py runs/results/*.json              # copies each run's HTML out of its kept temp dir
node render.mjs score --shots runs/out/shots runs/out/*/*.html > runs/out/scores.jsonl
python3 report.py                                   # runs/out/index.html
```

## What gets measured

- **LLM graders** (`graders/`) judge fidelity to the brief's key facts, design, and whether review feedback can reach the agent. A regex grader checks for remote scripts. Haiku judges vote 2 of 3.
- **`render.mjs`** opens each page in headless Chrome through the skill's own `cdp.mjs`. It records console errors, external requests, dark-mode support, overflow at 400px, how much text paints with JS off, whether selecting text surfaces an annotate helper, section checkboxes, an export button, and agent round-trip wiring.
- **Build cost** comes from `claude plugin eval` and covers $ per run, seconds, turns and output tokens. It's the number componentized features should drive down.

With `--runs 1`, two runs of the same arm differed by one case on fidelity and reviewability (2026-10-19). So treat a one-case difference as noise, and use `--runs 3` before trusting a close comparison.
