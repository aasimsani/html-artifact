import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
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
