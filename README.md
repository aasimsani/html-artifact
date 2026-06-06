# html-artifact

A Claude Code **plugin + skill** for generating **reviewable, single-file HTML
artifacts** — RFCs, design docs, code reviews, postmortems, ADRs, specs, audits.
Each artifact opens straight from `file://` with no build step and no network, and
ships with review affordances baked in.

This repo is itself a **plugin marketplace**, so it installs directly into Claude Code.

## Install

```text
/plugin marketplace add aasimsani/html-artifact
/plugin install html-artifact@html-artifact
```

Then invoke `/html-artifact`, or just ask for "an RFC as HTML" / "review this PR as
an HTML artifact" and the skill triggers on its own.

To update later:

```text
/plugin marketplace update html-artifact
```

## What every artifact gets

- per-section **"reviewed"** checkboxes with side-nav sync
- inline **per-section comments** + **text-range annotations** (select prose, right-click, annotate)
- a **decision queue** tray that collects flagged items for export
- baseline **export formats** (Markdown / bullets / `gh` CLI) via `htmlToMd()`
- slug-scoped **localStorage** persistence + a DevTools reset/export/import hatch
- an optional **JSON companion file** on disk for live agent monitoring (two-way human ↔ agent review)

Built on the methodology and demo gallery at
**https://thariqs.github.io/html-effectiveness/** — the skill WebFetches that site at
runtime so its examples, palettes, and category conventions stay current.

## Layout

```text
.claude-plugin/marketplace.json          # marketplace manifest (this repo)
plugins/html-artifact/
├── .claude-plugin/plugin.json           # plugin manifest
└── skills/html-artifact/
    ├── SKILL.md                         # entry — the editorial style guide
    └── references/                      # copy-pasteable snippets
        ├── README.md                    # snippet index
        ├── starter-template.html        # complete bootable artifact, every primitive wired in
        ├── design-system.css            # canonical palette / type scale / chips / callouts
        ├── annotations.html             # text-range annotation system (DOM + CSS + JS)
        ├── comments.html                # per-section comment form + cards + reviewed checkbox
        ├── decision-queue.html          # floating tray + slide-in drawer + clipboard copy
        ├── annotated-diff.html          # two-column annotated diff + full unified diff
        ├── companion-file.md            # JSON-on-disk companion spec + watcher templates
        ├── export-formats.js            # htmlToMd() + Markdown / bullets / gh-CLI renderers
        ├── persistence.js               # slug-prefixed localStorage + reset hatch
        ├── sidenav-scrollspy.js         # sticky side-nav, scroll-spy, progress bars
        └── syntax-highlighter.js        # ≤80-LoC regex highlighter (Python / SQL / JS)
```

## Use the snippets without installing

Open `plugins/html-artifact/skills/html-artifact/references/starter-template.html` in a
browser — it's a complete, working artifact with every primitive already wired in.
Copy it, set your slug + sections, done.

## Attribution

Style methodology and demos: https://thariqs.github.io/html-effectiveness/.
These files are free to copy and adapt.
