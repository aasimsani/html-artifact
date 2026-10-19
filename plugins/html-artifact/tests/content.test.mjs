import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<aside class="callout" data-tone="crit"><b>Partially fixed.</b> The code is fixed and the data is not.</aside>
<dl class="stats">
  <div><dt>Invoices affected</dt><dd>3,127</dd></div>
  <div data-tone="crit"><dt>Tax not collected</dt><dd>~$598K</dd></div>
  <div><dt>Registered states</dt><dd>35</dd></div>
</dl>
<div class="bar" role="img" aria-label="Collected versus missing tax">
  <span style="--v:319" data-tone="good">$319K collected</span>
  <span style="--v:104" data-tone="crit">$104K TPP</span>
  <span style="--v:494" data-tone="high">~$494K SaaS</span>
</div>
<p>The parser <span class="claim" data-evidence="verified">rejects malformed headers</span>, and it probably <span class="claim" data-evidence="guess">retries twice</span>.</p>
<ol class="chain">
  <li>Staff set product codes by hand.</li>
  <li>A catalog re-sync ran over them.</li>
  <li data-tone="crit"><b>Defect.</b> The adapter emits an empty config, so the sync blanked them.</li>
</ol>
<ol class="ranked">
  <li><label><input type="checkbox"> <b>F1:</b> list and detail count active certs the same way.</label><small>The block-worthy bug.</small></li>
  <li><label><input type="checkbox"> <b>F2:</b> add a convergence test.</label><small>Stops F1 coming back.</small></li>
</ol>
<ul class="checklist">
  <li><label><input type="checkbox"> Cap prefetch in the worker config schema</label> <span class="owner">Dana · Fri</span></li>
  <li><label><input type="checkbox"> Alert on backlog age over 10 minutes</label> <span class="owner">Ravi · next sprint</span></li>
</ul>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines only the content component for this markup', () => {
  const html = readFileSync(fx.file, 'utf8');
  assert.match(html, /data-component="content"/);
  assert.doesNotMatch(html, /data-component="(timeline|diagram|code|table)"/);
});

test('content blocks pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('bar segments are proportional to their --v values', async () => {
  const p = await browser.open(fx.url);
  const w = await p.eval(`[...document.querySelectorAll('.bar > span')].map(s => s.getBoundingClientRect().width)`);
  await p.close();
  const total = w.reduce((a, b) => a + b, 0);
  [319, 104, 494].forEach((v, i) => assert.ok(Math.abs(w[i] / total - v / 917) < 0.02, `segment ${i} is ${w[i] / total}`));
});

test('the cause chain numbers its links', async () => {
  const p = await browser.open(fx.url);
  const marks = await p.eval(`[...document.querySelectorAll('.chain > li')].map(li => getComputedStyle(li, '::before').content)`);
  await p.close();
  // Chrome reports a counter-based ::before as counter(name), so assert the counter is wired to every link.
  assert.ok(marks.length === 3 && marks.every(m => /^counter\(/.test(m)), JSON.stringify(marks));
});

test('checklists show progress, and ticks survive a reload', async () => {
  const p = await browser.open(fx.url);
  const before = await p.eval(`document.querySelector('ol.ranked').previousElementSibling.textContent`);
  await p.eval(`document.querySelector('ol.ranked input').click()`);
  const after = await p.eval(`document.querySelector('ol.ranked').previousElementSibling.textContent`);
  await p.close();
  const again = await browser.open(fx.url);
  const kept = await again.eval(`[document.querySelector('ol.ranked input').checked, document.querySelector('ul.checklist').previousElementSibling.textContent]`);
  await again.close();
  assert.equal(before, '0 / 2 done');
  assert.equal(after, '1 / 2 done');
  assert.deepEqual(kept, [true, '0 / 2 done']);
});
