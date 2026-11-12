import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderDiagram } from '../skills/html-artifact/scripts/diagram.mjs';
import { build } from '../skills/html-artifact/scripts/build.mjs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const DSL = `
# The limiter and its store.
edge    = Edge proxy / global 5k rps
limiter = Rate limiter / token bucket [hot] # Holds one token bucket per API key.
redis   = Redis [store]
auth    = Authentication and authorization / tier 0 [external]
jobs    = Retry queue [queue]

| edge | limiter | auth |
| .    | redis   | jobs |

edge -> limiter : request
limiter --> redis : INCR
limiter -> auth : verify key
limiter ..> jobs : 429 + Retry-After [problem]
jobs -> jobs : retry
`;

const nodes = svg => Object.fromEntries([...svg.matchAll(/<g class="node([^"]*)"([^>]*)>\s*<(rect|path)([^>]*)>[\s\S]*?<foreignObject x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"><div class="fo"[^>]*>([^<]*)(?:<small>([^<]*)<\/small>)?/g)]
  .map(([, cls, attrs, shape, shapeAttrs, x, y, w, h, label, sub]) => [label, { cls: cls.trim(), attrs, shape, shapeAttrs, x: +x, y: +y, w: +w, h: +h, sub }]));
const has = (problems, re) => assert.ok(problems.some(p => re.test(p)), `expected a problem matching ${re}, got ${JSON.stringify(problems)}`);

test('nodes land on the grid: a row shares a y, a column shares an x', () => {
  const { svg, problems } = renderDiagram(DSL);
  assert.deepEqual(problems, []);
  const n = nodes(svg);
  assert.equal(Object.keys(n).length, 5);
  assert.equal(n['Edge proxy'].y, n['Rate limiter'].y);
  assert.equal(n['Rate limiter'].y, n['Authentication and authorization'].y);
  assert.equal(n['Rate limiter'].x, n['Redis'].x);
  assert.ok(n['Redis'].y > n['Rate limiter'].y + n['Rate limiter'].h, 'row 2 sits below row 1');
  assert.ok(n['Rate limiter'].x > n['Edge proxy'].x + n['Edge proxy'].w, 'column 2 sits right of column 1');
  assert.equal(n['Edge proxy'].sub, 'global 5k rps');
});

test('node kinds map to the diagram classes and shapes, and # text becomes the detail', () => {
  const n = nodes(renderDiagram(DSL).svg);
  assert.equal(n['Rate limiter'].cls, 'hot');
  assert.match(n['Rate limiter'].attrs, /data-detail="Holds one token bucket per API key\."/);
  assert.equal(n['Redis'].cls, 'store');
  assert.equal(n['Redis'].shape, 'path');
  assert.equal(n['Authentication and authorization'].cls, 'external');
  assert.equal(n['Edge proxy'].shape, 'rect');
  assert.match(n['Retry queue'].shapeAttrs, new RegExp(`rx="${n['Retry queue'].h / 2}"`), 'a queue is a pill');
});

test('a longer label gets a taller box, and every node in its row matches it', () => {
  const n = nodes(renderDiagram(DSL).svg);
  assert.ok(n['Authentication and authorization'].h > 48);
  assert.equal(n['Edge proxy'].h, n['Authentication and authorization'].h);
});

test('arrows map to edge classes, and each label gets a backed text', () => {
  const { svg } = renderDiagram(DSL);
  const edges = [...svg.matchAll(/<path class="(edge[^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(edges, ['edge', 'edge async', 'edge', 'edge fallback problem', 'edge']);
  const labels = [...svg.matchAll(/<g class="label"><rect[^>]*\/><text[^>]*>([^<]*)<\/text><\/g>/g)].map(m => m[1]);
  assert.deepEqual(labels, ['request', 'INCR', 'verify key', '429 + Retry-After', 'retry']);
});

test('the svg has a fixed size, a role and an escaped label', () => {
  const { svg } = renderDiagram('a = A & <B>\nb = B\na -> b', 'Where "it" sits');
  assert.match(svg, /^<div class="scroll"><svg viewBox="0 0 (\d+) (\d+)" width="\1" height="\2" role="img" aria-label="Where &quot;it&quot; sits">/);
  assert.match(svg, /A &amp; &lt;B&gt;/);
});

test('without grid rows, up to four nodes sit in one row', () => {
  const n = nodes(renderDiagram('a = Alpha\nb = Beta\nc = Gamma\na -> b\nb -> c').svg);
  assert.equal(n.Alpha.y, n.Gamma.y);
  assert.ok(n.Alpha.x < n.Beta.x && n.Beta.x < n.Gamma.x);
});

test('each column gap leaves the arrow visible on both sides of its label', () => {
  const n = nodes(renderDiagram('a = Alpha\nb = Beta\nc = Gamma\na -> b : ok\nb -> c : a much longer label').svg);
  const gap = (l, r) => n[r].x - (n[l].x + n[l].w);
  assert.ok(gap('Beta', 'Gamma') - ('a much longer label'.length * 7.2 + 12) >= 40, `gap is ${gap('Beta', 'Gamma')}`);
  assert.ok(gap('Alpha', 'Beta') < gap('Beta', 'Gamma'), 'a long label widens its own gap only');
});

test('two edges between the same pair do not share a line', () => {
  const { svg, problems } = renderDiagram('a = Alpha\nb = Beta\na -> b : ask\nb -> a : answer');
  assert.deepEqual(problems, []);
  const [one, two] = [...svg.matchAll(/<path class="edge" d="([^"]+)"/g)].map(m => m[1]);
  assert.notEqual(one.match(/M[\d.]+,([\d.]+)/)[1], two.match(/M[\d.]+,([\d.]+)/)[1]);
});

test('reports what it cannot parse or place, with the line number', () => {
  has(renderDiagram('a = Alpha\nwat').problems, /line 2: "wat" is not a node, an edge or a grid row/);
  has(renderDiagram('a = Alpha\na = Again').problems, /line 2: node "a" is defined twice/);
  has(renderDiagram('a = Alpha [shiny]').problems, /line 1: \[shiny\] is not a node kind/);
  has(renderDiagram('a = Alpha\na -> b').problems, /edge a -> b names "b", which is not a node/);
  has(renderDiagram('a = Alpha\nb = Beta\n| a | c |').problems, /grid names "c", which is not a node/);
  has(renderDiagram('a = Alpha\nb = Beta\n| a |').problems, /node "b" is missing from the grid rows/);
  has(renderDiagram('a = Alpha\n| a | a |').problems, /node "a" is placed twice/);
  has(renderDiagram('').problems, /no nodes/);
  assert.equal(renderDiagram('a = Alpha\nwat').svg, null);
});

test('reports a diagram that is too big to read', () => {
  const many = n => Array.from({ length: n }, (_, i) => `n${i} = Node ${i}`).join('\n');
  has(renderDiagram(`${many(5)}`).problems, /5 nodes need grid rows/);
  has(renderDiagram(`${many(5)}\n| n0 | n1 | n2 | n3 | n4 |`).problems, /5 columns/);
  has(renderDiagram(`${many(13)}\n${[0, 1, 2, 3].map(r => `| ${[0, 1, 2, 3].map(c => (r * 4 + c < 13 ? `n${r * 4 + c}` : '.')).join(' | ')} |`).join('\n')}`).problems, /13 nodes/);
  has(renderDiagram('a = This label is far too long to be a node label\nb = B\na -> b').problems, /label of "a" is \d+ characters/);
  has(renderDiagram('a = A\nb = B\na -> b : this edge label is much too long to sit on an arrow').problems, /label on a -> b is \d+ characters/);
});

test('reports an edge that runs through another node', () => {
  has(renderDiagram('a = A\nb = B\nc = C\n| a | b | c |\na -> c').problems, /edge a -> c runs through "b"/);
  assert.deepEqual(renderDiagram('a = A\nb = B\nc = C\n| a | b |\n| c | . |\na -> c\nb -> c').problems, []);
});

const figure = dsl => `<figure class="diagram"><script type="text/diagram">${dsl}</script><figcaption>Where the limiter sits.</figcaption></figure>`;

test('build swaps the diagram text for svg, labels it from the caption, and stays stable on rebuild', () => {
  const problems = [];
  const once = build(doc(figure(DSL)), { problems });
  assert.deepEqual(problems, []);
  assert.doesNotMatch(once, /text\/diagram/);
  assert.match(once, /<figure class="diagram"><div class="scroll"><svg [^>]*aria-label="Where the limiter sits\."/);
  assert.match(once, /data-component="diagram"/);
  assert.equal(build(once), once);
});

test('build reports diagram problems and leaves the text in place', () => {
  const problems = [];
  const out = build(doc(figure('a = Alpha\na -> b')), { problems });
  has(problems, /^diagram: edge a -> b names "b"/);
  assert.match(out, /<script type="text\/diagram">/);
});

let fx, browser;
before(async () => { fx = fixture(doc(figure(DSL))); browser = await launch(); });
after(() => browser.close());

test('a built diagram passes verify: no clipped labels, small text or page overflow', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('the diagram kit still adds arrowheads, and the detail panel names a wrapped label', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const heads = [...document.querySelectorAll('.diagram .edge')].map(e => e.getAttribute('marker-end'));
    document.querySelector('.diagram .node[data-detail]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { heads, title: document.querySelector('.diagram .detail b').textContent };
  })()`);
  await p.close();
  assert.equal(r.heads.length, 5);
  assert.ok(r.heads.every(h => h && h.startsWith('url(#')), JSON.stringify(r.heads));
  assert.equal(r.title, 'Rate limiter');
});

test('on a phone a wide diagram keeps its size and scrolls inside its own box', async () => {
  const p = await browser.open(fx.url, { width: 400 });
  const r = await p.eval(`(() => { const s = document.querySelector('.diagram .scroll'), svg = s.querySelector('svg');
    return { drawn: svg.getBoundingClientRect().width, natural: +svg.getAttribute('width'), scrolls: s.scrollWidth > s.clientWidth, overflow: getComputedStyle(s).overflowX }; })()`);
  await p.close();
  assert.equal(Math.round(r.drawn), r.natural);
  assert.ok(r.scrolls);
  assert.equal(r.overflow, 'auto');
});
