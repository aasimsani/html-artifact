---
name: html-artifact
description: Use proactively whenever the user asks for a reviewable HTML artifact — RFC, design doc, code review, postmortem, ADR, spec, audit, walkthrough, status report, deck, custom review editor — including triggers like "write an RFC", "draft a design doc", "create a postmortem", "review this PR as HTML", "make a spec page", "give me a review artifact". Editorial style guide for one-off, single-file artifacts that get opened from disk. NOT a style guide for production web apps, marketing pages, dashboards, customer-facing UIs, or anything that ships through a build pipeline; if the user says "build a webpage", "make a landing page", or "update the app's UI", this is the wrong skill. Stack with a workflow skill that chooses the sections; works standalone for one-off artifacts.
allowed-tools: WebFetch Read Write Edit Bash
metadata:
  author: aasim
  version: "0.3.0"
  companion-site: https://thariqs.github.io/html-effectiveness/
---

# html-artifact — editorial style guide for reviewable HTML artifacts

Use this skill when producing **a reviewable HTML artifact** — RFC, design doc, code review, postmortem, ADR, audit report, walkthrough, status report, deck, custom review editor. It is the canonical style guide. It does **not** define what to put in the artifact; it defines how the artifact should look, behave, and persist state. Stack it with a workflow skill that chooses the sections.

**Scope: artifacts only — not production UI.** This style guide is calibrated for single-file documents that a human opens, annotates, and discards. It is deliberately editorial (serif headings, system fonts, no JS framework, slug-scoped `localStorage`). Do **not** apply this style to:

- production web apps, dashboards, or customer-facing UIs
- marketing sites or landing pages
- anything that ships through a build pipeline or has external CSS/JS dependencies
- React/Vue/Svelte/Next.js components

If the user wants to "build a webpage", "make a landing page", or "update the app's UI", this is the wrong skill — fall back to `frontend-design` or the project's existing design system.

**Use proactively.** Don't wait to be told to "use html-artifact" — load this skill the moment the request fits (RFC, postmortem, spec, design doc, ADR, deck, code-review writeup, audit). Surface the artifact slug + filename + sections you'll produce, then build.

Composition idiom: `/baseprompt /html-artifact /<workflow>` (persona + form + content/sections). Worked examples: `/baseprompt /html-artifact /pr-review` for a stacked-PR review; `/baseprompt /html-artifact /rfc <link>` for an RFC; `/baseprompt /html-artifact /postmortem <id>` for an incident writeup. When invoked without a workflow command, ask the user what artifact and sections they want — do not invent sections.

---

## Reference snippets — copy, don't re-derive

Battle-tested implementations of every primitive in this skill live in **`./references/`**. Start from `starter-template.html` and pull in feature modules as needed.

| File | When to read it |
|---|---|
| [`references/starter-template.html`](./references/starter-template.html) | **Default starting point.** Complete bootable single-file artifact with every required primitive wired in. Change SLUG + SEVERITIES + sections, ship. |
| [`references/design-system.css`](./references/design-system.css) | Need just the palette/typography/chips/callouts/grid as a clean CSS block |
| [`references/annotations.html`](./references/annotations.html) | Lifting the text-range annotation system into a custom skeleton (DOM + CSS + JS, including `data-aid` walker, `pristine[aid]` snapshot, TreeWalker mark injection, popover positioning) |
| [`references/comments.html`](./references/comments.html) | Per-section comments + reviewed checkbox + sidenav `✓` sync |
| [`references/decision-queue.html`](./references/decision-queue.html) | Floating tray, slide-in drawer, clipboard with `execCommand` fallback, `.copied-toast` |
| [`references/export-formats.js`](./references/export-formats.js) | `htmlToMd()` with the paragraph-normalisation rule + Markdown / Bullets / gh-CLI renderers |
| [`references/syntax-highlighter.js`](./references/syntax-highlighter.js) | ≤80-LoC regex highlighter — Python + SQL + JS, runs on DOMContentLoaded |
| [`references/persistence.js`](./references/persistence.js) | Slug-prefixed localStorage helpers + `window.__<slug>` reset/export/import hatch |
| [`references/sidenav-scrollspy.js`](./references/sidenav-scrollspy.js) | Sticky side-nav, scroll-spy, smooth-scroll anchors, optional progress bars, date stamp |
| [`references/annotated-diff.html`](./references/annotated-diff.html) | Two-column inline diff (code + annotation cards) + full unified diff inside `<details class="file-block">` |
| [`references/companion-file.md`](./references/companion-file.md) | JSON-on-disk companion file for the artifact: schema (incl. `selector` / `sourceLine` / `artifact.htmlPath` locators), File-System-Access-API wiring, auto-poll, and watcher templates for letting a Claude agent monitor + reply to comments in real time |

The starter template already inlines every snippet so it works as one self-contained file. The split files exist so an agent customising one piece (e.g. adding a 6th severity, swapping the highlighter for a JS-only one, adding a new export format) can read just the relevant module instead of re-parsing the whole template.

**Selection ergonomics in the starter:** the annotation system supports both standard left-click-to-helper-button and right-click-to-popover. Selections that span multiple `[data-aid]` elements (e.g. a whole section) are stored as a multi-aid anchor (`anchor.aids[]`) so the marks land in every element the selection touched. Right-click on an existing `<mark>` opens its editor directly — no need to find the helper.

**Agent-friendly anchors:** every annotation persists with a CSS selector (`anchor.selector`), the HTML source line (`anchor.sourceLine`), section heading text, and the surrounding `artifact.htmlPath`. Pair this with the **Link .json** companion file (see `companion-file.md`) and an external Claude watcher can read the JSON, jump to the right line in the HTML, edit the source, and append `"author": "claude"` replies that appear in the artifact's UI within seconds.

---

## Required reading — fetch on every invocation

**Always WebFetch `https://thariqs.github.io/html-effectiveness/`** at the start of an `/html-artifact` run. It is the canonical companion site — 20 self-contained HTML demos grouped into 9 categories (exploration & planning, code review, design systems, prototyping, illustrations & diagrams, decks, research & learning, reports, custom editors) — plus a set of guiding principles. Treat it as live reference: examples, palettes, interaction patterns, and category-specific conventions may have evolved since this skill was last written.

A minimal cached summary follows so the skill is usable even when the network is down, but the live page is authoritative.

### Cached principles (from `thariqs.github.io/html-effectiveness/`)

- **Spatial information deserves spatial output.** Diffs, call graphs, timelines, dependency maps, and architecture diagrams are flattened by Markdown and rendered meaningfully in HTML. If the picture is spatial, the medium must be.
- **Interaction replaces imagination.** Motion, click-throughs, and live tuners communicate what prose cannot: "felt" rather than described. Where the artifact has dynamic behaviour, ship the behaviour — not a description of it.
- **HTML is the native medium for design systems** — token swatches, component variant sheets, theming. Use it for any artifact whose subject matter is itself UI.
- **Always include an export button** in custom editors so UI work flows back into text the agent or codebase can consume. *"You stay in the loop; the loop gets tighter."* See §"Required interactive primitives → Decision queue" for the canonical export pattern.
- **The artifact is its own thesis.** A single `.html` file demonstrating spatial output, interactive behaviour, and exportable state is itself the argument for using HTML over Markdown.

### Cached category index (from `thariqs.github.io/html-effectiveness/`)

| Category | Typical artifacts | Patterns to draw on |
|---|---|---|
| Exploration & planning | side-by-side code approaches, design directions, implementation timelines | two-column grid, severity-chipped trade-off tables, Gantt-style `<svg>` timeline |
| Code review & understanding | annotated diffs with margin notes, PR writeups, module maps | annotated `<pre class="code">` blocks, `<svg>` box-and-arrow module map, comment cards pinned to hunks |
| Design | living design system, token swatches, variant sheets | `<table class="schema">` of tokens, component variant grid, copy-to-clipboard CSS values |
| Prototyping | animation sandbox with sliders, clickable multi-screen flows | `<input type="range">` driving CSS variables, tab/route switcher in vanilla JS |
| Illustrations & diagrams | inline `<svg>` figure sheets, interactive annotated flowcharts | hand-authored SVG, hover-revealed annotations, severity-coloured nodes |
| Decks | arrow-key navigable slides, no build step | `<section class="slide">` + 20-LoC keyboard handler, sticky slide counter |
| Research & learning | collapsible explainers, concept visualisations, glossaries | `<details>`, hover-linked terms, tabbed snippets |
| Reports | status reports with charts, incident post-mortems with timelines | inline `<svg>` charts, severity grid, timeline rail |
| Custom editors | drag-and-drop triage boards, feature flag toggles, live prompt tuners | minimal vanilla-JS state, **mandatory export button**, dependency warnings |

Use these as starting points, not constraints. When the right picture is not in the table, invent one — but honour the principles above.

---

## Output contract (always true)

- **One self-contained HTML file.** No external `<script src>`, `<link href>`, or `@import url(...)` to remote origins. System fonts only.
- **Offline-capable.** Opens correctly from `file://` with no network. The first paint is correct even before JS runs (JS only enhances).
- **Predictable filename.** The workflow command decides the path; default convention is `<artifact-type>_<slug>.html` at repo root (e.g., `rfc_auth-service.html`, `postmortem_2025-11-03_api-outage.html`).
- **Slug-scoped state.** All `localStorage` keys are prefixed with the artifact slug so multiple artifacts coexist in one browser without colliding. The workflow command provides the slug.
- **Editorial restraint.** No gradient backgrounds, no rainbow chrome, no spinning icons, no "AI assistant" aesthetics. The palette below is the palette.
- **Open at the end.** Once the file is written, open it in the user's default browser so review can start immediately (`open <path>` on macOS).

---

## Design system

### CSS variables (canonical — copy verbatim)

```css
:root {
  /* surfaces */
  --bg:           #fafaf7;
  --bg-elev:      #ffffff;
  --bg-sunken:    #f3f2ed;
  --rule:         #e2e0d6;
  --rule-strong:  #cdcabd;

  /* ink */
  --ink:          #1e1d1a;
  --ink-2:        #4a473f;
  --ink-3:        #807c70;
  --ink-4:        #a8a496;

  /* accent */
  --accent:       #4338ca;
  --accent-soft:  #eef0fb;

  /* severity (muted, editorial — used for chips, annot borders, summary grid cells) */
  --sev-crit:    #b91c1c;  --sev-crit-bg: #fbecec;
  --sev-high:    #b45309;  --sev-high-bg: #fdf3e3;
  --sev-med:     #927009;  --sev-med-bg:  #fbf6dc;
  --sev-low:     #1d4ed8;  --sev-low-bg:  #e9eefe;
  --sev-good:    #166534;  --sev-good-bg: #e3f1e6;
  --sev-q:       #6d28d9;  --sev-q-bg:    #efe9fb;

  /* diff */
  --diff-add:    #dff3df;
  --diff-add-2:  #b8e1b8;
  --diff-del:    #f8d4d4;
  --diff-del-2:  #ecb4b4;
  --diff-hunk:   #e9e8e0;

  /* type */
  --mono:  ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;
  --sans:  "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif;
  --serif: "Newsreader", "Source Serif Pro", Georgia, serif;
}
```

Workflow commands may add **additional** variables (e.g., status pills, role colours) but must not redefine the ones above.

### Typography hierarchy

| element | font | size | weight | letter-spacing |
|---|---|---|---|---|
| `h1` | serif | 56px / 1.04 | 500 | -0.02em |
| `h2` | serif | 38px / 1.10 | 500 | -0.015em |
| `h3` | sans  | 17px        | 600 | -0.005em |
| `h4` | mono  | 11.5px      | 600 | 0.06em (uppercase) |
| `p.lede` | serif | 20px / 1.5  | 400 | normal |
| body | sans | ~15.5px / 1.55 | 400 | normal, `font-feature-settings: "ss01","cv11"` |
| `.sectnum` | mono | 11px | 500 | 0.12em (uppercase) |

### Layout grid

- Page max-width: 1320px
- Two-column grid: `200px (side nav) | minmax(0, 1fr) (main)`, 56px column gap
- Side nav is `position: sticky; top: 72px;` and scrolls independently
- Top bar is `position: sticky; top: 0;` with a 92% opacity backdrop blur
- Sections separated by `.rule` divider (1px `var(--rule)`) — never relying purely on whitespace for structure

### Section anatomy

Every top-level section uses this skeleton so interactive plumbing (checkboxes, comment buttons, side-nav anchors) can attach uniformly:

```html
<section id="<section-slug>">
  <div class="sectnum">Section ## · <SHORT LABEL></div>
  <h2>Section title.</h2>
  <p class="lede">One-paragraph framing.</p>

  <!-- section body: prose, tables, code, diagrams, callouts -->

  <!-- workflow command may inject section-specific blocks here -->
</section>
```

---

## Visual richness — diagrams, charts, motion

Diagrams, graphs, and interactivity are **encouraged**. Pick the right tool for the picture; editorial restraint applies to ornamentation, not information density.

### Diagrams

| Picture type | Recommended tool | Notes |
|---|---|---|
| Box-and-arrow architecture | Inline hand-authored `<svg>` | ≤10 nodes, full control over typography and weight |
| Sequence / state / flow | Embed Mermaid via inline `<script>` block + `<script>` tag with the library content pasted in | Accept the ~500KB hit when the picture earns it; never load from CDN |
| Pre-rendered from excalidraw/figma | Export as SVG, inline the `<svg>` content directly | Preserves crispness at any zoom; no `<img src>` to local file |
| Quick text flow | `<pre class="ascii-flow">` block | Acceptable for ≤5-node flows or when a diagram would be overkill |
| Schema / ER | Inline `<svg>` or a `<table class="schema">` with mono cells | Tables are often cleaner than diagrams for relational structure |

Diagram styling rules:
- Stroke: `var(--ink-2)` at 1.5px for primary, `var(--ink-3)` at 1px for secondary
- Fill: `var(--bg-elev)` for node interiors, `var(--bg-sunken)` for grouping rectangles
- Text: monospace inside diagrams (use `var(--mono)`)
- Severity-coloured nodes use the same `--sev-*` variables as chips elsewhere — visual consistency between diagram and prose

### Charts

| Chart type | Recommended approach |
|---|---|
| Bar / column | Hand-authored `<svg>` with `<rect>` elements — usually ≤30 LoC for a one-off chart |
| Line / area | Hand-authored `<svg>` with `<path>` — compute the path string in the build step, embed the result |
| Sparkline | Inline `<svg>` adjacent to the metric, no axes |
| Scatter | Hand-authored `<svg>` with `<circle>` elements |
| Distribution | `<svg>` histogram or a compact `<table class="dist">` with bar-cells |

For anything more complex than that (interactive zoom, brush-select, etc.), use a tiny chart utility (`uplot`, ~40KB) inline. Avoid `d3` unless the picture genuinely needs it — its API surface and bundle size are rarely justified for review artifacts.

### Motion

Motion is allowed when it carries information:

- **State transitions** — checkbox tick, status pill flip, drawer slide-in (≤200ms, `cubic-bezier(0.22, 0.61, 0.36, 1)`)
- **Reveal-on-scroll** — used sparingly for hero animations, never for body content (a reviewer scrolling fast must not have content fade in late)
- **Hover affordances** — subtle background shifts on interactive elements, ≤80ms

Motion is **not** allowed for: pure decoration, looping animations, parallax, blink/pulse effects on non-error states.

### Interactivity beyond the required primitives

The required primitives below are the minimum. Workflow commands may add:
- Tab groups for grouping related content
- Collapsible `<details>` for long sub-sections
- Code-block "copy" buttons (no toast required; cursor flash is enough)
- Filter chips on tables (e.g., "show only High+")
- Zoom controls on large `<svg>` diagrams
- Sliders, toggles, drag-and-drop, prompt tuners — see the *Custom editors* row in the category index and apply the **export button** rule

Build new interactivity with vanilla JS only. No React, no Vue, no Alpine. The artifact must remain readable as static HTML if JS fails.

---

## Required interactive primitives

Every artifact built with `/html-artifact` has these. Workflow commands may extend them but must not omit them. **Skipping the text-range annotation system is the single most common regression** — when an artifact ships without it, reviewers lose the ability to point at specific words, and every comment ends up rephrased as a paraphrase of the original prose. Do not skip §4 below.

### 1. Section-level "reviewed" checkbox

- Inject a `<label class="section-reviewed">` into each top-level `<section>` header on load
- Persists to `localStorage` under `<slug>-checkboxes.v1` with prefix `section-`
- Checked → adds `.reviewed` class to the `<section>`; renders as dim opacity + struck-through section number
- Side-nav entry for that section gets a `<span class="check">✓</span>` when marked reviewed

### 2. Comment authoring (per-section)

- Each `<section>` gets a `＋ Add comment` button before its closing tag
- Click opens an inline `.comment-form`:
  - severity picker (pill row, 5 buttons: Concern / Suggest / Question / Praise / Nit — workflow may add more; defaults to Question)
  - title (required, text input)
  - body (required, textarea — Markdown OK; preserved verbatim via `white-space: pre-wrap`)
- Save → render as a `.comment` card pinned to the section, dashed border, "yours" badge, auto-queued, persisted under `<slug>-comments.v1`
- Each comment card has **Edit**, **Delete**, queue toggle, and **addressed** checkbox

### 3. Decision queue + floating tray

- Bottom-right `.review-tray` pill: `"<Queue label> (N)"` (workflow chooses the label: "Comments", "Decisions", "Findings", etc.)
- Click → slides in `.review-drawer` from the right (≤220ms slide)
- Drawer contents:
  - Header with title + subtitle ("N queued") + close `×`
  - Format selector dropdown (workflow may add format entries; the three baseline formats below are always present)
  - Primary `Copy` button + danger `Clear` button
  - Read-only `<textarea>` showing the generated output, or empty-state if nothing queued
- Escape, backdrop click, or close button dismisses
- Copy uses `navigator.clipboard.writeText` with `document.execCommand("copy")` fallback; shows a brief `.copied-toast` confirmation

This **is** the export button required by the "always include an export button" principle for custom editors. Honour it.

### 4. Text-range annotations (highlights) — **REQUIRED**

Reviewers must be able to select prose and attach a severity-tagged comment to that exact span. Annotations are the highlight-pen equivalent of the per-section comment form — same store, same queue, same exports — anchored to a text range instead of a section.

**Annotatable elements.** On `DOMContentLoaded`, after syntax highlighting runs, walk the main column and assign each leaf-most prose element a unique `data-aid` attribute and snapshot its `innerHTML` into a `pristine[aid]` registry. Default selector:

```
main p, main li, main td, main h2, main h3, main h4,
main blockquote, main .dod-body, main .callout, main .quote,
main pre.code
```

"Leaf-most" means: if an element matches but has a matching descendant, skip the outer one (so a `<td>` containing a `<ul><li>` gets `data-aid` only on the `li`). Skip anything inside `.comment`, `.comment-form`, `.annot-popover`, `.sidenav`, `.review-drawer`.

**Selection flow.**

1. On `mouseup`, if the current `Selection` is non-empty and the range start + end are both inside a single `[data-aid]` element, show a small `.annot-helper` button anchored to the selection's bounding rect: `＋ Annotate`.
2. Click on the helper → open `.annot-popover` near the selection with the same severity picker as the comment form, the quoted text as a non-editable preview block (`.ap-quote`), and a textarea for the comment body (body may be empty — saving with no body still records a coloured highlight).
3. Save → write a new entry into the existing `<slug>-comments.v1` store with an extra `anchor: { aid, start, end, text }` field, auto-queue it, re-render annotations, close the popover.

**Anchor offsets.** Compute `start` and `end` as character offsets into the element's `textContent` using the Range stringification trick:

```js
function rangeOffsets(range, el) {
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}
```

This survives nested inline elements (`<code>`, `<span class="hl-k">`, `<strong>`) reliably.

**Rendering marks.** A `renderAnnotations()` pass:

1. Resets every element in `lastRenderedAids ∪ currentAids` from its `pristine[aid]` snapshot (`el.innerHTML = pristine[aid]`).
2. Walks each affected element's text nodes via `TreeWalker`, finds substrings intersecting each annotation's `[start, end)`, wraps the matching slice in `<mark class="annot" data-sev="…" data-annot-id="…">`.
3. Updates `lastRenderedAids` for the next pass.

Re-rendering from pristine is what makes deletes, severity changes, and overlapping annotations all work without compounding DOM mutations.

**Visual.** Highlights use the same severity palette as chips:

```css
mark.annot                 { background: var(--sev-q-bg);    border-bottom: 2px solid var(--sev-q); padding: 0 1px; cursor: pointer; }
mark.annot:hover           { filter: brightness(0.95); }
mark.annot[data-sev=gap]   { background: var(--sev-crit-bg); border-bottom-color: var(--sev-crit); }
mark.annot[data-sev=risk]  { background: var(--sev-high-bg); border-bottom-color: var(--sev-high); }
mark.annot[data-sev=q]     { background: var(--sev-q-bg);    border-bottom-color: var(--sev-q); }
mark.annot[data-sev=dec]   { background: var(--sev-low-bg);  border-bottom-color: var(--sev-low); }
mark.annot[data-sev=nit]   { background: var(--bg-sunken);   border-bottom-color: var(--ink-3); }
mark.annot.addressed       { opacity: 0.5; }
mark.annot.flash           { filter: brightness(0.78); }
```

**Required DOM.** Render once near the end of `<body>`:

```html
<div class="annot-helper" id="annotHelper" role="button" tabindex="0" aria-label="Annotate selection">
  ＋ Annotate
</div>
<div class="annot-popover" id="annotPopover" role="dialog" aria-label="Annotation editor">
  <div class="ap-meta" id="apMeta">New annotation</div>
  <!-- .ap-quote, .ap-sev-picker, textarea, .ap-actions -->
</div>
```

**Editing.** Clicking an existing `<mark>` opens the same popover prefilled with severity + body, plus `Queue / Unqueue`, `Delete`, and (in the section's comment card) a `Jump to` button that scrolls to the mark and flashes it (`mark.annot.flash` for ~900ms).

**Card view.** Annotations also appear in the section's `.comments` list, rendered with a `<div class="c-quote">"…"</div>` block showing the anchored text and an "annotation" badge in place of "yours". They share the comment card's queue / addressed / delete actions.

**Accessibility.** The helper is a `role="button"` with `tabindex="0"` and reacts to Enter / Space. The popover dismisses on Escape and on outside `mousedown`. Marks remain Tab-navigable when given `tabindex="0"` — not strictly required, but add it inside `wrapTextRange` if the workflow needs strict keyboard parity.

### 5. Baseline export formats

Every artifact supports at least these three. **Anchored comments are exported with the quoted text as a Markdown blockquote** so the reader sees what was highlighted without needing the source HTML.

**Markdown** — paste into GitHub, Notion, or a Slack canvas:

```
## <Artifact title> — review notes

### Section <NN> · <section title>

**[GAP]** Comment title

Body paragraph.

**[CONCERN]** _Annotation_

> exact quoted text from the highlight

Body paragraph.
```

**Bullets** — paste into Slack thread (anchored comments use a truncated quoted snippet in place of the title):

```
*Section NN* — 2 items
  • [Concern] Title
  • [Question] "exact quoted text from the highlight…"
```

**gh CLI / Linear CLI / RFC seed / etc.** — workflow-specific shape for piping into the right ticketing surface.

### 6. Persistence schema

All `localStorage` keys are slug-prefixed:

```
<slug>-checkboxes.v1   → { ["section-…"]: true, ["addr-…"]: true, … }
<slug>-comments.v1     → { [commentId]: {
                             sectionId, sev, title, body,
                             queued, addressed, ts,
                             anchor?: { aid, start, end, text }   ← present iff annotation
                         } }
<slug>-queue.v1        → { [commentId]: { queued: bool, ts: int } }
```

The same `comments` store backs both per-section comments and text-range annotations — the only difference is whether `anchor` is set. The queue, exports, and review tray treat them uniformly.

Workflow commands may add their own slug-prefixed keys (e.g., `<slug>-status.v1`).

Reset hatch: expose `window.__<slug> = { clearAll(), exportState(), importState(json) }` for devtools access.

---

## Syntax highlighting

Apply to every code element rendered inside the artifact — annotated diffs, full diffs, fenced code blocks, schema snippets.

### Token precedence (top wins)

1. Comment (`# …` or `// …` to EOL)
2. String (`"…"` / `'…'` with `f` / `r` / `b` prefixes)
3. Decorator / annotation (`@name.attr`)
4. Keyword (`async`, `await`, `def`, `class`, `if`, `for`, `try`, `with`, `import`, `return`, `from`, `as`, `select`, `from`, `where`, `join`, etc.)
5. Builtin (`str`, `int`, `len`, `isinstance`, `Decimal`, `datetime`, `Optional`, `Literal`, etc.)
6. Number
7. CamelCase identifier (type names)

### Class assignments

```css
.hl-k { color: #6d28d9; font-weight: 500; }     /* keyword */
.hl-s { color: #047857; }                        /* string */
.hl-c { color: #807c70; font-style: italic; }   /* comment */
.hl-b { color: #0e7490; }                        /* builtin */
.hl-n { color: #b45309; }                        /* number */
.hl-d { color: #be185d; font-weight: 500; }     /* decorator */
.hl-t { color: #1e40af; }                        /* CamelCase type */
```

Implementation: inline regex-based highlighter, ≤80 LoC, runs on `DOMContentLoaded`. YAML, TOML, JSON, plain-text blocks render as unadorned monospace (no highlighter).

---

## Export — surviving GitHub & Notion renderers

The HTML → Markdown converter is the most fragile part of the system. The rules:

- Strip `<sup class="cite">` footnotes (they don't render outside the doc — convert to bracketed numbers inline if needed)
- Preserve fenced code blocks verbatim (incl. internal newlines)
- Convert `<div class="suggest">` to `\n\n> ` blockquote
- Convert inline `<code>`, `<b>`, `<i>`, `<a href>`, `<br>` to MD equivalents
- **Paragraph-normalise:** split on blank lines; for each paragraph that isn't a fenced code block or blockquote, collapse all whitespace runs to single spaces and trim

The paragraph-normalise rule is critical — GitHub treats 4+ space indents as code blocks, and Notion treats leading whitespace as significant. Raw HTML soft-wraps come out with the source-file indentation otherwise, breaking the paste.

---

## Composing with workflow commands

When a workflow command says "use `/html-artifact` conventions", it inherits everything in this file. The workflow command's job is to declare:

1. **Slug** — the artifact identifier used in filename + `localStorage` keys
2. **Sections** — what `<section>` blocks exist, in what order, with what content
3. **Queue label** — what the floating tray button says ("Comments", "Decisions", "Findings", "Action items")
4. **Severity pickers** — which severity labels appear in the comment form's picker (subset or superset of the default 5)
5. **Workflow-specific export formats** — additional entries in the drawer's format dropdown beyond the baseline three
6. **Workflow-specific `localStorage` keys** — additional state beyond the baseline three (e.g., status pill, role assignments)
7. **Workflow-specific design tokens** — additional CSS variables that build on the canonical palette

Do not redefine anything in this file. If the canonical palette doesn't work for the artifact, that is a signal to discuss the palette change here, not to fork it in the workflow command.

---

## Reproducibility checklist

Every artifact produced under `/html-artifact` should pass these:

- [ ] WebFetched `https://thariqs.github.io/html-effectiveness/` at the start of the run for current examples and principles
- [ ] Single self-contained HTML file at the agreed path
- [ ] No external script/style/font URLs (system fonts only)
- [ ] Opens correctly on first paint without JS
- [ ] Side nav lists every top-level section and stays in sync with scroll position
- [ ] Every section has: sectnum, title, lede paragraph, "Add comment" button, "section reviewed" checkbox
- [ ] Every code element has syntax highlighting (except hunk headers, meta lines, and plain-text languages)
- [ ] Every diagram is inline SVG, embedded Mermaid, or `<pre class="ascii-flow">` — no `<img src>` to local files
- [ ] Selecting prose anywhere in the main column reveals an `＋ Annotate` helper; saving creates a coloured `<mark>` that persists across reload
- [ ] Clicking an existing `<mark>` reopens its annotation in an editor with Queue, Delete, severity change
- [ ] Anchored comments export with their quoted text as a Markdown blockquote (verify in the drawer's MD output)
- [ ] Every interactive element works on the keyboard (Tab navigable, Enter/Space activates, Escape dismisses overlays)
- [ ] Floating tray opens a drawer with at least the three baseline export formats
- [ ] Markdown export survives GitHub *and* Notion paste (verify by pasting one comment into each)
- [ ] All state survives page reload via slug-prefixed `localStorage`
- [ ] Reset hatch exposed on `window.__<slug>` with `clearAll() / exportState() / importState(json)`
- [ ] Browser opened to the artifact at the end

---

## What this skill does NOT cover

- **What sections to include** — that is the workflow command's responsibility
- **How to gather content** — that is the underlying skill's responsibility (`agent-skills:spec-driven-development`, `agent-skills:debugging-and-error-recovery`, etc.)
- **Voice / tone** — `/baseprompt` handles persona
- **The scope of the problem under discussion** — workflow commands and their underlying skills must enforce scope discipline on the *content*. `/html-artifact` is form, not content.
