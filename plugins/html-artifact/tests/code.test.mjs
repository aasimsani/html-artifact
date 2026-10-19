import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<pre class="diff" data-file="core/sync.py"><code>@@ -10,4 +10,5 @@ def sync(product):
     config = product.config
-    db.save(config)
+    if config:
+        db.save(config)
     return config</code></pre>
<pre><code class="language-python">@retry(times=3)
def load(path: str) -> dict:
    # read the cached copy first
    return json.loads(open(path, "r").read())  # fast path</code></pre>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the code component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="code"/);
});

test('code blocks pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('diff lines are classed as added, deleted or hunk header', async () => {
  const p = await browser.open(fx.url);
  const counts = await p.eval(`['add', 'del', 'hunk'].map(c => document.querySelectorAll('pre.diff .ln.' + c).length)`);
  await p.close();
  assert.deepEqual(counts, [2, 1, 1]);
});

test('the highlighter marks keywords, strings, comments and decorators', async () => {
  const p = await browser.open(fx.url);
  const got = await p.eval(`Object.fromEntries(['k', 's', 'c', 'd'].map(c =>
    [c, [...document.querySelectorAll('code.language-python .hl-' + c)].map(e => e.textContent)]))`);
  await p.close();
  assert.ok(got.k.includes('def') && got.k.includes('return'), JSON.stringify(got.k));
  assert.ok(got.s.includes('"r"'), JSON.stringify(got.s));
  assert.ok(got.c.some(c => c.startsWith('# read the cached')), JSON.stringify(got.c));
  assert.ok(got.d.includes('@retry'), JSON.stringify(got.d));
});

test('a highlight inside highlighted code survives a reload', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    const code = document.querySelector('code.language-python');
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode()) && !n.textContent.includes('json.loads')) {}
    const i = n.textContent.indexOf('json.loads');
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 'json.loads'.length);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })(); new Promise(r => setTimeout(r, 50))`);
  await p.eval(`document.querySelector('.rv-helper').click();
    document.querySelector('.rv-popover textarea').value = 'Use the cache helper.';
    document.querySelector('.rv-popover [data-action=save]').click()`);
  await p.close();
  const again = await browser.open(fx.url);
  const marked = await again.eval(`[...document.querySelectorAll('code mark.rv-mark')].map(m => m.textContent).join('')`);
  await again.close();
  assert.equal(marked, 'json.loads');
});
