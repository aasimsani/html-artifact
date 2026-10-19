import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const HEAD = '<meta name="review-severities" content="Issue, Suggestion, Question, Nit, Praise">';
const BODY = `
<dl class="stats"><div data-tone="crit"><dt>Blocking</dt><dd>1</dd></div><div data-tone="nit"><dt>Nits</dt><dd>1</dd></div></dl>
<table class="findings"><thead><tr><th>ID</th><th>Severity</th><th>Where</th><th>Finding</th></tr></thead><tbody>
  <tr data-tone="crit"><td><a href="#F1">F1</a></td><td>issue · blocking</td><td><code>core/sync.py:12</code></td><td>An empty config skips the save.</td></tr>
  <tr data-tone="nit"><td><a href="#F2">F2</a></td><td>nit</td><td><code>core/api.py:3</code></td><td>Name the constant.</td></tr>
</tbody></table>
<ol class="risk">
  <li data-tone="crit" style="--w:90"><code>core/sync.py</code> runs on every sync</li>
  <li data-tone="good" style="--w:20"><code>core/api.py</code> one constant</li>
</ol>
<div class="annotated" data-file="core/sync.py">
<pre class="diff"><code>@@ -10,4 +10,5 @@ def sync(product):
     config = product.config
-    db.save(config)
+    if config:            ⟦F1⟧
+        db.save(config)
     return config</code></pre>
<ol class="notes"><li id="F1" data-tone="crit"><b>issue · blocking</b> An empty config skips the save, so a cleared field never persists.</li></ol>
</div>
<div class="annotated" data-file="core/api.py">
<pre class="diff"><code>@@ -1,3 +1,3 @@
-TIMEOUT = 30
+TIMEOUT = 45 ⟦F2⟧</code></pre>
<ol class="notes"><li id="F2" data-tone="nit"><b>nit</b> Name the constant after what it bounds.</li></ol>
</div>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY, HEAD)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the code component for a code review', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="code"/);
});

test('a code review page passes verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('line markers become numbered badges linked to their notes', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const line = document.querySelector('.annotated .ln[data-note="F1"]');
    return { text: line.textContent, badge: line.querySelector('a.mark')?.getAttribute('href'), noteHasBadge: !!document.querySelector('#F1 .mark') };
  })()`);
  await p.close();
  assert.doesNotMatch(r.text, /⟦/);
  assert.equal(r.badge, '#F1');
  assert.ok(r.noteHasBadge);
});

test('clicking a line badge marks its note active', async () => {
  const p = await browser.open(fx.url);
  const active = await p.eval(`document.querySelector('.ln[data-note="F2"] a.mark').click(), document.querySelector('#F2').classList.contains('active')`);
  await p.close();
  assert.ok(active);
});

test('a files index tracks viewed files and the ticks survive a reload', async () => {
  const p = await browser.open(fx.url);
  const before = await p.eval(`document.querySelector('nav.files .count').textContent`);
  await p.eval(`document.querySelector('nav.files input').click()`);
  await p.close();
  const again = await browser.open(fx.url);
  const after = await again.eval(`[document.querySelector('nav.files .count').textContent, document.querySelector('.annotated').classList.contains('viewed')]`);
  await again.close();
  assert.equal(before, '0 / 2 viewed');
  assert.deepEqual(after, ['1 / 2 viewed', true]);
});

test('the split toggle shows removed lines on the left and added lines on the right', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.annotated button.split-toggle').click();
    const split = document.querySelector('.annotated .split');
    const left = [...split.querySelectorAll('.side.old .ln')].map(l => l.className.split(' ')[1]);
    const right = [...split.querySelectorAll('.side.new .ln')].map(l => l.className.split(' ')[1]);
    return { left, right, unifiedHidden: document.querySelector('.annotated pre.diff').hidden };
  })()`);
  await p.close();
  assert.ok(r.unifiedHidden);
  assert.ok(r.left.includes('del') && !r.left.includes('add'), JSON.stringify(r.left));
  assert.ok(r.right.includes('add') && !r.right.includes('del'), JSON.stringify(r.right));
});

test('review comments on code carry a blocking flag and a suggested replacement into the export', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    const code = document.querySelector('.annotated pre.diff code');
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode()) && !n.textContent.includes('db.save')) {}
    const i = n.textContent.indexOf('db.save');
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 7);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })(); new Promise(r => setTimeout(r, 50))`);
  await p.eval(`(() => {
    document.querySelector('.rv-helper').click();
    const pop = document.querySelector('.rv-popover');
    pop.querySelector('[data-sev="issue"]').click();
    pop.querySelector('input.rv-blocking').click();
    pop.querySelector('textarea').value = 'Save even when empty.';
    pop.querySelector('textarea.rv-suggestion').value = 'db.save(config or {})';
    pop.querySelector('[data-action="save"]').click();
  })()`);
  const md = await p.eval(`HA.review.export('markdown')`);
  await p.close();
  assert.match(md, /\*\*\[Issue · blocking\]\*\*/);
  assert.match(md, /```suggestion\ndb\.save\(config or \{\}\)\n```/);
});
