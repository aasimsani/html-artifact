# References — copy-pasteable HTML artifact snippets

Battle-tested code blocks extracted from real artifacts produced under this skill (`pr_review.html`, `spec_auth-service.html`, `plan_auth-service.html`). Drop these into a new artifact instead of re-deriving them.

| File | What it gives you |
|---|---|
| [`starter-template.html`](./starter-template.html) | Complete bootable single-file skeleton with every required primitive wired in. Use as the starting point. |
| [`design-system.css`](./design-system.css) | Canonical `:root` palette, typography, chips, callouts, page grid |
| [`annotations.html`](./annotations.html) | Text-range annotation system — DOM, CSS, full JS (data-aid walker, pristine snapshot pass, TreeWalker mark injection, popover positioning) |
| [`comments.html`](./comments.html) | Per-section comment form + comment card render + section-reviewed checkbox + sidenav check sync |
| [`decision-queue.html`](./decision-queue.html) | Floating tray, slide-in drawer, clipboard with fallback, `.copied-toast` |
| [`export-formats.js`](./export-formats.js) | `htmlToMd()` with paragraph-normalisation, Markdown / Bullets / gh-CLI renderers, anchored-comment blockquote handling |
| [`syntax-highlighter.js`](./syntax-highlighter.js) | ≤80-LoC regex highlighter (Python + JS + SQL) with token classes |
| [`persistence.js`](./persistence.js) | Slug-prefixed localStorage schema + `clearAll()` / `exportState()` / `importState()` reset hatch |
| [`sidenav-scrollspy.js`](./sidenav-scrollspy.js) | Sticky side-nav with active-section highlight + per-section progress bars |
| [`annotated-diff.html`](./annotated-diff.html) | Two-column annotated diff (code left, annotation cards right) + full unified diff with dual line numbers |

**How to use:** start from `starter-template.html` and pull in feature files as the artifact needs them. The starter wires the four required primitives (§1–§4 of `SKILL.md`); the other files are stand-alone modules whose contents drop into the right `<style>` / `<script>` blocks.

**Naming convention used in the snippets:**

- `SLUG` — the artifact identifier (e.g., `rfc-auth-service`). Used as the prefix for `localStorage` keys and the global reset-hatch object.
- `__commentStore` — the single source of truth for both per-section comments and text-range annotations. Anchored entries have a non-null `anchor: { aid, start, end, text }`.
- `data-aid` — per-prose-element identifier injected at load. Pairs with `pristine[aid]` (innerHTML snapshot before any marks are applied) so re-renders are idempotent.
- `SEVERITIES` — workflow-supplied array of `{ id, label }` objects fed into the comment-form picker.

Customise `SLUG`, `SEVERITIES`, and the queue label per artifact; everything else can stay verbatim.
