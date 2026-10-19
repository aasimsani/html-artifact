import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<form class="playground" data-id="motion" data-target="#preview">
  <label>Duration <input type="range" name="duration" min="100" max="1000" value="300" data-unit="ms"></label>
  <label>Easing <select name="easing"><option value="ease">ease</option><option value="linear">linear</option></select></label>
  <label><input type="checkbox" name="bounce"> Bounce</label>
  <button type="button" data-preset='{"duration":150}'>Snappy</button>
  <button type="reset">Reset</button>
  <button type="button" data-action="copy">Copy values</button>
</form>
<div id="preview">Preview box</div>`;

let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the playground component for this markup', () => {
  const fx = fixture(doc(BODY));
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="playground"/);
});

test('the playground passes verify in both themes at both widths', async () => {
  const fx = fixture(doc(BODY));
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('moving a range updates the target CSS variable and the readout', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const input = document.querySelector('input[name="duration"]');
    input.value = 700;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const preview = document.querySelector('#preview');
    return { cssVar: getComputedStyle(preview).getPropertyValue('--duration').trim(), readout: input.nextElementSibling.textContent };
  })()`);
  await p.close();
  assert.equal(r.cssVar, '700ms');
  assert.equal(r.readout, '700ms');
});

test('a preset button applies its values', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('[data-preset]').click();
    const input = document.querySelector('input[name="duration"]');
    return { value: input.value, cssVar: getComputedStyle(document.querySelector('#preview')).getPropertyValue('--duration').trim() };
  })()`);
  await p.close();
  assert.equal(r.value, '150');
  assert.equal(r.cssVar, '150ms');
});

test('reset restores the markup defaults', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const input = document.querySelector('input[name="duration"]');
    input.value = 900;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('button[type="reset"]').click();
    return new Promise(resolve => setTimeout(() => resolve({
      value: input.value,
      cssVar: getComputedStyle(document.querySelector('#preview')).getPropertyValue('--duration').trim(),
    }), 50));
  })()`);
  await p.close();
  assert.equal(r.value, '300');
  assert.equal(r.cssVar, '300ms');
});

test('values survive a reload', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    const input = document.querySelector('input[name="duration"]');
    input.value = 650;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const value = await again.eval(`document.querySelector('input[name="duration"]').value`);
  await again.close();
  assert.equal(value, '650');
});

test('HA.blocks() shows the changed values with a before-and-after summary', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const blocks = await p.eval(`(() => {
    const input = document.querySelector('input[name="duration"]');
    input.value = 150;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return HA.blocks();
  })()`);
  await p.close();
  const block = blocks['playground:motion'];
  assert.equal(block.state.values.duration, '150ms');
  assert.equal(block.summary, 'duration 300ms → 150ms');
});
