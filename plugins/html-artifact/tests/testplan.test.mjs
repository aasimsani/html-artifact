import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<div class="testplan" data-id="checkout">
  <section class="tp-flow" data-title="New user checkout" data-minutes="15">
    <div class="tp-step" data-id="f1-s1">
      <dl><dt>Action</dt><dd>Add an item to the cart, then run <code>checkout --guest</code>.</dd>
      <dt>Pass</dt><dd>The order confirmation page shows the item and total.</dd>
      <dt>Watch</dt><dd>Tax should match the shipping address, not the billing one.</dd></dl>
    </div>
    <div class="tp-step" data-id="f1-s2">
      <dl><dt>Action</dt><dd>Apply a 10% discount code at checkout.</dd>
      <dt>Pass</dt><dd>The total updates before payment.</dd>
      <dt>Watch</dt><dd>Rounding on the discounted tax line.</dd></dl>
    </div>
  </section>
  <section class="tp-flow" data-title="Returning customer" data-minutes="8">
    <div class="tp-step" data-id="f2-s1">
      <dl><dt>Action</dt><dd>Sign in and reorder a saved cart.</dd>
      <dt>Pass</dt><dd>Saved address and card are prefilled.</dd>
      <dt>Watch</dt><dd>Stale saved card after expiry.</dd></dl>
    </div>
  </section>
</div>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the testplan component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="testplan"/);
});

test('testplan passes verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('setting a step to fail updates the global bar and its flow sub-bar', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const step = document.querySelector('.tp-step[data-id="f1-s1"]');
    const before = document.querySelector('.tp-summary').textContent;
    [...step.querySelectorAll('.tp-control button')].find(b => b.textContent === 'Fail').click();
    return {
      before,
      after: document.querySelector('.tp-summary').textContent,
      flow: step.closest('.tp-flow').querySelector('.tp-flow-summary').textContent,
      fillWidth: step.closest('.tp-flow').querySelector('.tp-fill.tp-fail').style.width,
    };
  })()`);
  await p.close();
  assert.equal(r.before, '0/3 resolved · 0 fail · 0 blocked');
  assert.equal(r.after, '1/3 resolved · 1 fail · 0 blocked');
  assert.equal(r.flow, '1/2');
  assert.equal(r.fillWidth, '50%');
});

test('choosing fail reveals the notes textarea, pass does not', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const step = document.querySelector('.tp-step[data-id="f1-s2"]');
    const click = label => [...step.querySelectorAll('.tp-control button')].find(b => b.textContent === label).click();
    click('Fail');
    const failHidden = step.querySelector('.tp-notes').hidden;
    click('Pass');
    const passHidden = step.querySelector('.tp-notes').hidden;
    return { failHidden, passHidden };
  })()`);
  await p.close();
  assert.equal(r.failHidden, false);
  assert.equal(r.passHidden, true);
});

test('the search box hides steps that do not match', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const input = document.querySelector('.tp-toolbar input[type=search]');
    input.value = 'discount'; input.dispatchEvent(new Event('input'));
    return [...document.querySelectorAll('.tp-step')].map(s => !s.hidden);
  })()`);
  await p.close();
  assert.deepEqual(r, [false, true, false]);
});

test('step state survives a reload', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`[...document.querySelector('.tp-step[data-id="f2-s1"]').querySelectorAll('.tp-control button')].find(b => b.textContent === 'Blocked').click()`);
  await p.close();
  const again = await browser.open(fx.url);
  const status = await again.eval(`document.querySelector('.tp-step[data-id="f2-s1"]').dataset.status`);
  await again.close();
  assert.equal(status, 'blocked');
});

test('HA.blocks() carries the testplan results and summary', async () => {
  const p = await browser.open(fx.url);
  const blocks = await p.eval(`(() => {
    [...document.querySelector('.tp-step[data-id="f1-s1"]').querySelectorAll('.tp-control button')].find(b => b.textContent === 'Pass').click();
    return HA.blocks();
  })()`);
  await p.close();
  const block = blocks['testplan:checkout'];
  assert.equal(block.state.results.length, 3);
  const s1 = block.state.results.find(r => r.id === 'f1-s1');
  assert.deepEqual(s1, { id: 'f1-s1', flow: 'New user checkout', step: 'Add an item to the cart, then run checkout --guest.', status: 'pass', notes: '' });
  // f1-s2 was set to pass and f2-s1 to blocked by earlier tests in this file, which share the fixture's localStorage.
  assert.equal(block.state.summary.pass, 2);
  assert.equal(block.state.summary.blocked, 1);
  assert.match(block.summary, /resolved/);
});
