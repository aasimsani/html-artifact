import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<div class="variants" data-id="layout">
  <article class="variant" data-id="a">
    <h3>Sidebar nav</h3>
    <p>A persistent left sidebar lists every section, so depth is always visible.</p>
    <ul class="pros"><li>Always visible</li></ul>
    <ul class="cons"><li>Costs horizontal space</li></ul>
  </article>
  <article class="variant" data-id="b">
    <h3>Top tabs</h3>
    <p>Sections sit behind a tab bar at the top of the page.</p>
    <ul class="pros"><li>Saves width</li></ul>
    <ul class="cons"><li>Hides deep sections</li></ul>
  </article>
  <article class="variant" data-id="c">
    <h3>Command palette</h3>
    <p>A searchable palette jumps straight to any section by name.</p>
    <ul class="pros"><li>Fast for power users</li></ul>
    <ul class="cons"><li>Undiscoverable for new users</li></ul>
  </article>
</div>`;

let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the variants component for this markup', () => {
  const fx = fixture(doc(BODY));
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="variants"/);
});

test('the brainstorm grid passes verify in both themes at both widths', async () => {
  const fx = fixture(doc(BODY));
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('picking a variant unpicks the previous winner', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const a = document.querySelector('.variant[data-id="a"]');
    const b = document.querySelector('.variant[data-id="b"]');
    a.querySelector('[data-action="pick"]').click();
    const afterA = { a: a.classList.contains('picked'), b: b.classList.contains('picked') };
    b.querySelector('[data-action="pick"]').click();
    const afterB = { a: a.classList.contains('picked'), b: b.classList.contains('picked') };
    return { afterA, afterB };
  })()`);
  await p.close();
  assert.deepEqual(r.afterA, { a: true, b: false });
  assert.deepEqual(r.afterB, { a: false, b: true });
});

test('rejecting a variant dims it', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const opacity = await p.eval(`(() => {
    const c = document.querySelector('.variant[data-id="c"]');
    const before = getComputedStyle(c).opacity;
    c.querySelector('[data-action="reject"]').click();
    return { before, after: getComputedStyle(c).opacity };
  })()`);
  await p.close();
  assert.equal(opacity.before, '1');
  assert.ok(parseFloat(opacity.after) < 1, `expected a dimmed rejected variant, got opacity ${opacity.after}`);
});

test('notes persist across a reload', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    const textarea = document.querySelector('.variant[data-id="a"] textarea');
    textarea.value = 'Ship this one if nav depth stays under three.';
    textarea.dispatchEvent(new Event('input'));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const value = await again.eval(`document.querySelector('.variant[data-id="a"] textarea').value`);
  await again.close();
  assert.equal(value, 'Ship this one if nav depth stays under three.');
});

test('HA.blocks() reports picked, shortlisted, rejected and notes', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const blocks = await p.eval(`(() => {
    document.querySelector('.variant[data-id="a"] [data-action="pick"]').click();
    document.querySelector('.variant[data-id="b"] [data-action="shortlist"]').click();
    document.querySelector('.variant[data-id="c"] [data-action="shortlist"]').click();
    document.querySelector('.variant[data-id="c"] [data-action="reject"]').click();
    const textarea = document.querySelector('.variant[data-id="a"] textarea');
    textarea.value = 'Simplest to build.';
    textarea.dispatchEvent(new Event('input'));
    return HA.blocks();
  })()`);
  await p.close();
  const block = blocks['variants:layout'];
  assert.equal(block.state.picked, 'a');
  assert.deepEqual(block.state.shortlisted, ['b', 'c']);
  assert.deepEqual(block.state.rejected, ['c']);
  assert.equal(block.state.notes.a, 'Simplest to build.');
  assert.equal(block.summary, 'picked a · shortlisted b, c · rejected c');
});
