# Components

Write the markup below. `build.mjs` sees which classes and attributes the page uses and inlines only those components. Every component reads the theme variables, so it works in dark mode and at phone width with no extra CSS.

Tones: any element can carry `data-tone="crit|high|med|low|good|q|nit"`, which sets its severity colour.

Theme variables, for page-specific CSS and SVG fills (each one has a dark-mode value):

| Variable | Use |
|---|---|
| `--bg`, `--bg-elev`, `--bg-sunken` | page, raised surface, inset surface |
| `--ink`, `--ink-2`, `--ink-3`, `--ink-4` | text, from strongest to faintest |
| `--rule`, `--rule-strong` | borders and dividers |
| `--accent`, `--accent-soft` | links, the changed or happy path |
| `--sev-crit`, `--sev-high`, `--sev-med`, `--sev-low`, `--sev-good`, `--sev-q`, each with a `-bg` twin | severity ink and fills |
| `--diff-add`, `--diff-del`, `--diff-hunk` | diff backgrounds |
| `--mono`, `--sans`, `--serif` | font stacks |

## Page

| Markup | What it does |
|---|---|
| `header.masthead` with `p.eyebrow`, `h1`, `p.lede` | Title block. The eyebrow is the kind, subject and date; the lede is the one-sentence answer |
| `div.page > nav.toc + main` | Two-column layout. The TOC fills itself from each section's eyebrow and tracks scrolling |
| `main > section[id]` with `p.eyebrow` + `h2` | One section. Its eyebrow ("02 · Timeline") becomes the TOC label |
| `<details><summary>…</summary>…</details>` | Progressive disclosure for supporting detail |

## Text blocks

```html
<aside class="callout" data-tone="crit"><b>Partially fixed.</b> The code is fixed and the data is not.</aside>

<dl class="stats">
  <div><dt>Invoices affected</dt><dd>3,127</dd></div>
  <div data-tone="crit"><dt>Tax not collected</dt><dd>~$598K</dd></div>
</dl>

<p>The parser <span class="claim" data-evidence="verified">rejects malformed headers</span>.</p>

<!-- Cause chain: trigger to impact, defect step toned -->
<ol class="chain">
  <li>Staff set product codes by hand.</li>
  <li data-tone="crit"><b>Defect.</b> The adapter writes an empty config.</li>
  <li>Enrichment falls back to exempt, so tax due is 0.</li>
</ol>
```

## Checklists

Both lists get a live "N / M done" line, and ticks are saved per page.

```html
<!-- Ranked: numbered cards with a reason line, e.g. "where to look first" -->
<ol class="ranked">
  <li><label><input type="checkbox"> <b>F1:</b> list and detail count active certs the same way.</label><small>The block-worthy bug.</small></li>
</ol>

<!-- Action items with owners -->
<ul class="checklist">
  <li><label><input type="checkbox"> Cap prefetch in the worker config schema</label> <span class="owner">Dana · Fri</span></li>
</ul>
```

## Sequences

```html
<!-- Timestamped events, top to bottom -->
<ol class="timeline">
  <li data-tone="crit"><time>09:52</time> Backlog passes 50,000 jobs.</li>
  <li data-tone="good"><time>10:44</time> Backlog drains.</li>
</ol>

<!-- 3–6 steps with actors, numbered, in a row (a column on phones) -->
<ol class="stepper">
  <li><b>Edit ship date</b> saves in QBO</li>
  <li data-tone="crit"><b>AST recomputes</b> TotalTax → $0</li>
</ol>

<!-- Roadmap: lanes, bars placed by date, a today marker. data-status="planned" draws a dashed bar -->
<div class="roadmap" data-start="2026-10-01" data-end="2027-01-31" data-today="2026-11-10">
  <div class="lane" data-name="Platform">
    <span data-start="2026-10-01" data-end="2026-11-05" data-tone="good">Limiter core</span>
  </div>
</div>

<!-- A short process, left to right; arrows carry labels -->
<figure class="flow"><ol>
  <li>Client<small>browser or SDK</small></li>
  <li data-label="HTTPS">Edge proxy<small>global 5k rps</small></li>
  <li data-label="per key" data-tone="low">Rate limiter<small>token bucket</small></li>
</ol><figcaption>Where the limiter sits.</figcaption></figure>
```

## Diagrams

For anything with branches, stores or actors, write the diagram as text inside `figure.diagram` and follow `rules/diagrams.md`. The build lays the nodes out and draws the SVG, so you never write a coordinate.

```html
<figure class="diagram"><script type="text/diagram">
edge    = Edge proxy / global 5k rps
limiter = Rate limiter / token bucket [hot] # Holds one token bucket per API key.
redis   = Redis [store]
jobs    = Retry queue [queue]

| edge | limiter |
| jobs | redis   |

edge -> limiter : request
limiter --> redis : INCR
limiter ..> jobs : 429 + Retry-After [problem]
</script><figcaption>The limiter writes Redis asynchronously.</figcaption></figure>
```

| Line | Meaning |
|---|---|
| `id = Label / sublabel [kind] # detail` | A node. The kinds are `hot` (changed), `problem` (broken), `external` (third-party, dashed), `store` (cylinder) and `queue` (pill). The detail opens when the reader clicks the node |
| `\| a \| b \| . \|` | One grid row. It places nodes left to right, and `.` leaves a cell empty. Up to four nodes need no rows and sit in one line |
| `a -> b : label` | An edge. `->` is a synchronous call, `-->` is asynchronous (dashed) and `..>` is a fallback (dotted). End the line with `[hot]` or `[problem]` to colour it. Put spaces around the arrow |

The build prints a ✗ line for a diagram it can't draw well: an unknown node, more than 12 nodes or 4 columns, a label over 32 characters, or an edge that runs through another node. When an edge runs through a node, move the nodes in the grid rows.

Hand-draw SVG inside `figure.diagram` only for a shape the text can't express, such as a sequence diagram with lifelines. The kit adds arrowheads to every `.edge`, a Copy SVG button, and a detail panel for nodes that carry `data-detail`.

```html
<figure class="diagram">
  <svg viewBox="0 0 640 220" role="img" aria-label="Limiter and its store">
    <g class="node hot" data-detail="Holds one token bucket per API key."><rect x="250" y="40" width="160" height="56" rx="6"/><text x="330" y="68">rate limiter</text></g>
    <g class="node store"><path d="M260,160 a70,10 0 0 1 140,0 v40 a70,10 0 0 1 -140,0 z"/><text x="330" y="192">Redis</text></g>
    <path class="edge async" d="M330,96 L330,148"/>
    <g class="label"><rect x="338" y="112" width="70" height="18"/><text x="373" y="121">INCR</text></g>
  </svg>
  <figcaption>The limiter writes Redis asynchronously.</figcaption>
</figure>
```

| Class | Meaning |
|---|---|
| `node` + `hot` / `problem` / `external` / `store` | changed / broken / third-party (dashed) / data store |
| `edge` + `async` / `fallback` / `hot` / `problem` | solid sync call / dashed / dotted / accent / crit |
| `label` (a `rect` + `text`) | an edge label with a background, so crossings stay readable |
| `foreignObject` holding `div.fo` (plus an optional `<small>`) | a node label that wraps inside its box. Use it for any label longer than about 12 characters. `verify` reports a label that its box clips |

## Mockups

Show a screen, a dialog or a command's output as real HTML in a frame. The mock renders in a shadow root, so page styles don't reach it. Style it with inline styles or a `<style>` inside the template.

```html
<figure class="mock" data-frame="browser" data-w="440" data-url="postbox.app/compose">
  <template>
    <div style="padding:16px">
      <button>Send</button> <button data-ref="later">Send later ▾</button>
    </div>
  </template>
  <ol class="pins"><li data-ref="later"><b>New button.</b> Send is unchanged.</li></ol>
  <figcaption>The composer gains one button.</figcaption>
</figure>

<figure class="mock" data-frame="terminal" data-title="postbox"><template><span class="dim">&gt;</span> postbox send --at "mon 8:00"
<span class="g">✓</span> Scheduled for <b>Mon 8:00</b></template></figure>
```

| Attribute | What it sets |
|---|---|
| `data-frame` | `none` (the default), `browser`, `phone` or `terminal` |
| `data-w` | The width you design at, in px. The default is 440, or 375 for a phone. The mock shrinks to fit a narrower column |
| `data-url`, `data-title` | The text in a browser or terminal bar |
| `ol.pins > li[data-ref]` | A numbered pin. Its badge sits beside the template element with the same `data-ref`, and its text is listed under the mock. Put `data-ref` on the smallest element that makes the point |

Draw the smallest region that makes the point: one card, one menu, one row. A terminal mock keeps its line breaks, and the classes `dim`, `g`, `r`, `y` and `b` colour its text.

## Numbers

```html
<!-- Segment widths follow --v, so they stay proportional -->
<div class="bar" role="img" aria-label="Collected versus missing tax">
  <span style="--v:319" data-tone="good">$319K collected</span>
  <span style="--v:598" data-tone="crit">$598K missing</span>
</div>
```

For anything else numeric, draw an SVG chart that follows `rules/charts.md`.

## Code

```html
<!-- Syntax colours for python, js, ts, sql, bash -->
<pre><code class="language-python">def load(path): ...</code></pre>

<!-- Code that exists in the repo. The build fills the block from the file, so never retype it -->
<pre data-src="core/sync.py" data-lines="10-24"></pre>

<!-- A unified diff; lines get added, removed and hunk colours -->
<pre class="diff" data-file="core/sync.py"><code>@@ -10,4 +10,5 @@
-    db.save(config)
+    if config:
+        db.save(config)</code></pre>
```

A `data-src` path resolves under `--root`, which defaults to the directory you run the build from. The build refuses a path outside the root, a file named like a secrets file and a slice that holds a secret-shaped string. It prints a `code from:` line that lists every file the page now holds. In code you type by hand, write `&lt;` for every `<`.

## Tables

A plain `<table>` gets the theme's table style and scrolls inside its own box on a phone. Put numbers in cells with `class="num"` (on the `th` too), which right-aligns them in tabular figures.

```html
<!-- Past ~15 rows: click a header to sort, filter box, live row count, Copy CSV -->
<table data-sortable>…</table>

<!-- Weighted comparison: weights become sliders, totals and the winner update live -->
<table class="matrix">
  <thead><tr><th>Option</th><th class="num" data-weight="5">Burst safety</th><th class="num" data-weight="3">Simplicity</th><th class="num">Total</th></tr></thead>
  <tbody><tr><td>Token bucket</td><td class="num">9</td><td class="num">6</td><td class="num total"></td></tr></tbody>
</table>
<p class="verdict"></p>
```

## Decisions

```html
<!-- The default is pre-selected and marked recommended. The export reports chosen, default kept or not opened -->
<div class="ask" data-id="redis-down" data-default="open">
  <p><b>When Redis is unavailable, the limiter should…</b></p>
  <label><input type="radio" name="redis-down" value="open"> Fail open and allow traffic</label>
  <label><input type="radio" name="redis-down" value="closed"> Fail closed and return 503</label>
</div>

<!-- Shown only under that answer, so the reader sees what each option changes. Use id=value or id!=value -->
<p data-if="redis-down=closed">Then a Redis outage takes the API down with it.</p>
```

A button in the corner counts the decisions the reader hasn't opened yet and jumps to the next one.

## Code review

See `types/code-review.md`. The building blocks are as follows.

- `div.annotated[data-file]` holds a `pre.diff` and an `ol.notes`. A `⟦F1⟧` at the end of a diff line becomes a badge linked to note `#F1`. The block also gets a split/unified toggle and a files index with viewed ticks.
- `table.findings` has one `tr[data-tone]` per finding.
- `ol.risk` has one `li[data-tone][style="--w:0–100"]` per file.

## Interactive blocks

Each one registers its state with `HA.register`. The state is saved, restored after a rebuild, and included in Send to Claude.

| Markup | Read |
|---|---|
| `div.testplan > section.tp-flow > div.tp-step` with an Action / Pass / Watch `dl` | `types/testplan.md` |
| `div.explorer[data-facets][data-time]` wrapping a JSON `<script>` of rows | `types/explorer.md` |
| `div.erd > table.entity[data-name]` with `tr[data-pk]` and `tr[data-ref]` | `types/erd.md` |
| `ul.mindmap` (a nested list) | `types/mindmap.md` |
| `div.variants > article.variant` with `ul.pros` and `ul.cons` | `types/brainstorm.md` |
| `form.playground[data-target]` with named inputs and `button[data-preset]` | `types/playground.md` |
| `body.deck` with `main > section.slide` and `aside.notes` | `types/deck.md` |
| `ol.editor-list[data-labels][data-tones]` of `li[data-id]` | `types/editor.md` |

```html
<!-- Brainstorm grid: pick one, shortlist, reject, take notes, compare two -->
<div class="variants" data-id="layout">
  <article class="variant" data-id="a"><h3>Tabs</h3><p>Settings split across four tabs.</p>
    <ul class="pros"><li>Short pages</li></ul><ul class="cons"><li>Search can't span tabs</li></ul></article>
  <article class="variant" data-id="b"><h3>One long page</h3>…</article>
</div>

<!-- Playground: each named input writes --name (with data-unit) onto the target, live -->
<form class="playground" data-id="toast" data-target="#preview">
  <label>Duration <input type="range" name="duration" min="100" max="1000" value="300" data-unit="ms"></label>
  <label>Easing <select name="easing"><option>ease-out</option><option>linear</option></select></label>
  <button type="button" data-preset='{"duration":150}'>Snappy</button>
</form>
<div id="preview" style="transition: transform var(--duration) var(--easing)">…</div>
```
