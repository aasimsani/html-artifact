import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../skills/html-artifact/scripts/build.mjs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';

const TARGET = 'the sync job overwrote the product mapping';
const page = (cause = `On June 1 ${TARGET} with an empty value, so invoices fell back to the exempt default.`) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="components" content="review"><title>Review fixture</title></head><body>
<header class="masthead"><h1>Review fixture.</h1></header>
<div class="page"><nav class="toc"></nav><main>
<section id="summary"><p class="eyebrow">01 · Summary</p><h2>What happened.</h2>
<p>Acme invoices charged no tax on taxable products for about six weeks before anyone noticed the gap.</p></section>
<section id="cause"><p class="eyebrow">02 · Cause</p><h2>Why it happened.</h2>
<p>${cause}</p></section>
</main></div></body></html>`;

let dir, file, url, browser;
const write = html => writeFileSync(file, build(html));

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'review-test-'));
  file = join(dir, 'review.html');
  url = pathToFileURL(file).href;
  write(page());
  browser = await launch();
});
after(() => browser.close());

// Select `text` inside #cause with a real mouse drag.
async function select(p, text) {
  const at = await p.eval(`(() => {
    const el = document.querySelector('#cause p:not(.eyebrow)');
    const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.includes(${JSON.stringify(text)}));
    const i = node.textContent.indexOf(${JSON.stringify(text)});
    const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + ${text.length});
    const rects = r.getClientRects(); const a = rects[0], b = rects[rects.length - 1];
    return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
  })()`);
  await p.drag(at.x1, at.y1, at.x2, at.y2);
  await new Promise(r => setTimeout(r, 150));
}

test('a built review page passes verify', async () => {
  const [r] = await verify([file]);
  assert.deepEqual(r.problems, []);
});

test('selecting text and saving a comment highlights exactly that text', async () => {
  const p = await browser.open(url);
  await select(p, TARGET);
  await p.eval(`document.querySelector('.rv-helper').click()`);
  await p.eval(`(() => {
    const pop = document.querySelector('.rv-popover');
    pop.querySelector('[data-sev="concern"]').click();
    pop.querySelector('textarea').value = 'Which sync job?';
    pop.querySelector('[data-action="save"]').click();
  })()`);
  const marked = await p.eval(`[...document.querySelectorAll('mark.rv-mark')].map(m => m.textContent).join('')`);
  await p.close();
  assert.equal(marked, TARGET);
});

test('the highlight and its card survive a reload', async () => {
  const p = await browser.open(url);
  const marked = await p.eval(`[...document.querySelectorAll('mark.rv-mark')].map(m => m.textContent).join('')`);
  const card = await p.eval(`document.querySelector('#cause .rv-card')?.textContent || ''`);
  await p.close();
  assert.equal(marked, TARGET);
  assert.match(card, /Which sync job\?/);
});

test('the highlight re-anchors after the agent edits text around it', async () => {
  write(page(`A new sentence was added first. On June 1 ${TARGET} with an empty value, so invoices fell back.`));
  const p = await browser.open(url);
  const marked = await p.eval(`[...document.querySelectorAll('mark.rv-mark')].map(m => m.textContent).join('')`);
  await p.close();
  assert.equal(marked, TARGET);
});

test('a comment whose text was deleted is marked outdated instead of lost', async () => {
  write(page('The cause section was rewritten and no longer mentions the old wording.'));
  const p = await browser.open(url);
  const marks = await p.eval(`document.querySelectorAll('mark.rv-mark').length`);
  const outdated = await p.eval(`document.querySelector('#cause .rv-card.rv-outdated')?.textContent || ''`);
  await p.close();
  write(page());
  assert.equal(marks, 0);
  assert.match(outdated, /Which sync job\?/);
});

test('the reviewed checkbox persists and ticks the toc entry', async () => {
  const p = await browser.open(url);
  await p.eval(`document.querySelector('#summary .rv-check input').click()`);
  await p.close();
  const again = await browser.open(url);
  const state = await again.eval(`[document.querySelector('#summary .rv-check input').checked,
    document.querySelector('nav.toc a[href="#summary"]').classList.contains('rv-done')]`);
  await again.close();
  assert.deepEqual(state, [true, true]);
});

test('a section comment without a selection is saved as a card', async () => {
  const p = await browser.open(url);
  await p.eval(`(() => {
    document.querySelector('#summary .rv-add').click();
    const form = document.querySelector('#summary .rv-form');
    form.querySelector('[data-sev="question"]').click();
    form.querySelector('textarea').value = 'Six weeks from which date?';
    form.querySelector('[data-action="save"]').click();
  })()`);
  const card = await p.eval(`document.querySelector('#summary .rv-card')?.textContent || ''`);
  await p.close();
  assert.match(card, /Six weeks from which date\?/);
});

test('the markdown export quotes highlighted text and labels severity', async () => {
  const p = await browser.open(url);
  const md = await p.eval(`HA.review.export('markdown')`);
  await p.close();
  assert.match(md, /\*\*\[Concern\]\*\*/);
  assert.match(md, new RegExp(`> ${TARGET}`));
  assert.match(md, /Which sync job\?/);
  assert.match(md, /Six weeks from which date\?/);
});

test('the json export names the section, quote and surrounding text of each comment', async () => {
  const p = await browser.open(url);
  const json = JSON.parse(await p.eval(`HA.review.export('json')`));
  await p.close();
  const c = json.comments.find(x => x.quote === TARGET);
  assert.equal(c.section, 'cause');
  assert.equal(c.severity, 'Concern');
  assert.match(c.prefix, /On June 1 $/);
  assert.equal(json.reviewed[0], 'summary');
});

test('the tray counts open comments and the drawer shows the export', async () => {
  const p = await browser.open(url);
  const label = await p.eval(`document.querySelector('.rv-tray').textContent`);
  await p.eval(`document.querySelector('.rv-tray').click()`);
  const out = await p.eval(`document.querySelector('.rv-drawer textarea').value`);
  await p.close();
  assert.match(label, /2/);
  assert.match(out, /Which sync job\?/);
});
