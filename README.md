# html-artifact

A Claude Code plugin for **reviewable, interactive HTML documents**: RFCs, design docs, plans, code reviews, postmortems, reports, decision memos, and one-off tools such as test plans, data explorers, mind maps and comparison matrices.

Claude writes content and plain HTML markup. A build script inlines prebuilt components, so every page comes out as one self-contained file with no network, no dependencies and no build pipeline. The file includes:

- light and dark themes, and a layout that works on a phone;
- a review kit: reviewed checkboxes, comments, text highlights that survive edits, quick labels, and delete/replace/general comments;
- **Send to Claude**, which posts the whole review back into the running session.

## Install

```text
/plugin marketplace add aasimsani/html-artifact
/plugin install html-artifact@html-artifact
```

Ask for "an RFC for X", "review this PR as a page", "write up the outage" or "a test plan for this release", and the skill triggers. It stays out of the way for short answers and code-only requests.

## How it works

1. **Route.** The skill maps each piece of information to the simplest component for its shape: events go on a timeline, options into a comparison, a code change into an annotated diff.
2. **Write `<name>.src.html`** using the markup in `references/components.md`, following the per-type spine in `references/types/`.
3. **Build.** `scripts/build.mjs` detects which components the markup uses and inlines only those.
4. **Refine once.** The skill asks whether each section is the fastest way to understand its information. If not, it restructures the section as a Minto pyramid: the answer first, the visual before the prose, and the detail on demand.
5. **Verify.** `scripts/verify.mjs` drives the system Chrome with no npm dependency. It checks for console errors, external requests, dark mode, overflow at 400px, text under 12px, credential-shaped strings, and that text selection opens the comment helper.
6. **Iterate.** The reader comments, answers decision blocks and edits interactive blocks, then presses Send to Claude. The agent edits the source and rebuilds. Highlights re-anchor, and changed sections show a word diff.

## Components

| Family | Markup |
|---|---|
| shell | page layout, TOC, theme toggle, table style, `HA.register` for interactive state |
| review | reviewed checkboxes, comments, highlights, quick labels, tray, exports, Send to Claude, share links, version diff |
| content | `aside.callout`, `dl.stats`, `div.bar`, `span.claim`, `ol.chain`, `ol.ranked`, `ul.checklist` |
| timeline | `ol.timeline`, `ol.stepper`, `div.roadmap` |
| diagram | `figure.flow`, `figure.diagram` (SVG conventions, arrowheads, Copy SVG, click-to-expand) |
| table | `table[data-sortable]`, `table.matrix` |
| code | syntax colours, `pre.diff`, `div.annotated`, `table.findings`, `ol.risk` |
| ask | `div.ask` decision blocks |
| testplan, explorer, erd, mindmap, variants, playground, deck, editor | interactive artifact types, each with a reference in `references/types/` |

## Layout

```text
.claude-plugin/marketplace.json
plugins/html-artifact/
├── .claude-plugin/plugin.json
├── skills/html-artifact/
│   ├── SKILL.md                 # router, loop, refinement pass
│   ├── components/              # <name>.css / <name>.js, inlined by build.mjs
│   ├── references/              # components.md, types/*.md, rules/*.md
│   └── scripts/                 # build.mjs, verify.mjs, cdp.mjs, receiver.mjs, listen.sh
├── tests/                       # node --test tests/*.test.mjs (headless Chrome)
└── evals/                       # claude plugin eval: trigger and structure checks
bench/                           # quality and cost comparison against other skills
research/                        # competitor survey, feature list, plan
```

## Tests

```bash
cd plugins/html-artifact
node --test tests/*.test.mjs          # component tests; needs Node ≥ 22 and Google Chrome
claude plugin eval . --allow-tools Write Edit Bash   # trigger evals, billed to your account
```

## Credits

- The diagram, timeline, checklist, matrix, code-review and redaction rules are adapted from [f-labs-io/agent-html-skills](https://github.com/f-labs-io/agent-html-skills) (MIT). The local listener for Send to Claude follows its design.
- The trigger discipline, chart rules, style bans and the headless verify pass are adapted from [dogum/html-artifacts](https://github.com/dogum/html-artifacts) (Apache-2.0).
- The annotation types, quick labels, decision blocks and share links take their ideas from [backnotprop/plannotator](https://github.com/backnotprop/plannotator) and [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer).
- The original methodology comes from [thariqs.github.io/html-effectiveness](https://thariqs.github.io/html-effectiveness/).
