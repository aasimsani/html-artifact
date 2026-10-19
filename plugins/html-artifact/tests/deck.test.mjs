import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { fixture } from './helpers.mjs';

const para = 'This slide carries enough body text for the verify probe to find a long paragraph to select.';
const slide = (n, extra = '') => `<section class="slide" id="s${n}"><p class="eyebrow">Slide ${n}</p><h2>Slide ${n} heading.</h2><p>${para}</p>${extra}</section>`;

const SRC = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Deck fixture</title></head>
<body class="deck">
<header class="masthead"><h1>Deck fixture.</h1></header>
<div class="page"><nav class="toc"></nav><main>
${slide(1)}
${slide(2, '<aside class="notes">Remember to mention the rollback plan.</aside>')}
${slide(3)}
${slide(4)}
</main></div></body></html>`;

// Each HA.register'd deck persists its state keyed by the fixture's own file path, so every test
// below that touches navigation gets a fresh fixture: sharing one would leak state between tests.
let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the deck component', () => {
  const fx = fixture(SRC, 'deck');
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="deck"/);
});

test('the default review view passes verify in both themes at both widths', async () => {
  const fx = fixture(SRC, 'deck');
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('present mode shows exactly one visible slide', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    return [...document.querySelectorAll('.slide')].filter(s => s.checkVisibility()).map(s => s.id);
  })()`);
  await p.close();
  assert.deepEqual(r, ['s1']);
});

test('arrow keys advance the slide and the counter', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    const current = document.querySelector('.slide.current').id;
    const count = document.querySelector('.deck-counter').textContent;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    return { current, count, back: document.querySelector('.slide.current').id };
  })()`);
  await p.close();
  assert.equal(r.current, 's3');
  assert.equal(r.count, '3 / 4');
  assert.equal(r.back, 's2');
});

test('home and end jump to the first and last slide', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    const last = document.querySelector('.slide.current').id;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    const first = document.querySelector('.slide.current').id;
    return { last, first };
  })()`);
  await p.close();
  assert.equal(r.last, 's4');
  assert.equal(r.first, 's1');
});

test('N toggles speaker notes for the current slide', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    const shown = document.querySelector('.deck-notes-panel').hidden;
    const text = document.querySelector('.deck-notes-panel').textContent;
    return { shown, text };
  })()`);
  await p.close();
  assert.equal(r.shown, false);
  assert.match(r.text, /rollback plan/);
});

test('escape or the exit button leaves present mode', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return document.body.classList.contains('deck-presenting');
  })()`);
  await p.close();
  assert.equal(r, false);
});

test('the url hash tracks the current slide', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  const hash = await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    return location.hash;
  })()`);
  await p.close();
  assert.equal(hash, '#s2');
});

test('presenting state survives a reload', async () => {
  const fx = fixture(SRC, 'deck');
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    document.querySelector('.deck-present-btn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const r = await again.eval(`({ presenting: document.body.classList.contains('deck-presenting'), current: document.querySelector('.slide.current').id })`);
  await again.close();
  assert.equal(r.presenting, true);
  assert.equal(r.current, 's3');
});
