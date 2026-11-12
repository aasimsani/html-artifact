import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { lint } from '../skills/html-artifact/scripts/lint.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<div class="ask" data-id="redis-down" data-default="open">
  <p><b>When Redis is unavailable, the limiter should…</b></p>
  <label><input type="radio" name="redis-down" value="open"> Fail open and allow traffic</label>
  <label><input type="radio" name="redis-down" value="closed"> Fail closed and return 503</label>
</div>
<div class="ask" data-id="internal-keys" data-default="exempt">
  <p><b>Should internal keys be exempt?</b></p>
  <label><input type="radio" name="internal-keys" value="exempt"> Exempt them</label>
  <label><input type="radio" name="internal-keys" value="limit"> Limit them like any key</label>
</div>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

const state = p => p.eval(`HA.blocks()`);

test('auto mode inlines the ask component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="ask"/);
});

test('decision blocks pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('an untouched decision reports not opened, with the default marked recommended', async () => {
  const p = await browser.open(fx.url);
  const s = await state(p);
  const rec = await p.eval(`document.querySelector('.ask[data-id="redis-down"] label:has(input[value="open"])').textContent`);
  await p.close();
  assert.equal(s['ask:redis-down'].state.status, 'not opened');
  assert.equal(s['ask:redis-down'].state.answer, 'open');
  assert.match(rec, /recommended/i);
});

test('confirming the default reports default kept; picking another reports chosen', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`document.querySelector('.ask[data-id="redis-down"] input[value="open"]').click();
    document.querySelector('.ask[data-id="internal-keys"] input[value="limit"]').click()`);
  const s = await state(p);
  await p.close();
  assert.deepEqual(s['ask:redis-down'].state, { answer: 'open', status: 'default kept', note: '' });
  assert.deepEqual(s['ask:internal-keys'].state, { answer: 'limit', status: 'chosen', note: '' });
  assert.match(s['ask:internal-keys'].summary, /chosen: Limit them like any key/);
});

test('answers and notes survive a reload', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`(() => { const t = document.querySelector('.ask[data-id="internal-keys"] textarea'); t.value = 'Batch jobs need limits too.'; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const s = await state(again);
  const checked = await again.eval(`document.querySelector('.ask[data-id="internal-keys"] input:checked').value`);
  await again.close();
  assert.equal(checked, 'limit');
  assert.equal(s['ask:internal-keys'].state.note, 'Batch jobs need limits too.');
});

// ---- Consequences and navigation. This page has its own file, so it starts with nothing answered. ----

const NAV = `${BODY}
<p id="if-closed" data-if="redis-down=closed">Then every request fails while Redis is down.</p>
<aside class="callout" id="if-open" data-if="redis-down!=closed">Then traffic is unlimited while Redis is down.</aside>
<div style="height:1600px"></div>`;
let nav;
before(() => { nav = fixture(doc(NAV), 'nav'); });

const shown = p => p.eval(`['if-closed', 'if-open'].map(id => document.getElementById(id).checkVisibility())`);
// Forget this page's saved answers only, because every fixture shares one localStorage.
const RESET = `Object.keys(localStorage).filter(k => k.includes(location.pathname)).forEach(k => localStorage.removeItem(k))`;
const pick = (id, value) => `document.querySelector('.ask[data-id="${id}"] input[value="${value}"]').click()`;

test('a page with consequences and the answer button passes verify', async () => {
  const [r] = await verify([nav.file]);
  assert.deepEqual(r.problems, []);
});

test('a data-if block shows only under its answer, starting from the recommended one', async () => {
  const p = await browser.open(nav.url);
  const before = await shown(p);
  await p.eval(pick('redis-down', 'closed'));
  const after = await shown(p);
  await p.close();
  assert.deepEqual(before, [false, true]);
  assert.deepEqual(after, [true, false]);
  const again = await browser.open(nav.url);
  assert.deepEqual(await shown(again), [true, false], 'a restored answer shows its consequence');
  await again.eval(RESET);
  await again.close();
});

test('a button counts the decisions not opened yet and jumps to the next one', async () => {
  const p = await browser.open(nav.url);
  const label = () => p.eval(`(() => { const b = document.querySelector('button.ask-next'); return b.hidden ? null : b.textContent; })()`);
  const first = await label();
  await p.eval(`scrollTo(0, 1200); document.querySelector('button.ask-next').click()`);
  const landed = await p.eval(`(() => { const box = document.querySelector('.ask[data-id="redis-down"]'), r = box.getBoundingClientRect();
    return { inView: r.top >= 0 && r.bottom <= innerHeight, focused: box.contains(document.activeElement), status: HA.blocks()['ask:redis-down'].state.status }; })()`);
  await p.eval(pick('redis-down', 'open'));
  const second = await label();
  await p.eval(`document.querySelector('button.ask-next').click()`);
  const focusedSecond = await p.eval(`document.querySelector('.ask[data-id="internal-keys"]').contains(document.activeElement)`);
  await p.eval(pick('internal-keys', 'limit'));
  const done = await label();
  await p.eval(RESET);
  await p.close();
  assert.equal(first, '2 to answer');
  assert.deepEqual(landed, { inView: true, focused: true, status: 'not opened' }, 'jumping to a decision does not answer it');
  assert.equal(second, '1 to answer');
  assert.ok(focusedSecond);
  assert.equal(done, null);
});

test('on a phone the answer button stays off the first screen until the reader scrolls', async () => {
  const p = await browser.open(nav.url, { width: 400 });
  const opacity = () => p.eval(`getComputedStyle(document.querySelector('button.ask-next')).opacity`);
  // The button fades over 150 ms, so the test waits for the fade to end before each read.
  await p.eval(`new Promise(r => setTimeout(r, 400))`);
  const atTop = await opacity();
  await p.eval(`scrollTo(0, 900); new Promise(r => setTimeout(r, 400))`);
  const scrolled = await opacity();
  await p.close();
  assert.equal(atTop, '0');
  assert.equal(scrolled, '1');
});

test('lint flags a data-if that names no decision or no option', () => {
  const page = extra => doc(`${BODY}${extra}`);
  assert.deepEqual(lint(doc(NAV)), []);
  assert.match(lint(page('<p data-if="nope=open">x</p>'))[0], /data-if="nope=open" names no decision block/);
  assert.match(lint(page('<p data-if="redis-down=maybe">x</p>'))[0], /data-if="redis-down=maybe": "maybe" is not an option of "redis-down" \(open, closed\)/);
  assert.match(lint(page('<p data-if="redis-down">x</p>'))[0], /data-if="redis-down" should look like id=value or id!=value/);
});
