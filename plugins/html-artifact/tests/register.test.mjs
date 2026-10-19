import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

// A tiny interactive block that follows the HA.register contract: a counter.
const BODY = `
<div id="counter"><button type="button">+1</button> <output>0</output></div>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const box = document.getElementById('counter');
  let n = 0;
  const show = () => { box.querySelector('output').textContent = n; };
  HA.register('counter', {
    el: box,
    state: () => ({ n }),
    restore: s => { n = s.n; show(); },
    summary: () => 'clicked ' + n + ' times',
  });
  box.querySelector('button').addEventListener('click', () => { n++; show(); HA.changed('counter'); });
});
</script>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('a registered block restores its saved state after a reload', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`document.querySelector('#counter button').click(); document.querySelector('#counter button').click()`);
  await p.close();
  const again = await browser.open(fx.url);
  const shown = await again.eval(`document.querySelector('#counter output').textContent`);
  await again.close();
  assert.equal(shown, '2');
});

test('the review json export carries every block state', async () => {
  const p = await browser.open(fx.url);
  const json = JSON.parse(await p.eval(`HA.review.export('json')`));
  await p.close();
  assert.deepEqual(json.blocks.counter, { state: { n: 2 }, summary: 'clicked 2 times' });
});

test('the markdown export lists each block summary', async () => {
  const p = await browser.open(fx.url);
  const md = await p.eval(`HA.review.export('markdown')`);
  await p.close();
  assert.match(md, /### Interactive state\n\n- \*\*counter\*\*: clicked 2 times/);
});

test('the review kit marks how long its init took', async () => {
  const p = await browser.open(fx.url);
  const ms = await p.eval(`performance.getEntriesByName('ha:review-init')[0]?.duration ?? -1`);
  await p.close();
  assert.ok(ms >= 0, 'no ha:review-init measure');
});
