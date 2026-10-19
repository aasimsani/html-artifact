# html-artifact v2 — feature list (draft, 2026-10-19)

Every feature is a **component**. A component is a prebuilt CSS/JS file in the skill's `components/` directory plus a small markup contract (a class or `data-*` attribute) that the agent writes. A build script inlines the components a page uses, so the output stays one self-contained file. The agent writes content, never the runtime.

## What the bench says

The bench rebuilt 7 real Taxwire artifacts from facts-only briefs, with one run per arm (`bench/`, results in `bench/runs/out/index.html`).

| | fidelity | design | reviewable | dark mode | fits 400px | select→annotate | $/run | sec | out k-tok | KB |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline (no skill) | 57% | 43% | 14% | 100% | 57% | 0% | 1.3 | 249 | 29 | 48 |
| **ours (v0.3)** | **100%** | **0%** | **100%** | 0% | 0% | 86% | **2.7** | **423** | **54** | 84 |
| dogum | 71% | 86% | 14% | 100% | 86% | 0% | 1.6 | 337 | 33 | 53 |
| f-labs | 71% | 29% | 29% | 0% | 57% | 0% | 1.6 | 297 | 34 | 55 |

The data supports five conclusions:

- Our skill wins on fidelity and review tooling, and nothing else ships text-range annotation.
- It costs twice the baseline in dollars, time and output tokens. The extra output is mostly the 70 KB starter runtime, which the model re-types into every artifact.
- It makes design worse than no skill at all (43% → 0%). The canonical palette is light-only and is "copy verbatim", so the model can't add dark mode, and the layout overflows at phone width in every case.
- Every existing artifact logs two console errors when opened from disk. `starter-template.html:367` calls `fetch(location.href)`, and Chrome blocks that under `file://`, so `anchor.sourceLine` is always null.
- No arm returns feedback to the agent without a copy-paste step. Our "Link .json" companion appeared in 0 of 7 fresh runs.

## Components

Priority order: P0 fixes what the bench shows is broken or slow, P1 adds the round-trip, and P2 extends reach.

### P0 — runtime and shell

| Component | Contract | What it does | Taken from |
|---|---|---|---|
| **build** (`scripts/build.mjs`) | Agent writes `<name>.src.html` with `<meta name="components" content="review,diagram,…">` | Inlines the listed component CSS/JS and writes `<name>.html`. The source stays a valid, viewable page, because components only enhance existing markup. | f-labs inlines `submit-handler.js`, and visual-explainer's `render.mjs` inlines its kit |
| **shell** (`shell.css`, `theme.js`) | `<body class="doc">`, sections as `<section id>` | Light and dark tokens on `:root`, redefined under `prefers-color-scheme: dark` and `[data-theme]`, with a theme toggle. Sticky side nav collapses below 900px. `table`, `pre` and `svg` scroll inside their own box. Print CSS. | dogum `matching-your-style.md` |
| **review** (`review.js`, `review.css`) | `<section data-review>` | Reviewed checkbox, per-section comments, text-range annotations, decision queue and drawer, and the three exports (Markdown, bullets, JSON). Persistence goes through a try/catch storage wrapper. Initialisation is lazy, so the `data-aid` walk runs on first selection rather than on load. | ours (v0.3), minus the `fetch(location.href)` locator |
| **anchors** | none (inside review) | Each annotation stores `{text, prefix, suffix, sectionId, selector}`. It re-finds its range by surrounding text after the agent edits the page, and it is marked `outdated` when the text no longer matches. | htmlify (prefix/suffix), plannotator (`outdated`) |
| **verify** (`scripts/verify.mjs`) | Agent runs it on the built file before delivering | Headless Chrome at 1280px and 400px in light and dark. It reports console errors, external requests, horizontal overflow, labels under 12px, and whether the selection helper appears. It writes a contact sheet that the agent reads. | `bench/render.mjs`, dogum, visual-explainer `look.mjs` |
| **slim SKILL.md** | — | The skill drops from 31 KB to about 8 KB: when to use it, the component catalogue and the build/verify loop. It removes the mandatory WebFetch of the companion site. It adds a "stay in markdown when…" carve-out and should-not-trigger evals. | dogum |

### P0 — content components

Each one replaces a figure the model currently re-derives in SVG every time. All of them use theme tokens, so they work in dark mode with no extra effort.

| Component | Markup | Seen in |
|---|---|---|
| **timeline** | `<ol class="timeline">` with `<li data-at="14:02" data-sev>` | postmortem, RCA, design (trim sequence), roundup |
| **flow** | `<figure class="flow">` with rows of `<div class="node">` and `<i class="arrow" data-label>` (CSS grid, no hand-placed coordinates) | diagram, plan, RCA investigation tree |
| **stat strip / stacked bar** | `<dl class="stats">`, and `<div class="bar" data-parts="319:collected,104:tpp,494:saas">` | postmortem, plan |
| **callout / verdict** | `<aside class="callout" data-sev="crit|warn|ok|q">` | every case |
| **compare** | `<table class="compare">` with a `data-verdict` cell | design, plan, code review |
| **annotated diff** | `<figure class="diff" data-file>` with a margin-note column | code review |
| **claim** | `<p data-evidence="verified|inferred|guess" data-check="…">` | RCA, roundup |

### P1 — feedback reaches the agent

| Component | Contract | What it does | Taken from |
|---|---|---|---|
| **channel** (`listen.sh`, `receiver.mjs`) | `build.mjs` injects `__CLAUDE_SUBMIT_URL__` when the listener is up | A loopback receiver checks a per-session nonce, then a `Monitor` turns each Submit into a session notification. The Submit button sends the queue's JSON export. When the listener is down, it falls back to the clipboard. | f-labs `html-skills-listen` |
| **ask** | `<div class="ask" data-id data-default="b">` with `<label>` options | Decision blocks with a recommended default. The export lists each answer as `chosen`, `default kept` or `not opened`, because silence is not agreement. | plannotator `:::question`, visual-explainer `<ve-ask>` |
| **quick labels** | Configured per page | One-click comment presets ("needs a test", "out of scope"), each carrying a hidden instruction for the agent. | plannotator |
| **sourceId guard** | `<meta name="artifact-id">` | Each export carries the artifact id and a content hash, so the agent rejects feedback aimed at a stale version. | htmlify |
| **publish** | `build.mjs --publish` | The agent publishes through the native `Artifact` tool with the local channel stripped. On the hosted page, comments go through the `comments` capability and `ArtifactComments` instead of the clipboard. | f-labs publish-request, Claude Code Artifacts |

### P2 — reach

| Component | What it does | Taken from |
|---|---|---|
| **plan-review hook** | A `PermissionRequest` hook on `ExitPlanMode` builds the plan as a review page and waits for a decision. Allow returns `updatedInput`, deny returns the feedback. There are separate prompts for approve, approve-with-notes and deny. | plannotator |
| **share link** | `CompressionStream` packs review state into the URL fragment, and an import merges a teammate's link back in. | plannotator |
| **redact** | `verify.mjs` greps the built file for credential patterns and fails on a hit. | f-labs research-reports gate |
| **house tokens** | The skill reads `design-system.html` or a tokens file from the repo, when one exists, and lets it override the shell's tokens. | dogum |
| **long-answer nudge** | A `Stop` hook that suggests (never writes) an artifact when a reply passes about 2,500 characters. | htmlify |

## Not taking

- **visual-explainer's custom-tag language.** Its source can't be viewed until the render step runs. Our components enhance plain HTML instead.
- **Plannotator's server-hosted SPA and installed binary.** The single-file artifact stays the unit.
- **Google Fonts or any CDN** in local artifacts. f-labs loads 5–7 remote requests per page, which breaks offline viewing.
- **htmlify's auto-conversion Stop hook.** It writes undesigned HTML without asking.

## How the bench judges v2

v2 should match v0.3 on fidelity and reviewability, match dogum on design, dark mode and phone fit, and reach baseline cost (about $1.3 and 30k output tokens per artifact).
