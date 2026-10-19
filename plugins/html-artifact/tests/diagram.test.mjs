import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<figure class="flow"><ol>
  <li>Client<small>browser or SDK</small></li>
  <li data-label="HTTPS">Edge proxy<small>global 5k rps</small></li>
  <li data-label="per key" data-tone="low">Rate limiter<small>token bucket</small></li>
</ol><figcaption>Where the limiter sits.</figcaption></figure>
<figure class="diagram">
  <svg viewBox="0 0 640 220" role="img" aria-label="Limiter and its store">
    <g class="node" data-detail="Terminates TLS and enforces the global 5k rps cap."><rect x="10" y="40" width="160" height="56" rx="6"/><text x="90" y="72">edge proxy</text></g>
    <g class="node hot" data-detail="Holds one token bucket per API key."><rect x="250" y="40" width="160" height="56" rx="6"/><text x="330" y="72">rate limiter</text></g>
    <g class="node store"><path d="M260,160 a70,10 0 0 1 140,0 v40 a70,10 0 0 1 -140,0 z"/><text x="330" y="192">Redis</text></g>
    <path class="edge" d="M170,68 L248,68"/>
    <path class="edge async" d="M330,96 L330,148"/>
    <g class="label"><rect x="180" y="44" width="60" height="18"/><text x="210" y="57">request</text></g>
  </svg>
  <figcaption>The limiter reads and writes Redis on every request.</figcaption>
</figure>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the diagram component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="diagram"/);
});

test('flow and svg diagram pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('flow lays out as a row on desktop and a column on a phone', async () => {
  const pos = async width => {
    const p = await browser.open(fx.url, { width });
    const r = await p.eval(`[...document.querySelectorAll('.flow li')].map(li => { const b = li.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; })`);
    await p.close();
    return r;
  };
  const desk = await pos(1280), phone = await pos(400);
  assert.ok(desk.every(([, y]) => y === desk[0][1]));
  assert.ok(phone.every(([x]) => x === phone[0][0]));
});

test('every edge gets an arrowhead and async edges are dashed', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`[...document.querySelectorAll('.diagram .edge')].map(e => [e.getAttribute('marker-end') || getComputedStyle(e).markerEnd, getComputedStyle(e).strokeDasharray])`);
  await p.close();
  assert.ok(r.every(([m]) => m && m !== 'none'), JSON.stringify(r));
  assert.notEqual(r[1][1], 'none');
});

test('activating a node with data-detail shows its detail under the figure', async () => {
  const p = await browser.open(fx.url);
  const shown = await p.eval(`(() => {
    const node = document.querySelectorAll('.diagram .node')[1];
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const panel = document.querySelector('.diagram .detail');
    return [node.getAttribute('tabindex'), panel && !panel.hidden ? panel.textContent : ''];
  })()`);
  await p.close();
  assert.equal(shown[0], '0');
  assert.match(shown[1], /token bucket per API key/);
});

test('copy svg produces standalone markup with inline colours', async () => {
  const p = await browser.open(fx.url);
  const svg = await p.eval(`HA.diagram.serialize(document.querySelector('.diagram svg'))`);
  const hasButton = await p.eval(`!!document.querySelector('.diagram button.copy-svg')`);
  await p.close();
  assert.ok(hasButton);
  assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /stroke="rgb/);
  assert.doesNotMatch(svg, /var\(--/);
});
