// Profile the v2 runtime on large pages: build size, load time, and review-kit init time with
// many stored comments. Run: node perf.mjs   (prints one row per size × comment count)
import { mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../plugins/html-artifact/skills/html-artifact/scripts/build.mjs';
import { launch } from '../plugins/html-artifact/skills/html-artifact/scripts/cdp.mjs';

const SENT = 'The sync job overwrote the product mapping with an empty value, so every invoice after that fell back to the exempt default and charged no tax in registered states. ';
const page = n => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Perf ${n}</title></head><body>
<header class="masthead"><h1>Perf page with ${n} sections.</h1></header><div class="page"><nav class="toc"></nav><main>
${Array.from({ length: n }, (_, i) => `<section id="s${i}"><p class="eyebrow">${String(i + 1).padStart(2, '0')} · Part ${i}</p><h2>Section ${i} heading.</h2>
${Array.from({ length: 8 }, (_, j) => `<p>Paragraph ${j} of section ${i}. ${SENT.repeat(3)}</p>`).join('\n')}
<table><tr>${Array.from({ length: 6 }, (_, k) => `<td>${i * 10 + k}</td>`).join('')}</tr></table>
<ol class="timeline"><li><time>09:4${i % 10}</time> Event ${i} happened.</li><li><time>10:0${i % 10}</time> Event ${i} recovered.</li></ol>
</section>`).join('\n')}
</main></div></body></html>`;

// Comments anchored to real text spread across the sections.
const comments = (n, k) => Array.from({ length: k }, (_, i) => {
  const s = i % n, j = i % 8;
  return { id: `c${i}`, sectionId: `s${s}`, sev: 'concern', body: `Comment ${i}`, ts: i,
    anchor: { text: `Paragraph ${j} of section ${s}.`, prefix: '', suffix: ' The sync job' } };
});

const browser = await launch();
const dir = mkdtempSync(join(tmpdir(), 'ha-perf-'));
console.log('sections  KB  comments  domReady ms  review-init ms  marks');
for (const n of [10, 40, 120]) {
  const file = join(dir, `perf-${n}.html`);
  writeFileSync(file, build(page(n)));
  const url = pathToFileURL(file).href;
  const kb = Math.round(statSync(file).size / 1024);
  for (const k of [0, 50, 200]) {
    const seed = await browser.open(url);
    await seed.eval(`localStorage.setItem('html-artifact:' + location.pathname + ':review.v2', ${JSON.stringify(JSON.stringify({ reviewed: {}, comments: comments(n, k) }))})`);
    await seed.close();
    const runs = [];
    for (let r = 0; r < 3; r++) {
      const p = await browser.open(url);
      runs.push(await p.eval(`({ dom: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
        init: performance.getEntriesByName('ha:review-init')[0].duration, marks: document.querySelectorAll('mark.rv-mark').length })`));
      await p.close();
    }
    const med = key => runs.map(x => x[key]).sort((a, b) => a - b)[1];
    console.log(`${String(n).padStart(8)}  ${String(kb).padStart(3)}  ${String(k).padStart(8)}  ${med('dom').toFixed(0).padStart(11)}  ${med('init').toFixed(1).padStart(14)}  ${runs[0].marks}`);
  }
}
await browser.close();
