import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../skills/html-artifact/scripts/build.mjs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';

const para = 'The sync job overwrote the product mapping with an empty value, so every invoice after that fell back to the exempt default. ';
const SRC = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="components" content="shell"><title>Shell fixture</title></head>
<body>
<header class="masthead"><p class="eyebrow">Postmortem · Acme</p><h1>Shell fixture page.</h1></header>
<div class="page"><nav class="toc"></nav><main>
${['summary', 'timeline', 'cause', 'fixes', 'method'].map((id, i) => `<section id="${id}">
<p class="eyebrow">0${i + 1} · ${id}</p><h2>Section about ${id}.</h2><p class="lede">${para}</p>
${Array(6).fill(`<p>${para.repeat(3)}</p>`).join('\n')}
${i === 1 ? `<table><tr>${Array(12).fill('<td>wide_column_value_123</td>').join('')}</tr></table>
<pre><code>SELECT invoice_id, product_config, tax_amount FROM reporting_line_items WHERE org_id = 'org_1234567890abcdef' AND tax_amount = 0;</code></pre>
<svg viewBox="0 0 900 120" width="900" height="120"><rect x="1" y="1" width="898" height="118" fill="none" stroke="currentColor"/><text x="20" y="60" font-size="16">a 900px wide figure</text></svg>` : ''}
</section>`).join('\n')}
</main></div></body></html>`;

let dir, url, browser;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'shell-test-'));
  writeFileSync(join(dir, 'page.html'), build(SRC));
  url = pathToFileURL(join(dir, 'page.html')).href;
  browser = await launch();
});
after(() => browser.close());

test('a built page passes verify in both themes at desktop and phone width', async () => {
  const [r] = await verify([join(dir, 'page.html')]);
  assert.deepEqual(r.problems, []);
});

test('the toc lists every section by its eyebrow label, without the number', async () => {
  const page = await browser.open(url);
  const links = await page.eval(`[...document.querySelectorAll('nav.toc a')].map(a => [a.getAttribute('href'), a.textContent.trim()])`);
  await page.close();
  assert.equal(links.length, 5);
  assert.deepEqual(links[0], ['#summary', 'summary']);
});

test('the toc falls back to the h2 when a section has no eyebrow', async () => {
  const dir2 = mkdtempSync(join(tmpdir(), 'shell-test-'));
  writeFileSync(join(dir2, 'p.html'), build(SRC.replace('<p class="eyebrow">01 · summary</p>', '')));
  const page = await browser.open(pathToFileURL(join(dir2, 'p.html')).href);
  const first = await page.eval(`document.querySelector('nav.toc a').textContent.trim()`);
  await page.close();
  assert.equal(first, 'Section about summary.');
});

test('the theme toggle switches to dark and the choice survives a reload', async () => {
  const page = await browser.open(url);
  const before = await page.eval('getComputedStyle(document.body).backgroundColor');
  await page.eval(`document.querySelector('[data-theme-toggle]').click()`);
  const theme = await page.eval('document.documentElement.dataset.theme');
  const afterBg = await page.eval('getComputedStyle(document.body).backgroundColor');
  await page.close();
  assert.equal(theme, 'dark');
  assert.notEqual(afterBg, before);
  const again = await browser.open(url);
  assert.equal(await again.eval('document.documentElement.dataset.theme'), 'dark');
  await again.eval(`document.querySelector('[data-theme-toggle]').click()`);
  await again.close();
});

test('scroll-spy marks the visible section link as current', async () => {
  const page = await browser.open(url);
  // IntersectionObserver fires asynchronously, and late under a loaded CPU, so poll with a deadline.
  const current = await page.eval(`(async () => {
    document.getElementById('fixes').scrollIntoView();
    const href = () => document.querySelector('nav.toc a[aria-current="true"]')?.getAttribute('href');
    for (const end = Date.now() + 3000; href() !== '#fixes' && Date.now() < end;) await new Promise(r => setTimeout(r, 50));
    return href();
  })()`);
  await page.close();
  assert.equal(current, '#fixes');
});
