# Code review, PR writeup

The diff is the spine of the page, and the findings attach to it. A busy reviewer reads the first screen and the blocking items.

## Spine

1. **Masthead.** The eyebrow names the PR and branch. The `h1` says what the PR does, in plain words. The lede gives the verdict ("Approve once F1 is answered").
2. **Verdict strip.** `dl.stats` with the count of findings per severity, toned (`crit` for blocking, `high` for should-fix, `nit` for nits). Then two or three sentences of TL;DR.
3. **Where to look first.** `ol.ranked`, one item per finding in reviewer order. Each item has a checkbox, the claim and one line of why it ranks there.
4. **Findings index.** `table.findings` with one row per finding: id, severity, `file:line`, and a one-line claim. Ids link to the annotated diff below.
5. **Annotated diff.** One `div.annotated` per file that has findings. Each holds a `pre.diff` of the real hunks and an `ol.notes` of margin notes. Mark a line with `data-note="F1"` on the `<code>` line span in the source, or by writing `⟦F1⟧` at the end of the line. Notes stay under 40 words and carry a Conventional Comments label: issue, suggestion, question, nit or praise, plus `blocking` when it is.
6. **Risk map.** Optional for small PRs. `ol.risk`, one item per file, toned by how exposed it is, with a short reason.
7. **Tests.** What the tests prove, and what they don't.

## Markup

```html
<div class="annotated" data-file="core/sync.py">
  <pre class="diff"><code>@@ -10,4 +10,5 @@
-    db.save(config)
+    if config:            ⟦F1⟧
+        db.save(config)</code></pre>
  <ol class="notes">
    <li id="F1" data-tone="crit"><b>issue · blocking</b> An empty config skips the save, so a cleared field never persists.</li>
  </ol>
</div>
```

## Avoid

- Prose about the diff with no diff on the page.
- Comments interleaved between code lines.
- A wall of praise. Note what's good once, briefly.
- Pretending you reviewed files you skimmed. Say what you skipped.
