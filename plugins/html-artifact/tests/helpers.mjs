// Shared fixture helpers: wrap markup in a page, build it in auto mode, and open it in Chrome.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from '../skills/html-artifact/scripts/build.mjs';

export const doc = (body, head = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title>${head}</head><body>
<header class="masthead"><h1>Fixture.</h1></header>
<div class="page"><nav class="toc"></nav><main>
<section id="one"><p class="eyebrow">01 · One</p><h2>Section one.</h2>
<p>This paragraph is long enough for the verify probe to select text inside it without trouble.</p>
${body}
</section></main></div></body></html>`;

// Build `html` into a fresh temp dir and return { file, url }.
export function fixture(html, name = 'page') {
  const dir = mkdtempSync(join(tmpdir(), 'ha-test-'));
  const file = join(dir, `${name}.html`);
  writeFileSync(file, build(html));
  return { file, url: pathToFileURL(file).href };
}
