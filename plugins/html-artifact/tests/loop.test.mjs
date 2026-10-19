import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { build } from '../skills/html-artifact/scripts/build.mjs';
import { doc, fixture } from './helpers.mjs';

const HEAD = '<meta name="review-labels" content="needs a test: write a failing test before changing code | out of scope: remove this from the document">';
const v1 = '<p id="t">The limiter allows one hundred requests per second for each key, with a burst of three hundred.</p>';
const v2 = '<p id="t">The limiter allows two hundred requests per second for each key, with a burst of three hundred.</p>';

let fx, browser;
before(async () => { fx = fixture(doc(v1, HEAD)); browser = await launch(); });
after(() => browser.close());

async function selectText(p, text) {
  await p.eval(`(() => {
    const el = document.getElementById('t');
    const n = [...el.childNodes].find(x => x.nodeType === 3 && x.textContent.includes(${JSON.stringify(text)}));
    const i = n.textContent.indexOf(${JSON.stringify(text)});
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${text.length});
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  })(); new Promise(r => setTimeout(r, 50))`);
  await p.eval(`document.querySelector('.rv-helper').click()`);
}

test('a delete annotation exports as a removal of the quoted text', async () => {
  const p = await browser.open(fx.url);
  await selectText(p, 'with a burst of three hundred');
  await p.eval(`(() => { const pop = document.querySelector('.rv-popover');
    pop.querySelector('[data-kind="delete"]').click(); pop.querySelector('[data-action="save"]').click(); })()`);
  const md = await p.eval(`HA.review.export('markdown')`);
  const struck = await p.eval(`!!document.querySelector('mark.rv-mark[data-kind="delete"]')`);
  await p.close();
  assert.ok(struck);
  assert.match(md, /\*\*\[Delete\]\*\*[\s\S]*> with a burst of three hundred/);
});

test('a replace annotation exports the replacement text', async () => {
  const p = await browser.open(fx.url);
  await selectText(p, 'one hundred');
  await p.eval(`(() => { const pop = document.querySelector('.rv-popover');
    pop.querySelector('[data-kind="replace"]').click();
    pop.querySelector('textarea.rv-replacement').value = 'two hundred';
    pop.querySelector('[data-action="save"]').click(); })()`);
  const md = await p.eval(`HA.review.export('markdown')`);
  await p.close();
  assert.match(md, /\*\*\[Replace\]\*\*[\s\S]*> one hundred[\s\S]*Replace with: two hundred/);
});

test('a quick label fills the comment and sends its hidden tip to the agent', async () => {
  const p = await browser.open(fx.url);
  await selectText(p, 'for each key');
  await p.eval(`(() => { const pop = document.querySelector('.rv-popover');
    [...pop.querySelectorAll('.rv-qlabel')].find(b => b.textContent === 'needs a test').click();
    pop.querySelector('[data-action="save"]').click(); })()`);
  const json = JSON.parse(await p.eval(`HA.review.export('json')`));
  await p.close();
  const c = json.comments.find(x => x.quote === 'for each key');
  assert.equal(c.label, 'needs a test');
  assert.equal(c.tip, 'write a failing test before changing code');
});

test('a general comment belongs to no section and exports under General', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    document.querySelector('.rv-tray').click();
    document.querySelector('.rv-drawer .rv-general').click();
    const form = document.querySelector('.rv-drawer .rv-editor');
    form.querySelector('textarea').value = 'Add a rollout plan.';
    form.querySelector('[data-action="save"]').click();
  })()`);
  const md = await p.eval(`HA.review.export('markdown')`);
  await p.close();
  assert.match(md, /### General\n\n\*\*\[[^\]]+\]\*\*\n\nAdd a rollout plan\./);
});

test('the side panel lists every comment with its quote, in document order', async () => {
  const p = await browser.open(fx.url);
  const items = await p.eval(`(() => {
    document.querySelector('.rv-tray').click();
    document.querySelector('.rv-drawer [data-tab="list"]').click();
    return [...document.querySelectorAll('.rv-drawer .rv-list-item q')].map(q => q.textContent);
  })()`);
  await p.close();
  assert.deepEqual(items, ['one hundred', 'for each key', 'with a burst of three hundred']);
});

test('after the agent edits a section, it shows what changed since the reader last looked', async () => {
  writeFileSync(fx.file, build(doc(v2, HEAD)));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const sec = document.getElementById('one');
    const btn = sec.querySelector('.rv-changed-btn');
    btn?.click();
    return { changed: sec.classList.contains('rv-changed'), ins: [...sec.querySelectorAll('.rv-diff ins')].map(x => x.textContent.trim()), del: [...sec.querySelectorAll('.rv-diff del')].map(x => x.textContent.trim()) };
  })()`);
  await p.close();
  assert.ok(r.changed);
  assert.deepEqual(r.ins, ['two']);
  assert.deepEqual(r.del, ['one']);
});

test('a share link carries the review into a browser that has none', async () => {
  const p = await browser.open(fx.url);
  const link = await p.eval(`HA.review.shareLink()`);
  await p.eval(`HA.review.clear()`);
  await p.close();
  const again = await browser.open(link);
  const n = await again.eval(`new Promise(r => setTimeout(() => r(HA.review.state().comments.length), 300))`);
  const hash = await again.eval(`location.hash`);
  await again.close();
  assert.equal(n, 4);
  assert.equal(hash, '');
});
