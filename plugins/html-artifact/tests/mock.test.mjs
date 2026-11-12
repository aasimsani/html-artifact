import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { lint } from '../skills/html-artifact/scripts/lint.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<figure class="mock" data-frame="browser" data-w="440" data-url="postbox.app/compose">
  <template><div style="padding:16px"><button style="padding:6px 12px">Send</button> <button data-ref="later" style="padding:6px 12px">Send later ▾</button><p data-ref="hint" style="margin:12px 0 0">Goes out Monday 8:00.</p></div></template>
  <ol class="pins"><li data-ref="later"><b>New button.</b> Send is unchanged.</li><li data-ref="hint">The chosen time shows under the buttons.</li></ol>
  <figcaption>The composer gains one button.</figcaption>
</figure>
<figure class="mock" data-frame="terminal" data-title="postbox" data-w="470"><template><span class="dim">&gt;</span> postbox send --at "mon 8:00"
<span class="g">✓</span> Scheduled for <b>Mon 8:00</b></template></figure>
<figure class="mock" data-frame="phone"><template><div style="padding:16px">Inbox</div></template></figure>
<details id="more"><summary>More</summary>
<figure class="mock" data-w="300"><template><div style="padding:16px"><i data-ref="x">Late</i></div></template><ol class="pins"><li data-ref="x">Opens later.</li></ol></figure>
</details>`;
// Page styles that would restyle the mock if they could reach inside it.
const HEAD = '<style>main button, main p { color: rgb(255, 0, 0); } body { letter-spacing: 3px; }</style>';

let fx, browser;
before(async () => { fx = fixture(doc(BODY, HEAD)); browser = await launch(); });
after(() => browser.close());

const MOCK = n => `document.querySelectorAll('figure.mock')[${n}]`;
const ROOT = n => `${MOCK(n)}.querySelector('.mock-host').shadowRoot`;

test('auto mode inlines the mock component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="mock"/);
});

test('mockups pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('the template renders inside a shadow root at its design width', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`({ text: ${ROOT(0)}.querySelector('[data-ref=later]').textContent,
    width: ${ROOT(0)}.querySelector('.root').getBoundingClientRect().width,
    phone: ${ROOT(2)}.querySelector('.root').getBoundingClientRect().width })`);
  await p.close();
  assert.equal(r.text, 'Send later ▾');
  assert.equal(Math.round(r.width), 440);
  assert.equal(Math.round(r.phone), 375, 'a phone frame defaults to 375');
});

test('page styles do not reach into the mock, and inherited ones stop at its edge', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => { const root = ${ROOT(0)}; const cs = e => getComputedStyle(root.querySelector(e));
    return { button: cs('button').color, p: cs('p').color, spacing: cs('p').letterSpacing }; })()`);
  await p.close();
  assert.notEqual(r.button, 'rgb(255, 0, 0)');
  assert.equal(r.p, 'rgb(31, 35, 40)');
  assert.equal(r.spacing, 'normal');
});

test('each frame draws its chrome', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`({ url: ${MOCK(0)}.querySelector('.mock-bar').textContent, title: ${MOCK(1)}.querySelector('.mock-bar').textContent,
    term: getComputedStyle(${ROOT(1)}.querySelector('.root')).whiteSpace, green: getComputedStyle(${ROOT(1)}.querySelector('.g')).color,
    bare: !!${MOCK(2)}.querySelector('.mock-bar'), frames: [...document.querySelectorAll('.mock-stage')].map(s => s.dataset.frame) })`);
  await p.close();
  assert.equal(r.url, 'postbox.app/compose');
  assert.equal(r.title, 'postbox');
  assert.equal(r.term, 'pre');
  assert.equal(r.green, 'rgb(123, 216, 143)');
  assert.equal(r.bare, false);
  assert.deepEqual(r.frames, ['browser', 'terminal', 'phone', 'none']);
});

test('each pin puts a numbered badge beside its target, never on top of it', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => { const root = ${ROOT(0)}; const box = e => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; };
    return { pins: [...root.querySelectorAll('.pin')].map(b => ({ n: b.textContent, ...box(b) })), later: box(root.querySelector('[data-ref=later]')), hint: box(root.querySelector('[data-ref=hint]')) }; })()`);
  await p.close();
  assert.deepEqual(r.pins.map(b => b.n), ['1', '2']);
  // A tall target such as a button gets the badge at its top-right corner, just outside the edge.
  assert.ok(r.pins[0].left >= r.later.right && r.pins[0].left - r.later.right <= 4 && Math.abs(r.pins[0].cy - r.later.top) <= 2, JSON.stringify(r));
  // A line of text gets the badge level with it, so the badge doesn't cover the line above.
  assert.ok(Math.abs(r.pins[1].cy - r.hint.cy) <= 2, JSON.stringify(r));
});

test('on a phone a mock shrinks to fit the column', async () => {
  const p = await browser.open(fx.url, { width: 400 });
  const r = await p.eval(`(() => { const s = ${MOCK(1)}.querySelector('.mock-stage'); return { zoom: +getComputedStyle(s).zoom, drawn: s.getBoundingClientRect().width, room: ${MOCK(1)}.clientWidth }; })()`);
  await p.close();
  assert.ok(r.zoom < 1, JSON.stringify(r));
  assert.ok(r.drawn <= r.room + 1, JSON.stringify(r));
});

test('a mock inside closed details places its pins once the details open', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(async () => { document.querySelector('#more').open = true; await new Promise(r => setTimeout(r, 100));
    const root = ${ROOT(3)}; const b = root.querySelector('.pin').getBoundingClientRect(), t = root.querySelector('[data-ref=x]').getBoundingClientRect();
    return { dx: b.left - t.right, dy: b.top + b.height / 2 - (t.top + t.height / 2), width: root.querySelector('.root').getBoundingClientRect().width }; })()`);
  await p.close();
  assert.ok(r.dx >= 0 && r.dx <= 4 && Math.abs(r.dy) <= 2, JSON.stringify(r));
  assert.equal(Math.round(r.width), 300);
});

test('lint flags a mock with no template and a pin that points at nothing', () => {
  const problems = lint(doc('<figure class="mock"><div>oops</div></figure><figure class="mock"><template><b data-ref="a">A</b></template><ol class="pins"><li data-ref="a">ok</li><li data-ref="b">lost</li></ol></figure>'));
  assert.equal(problems.length, 2, JSON.stringify(problems));
  assert.match(problems[0], /figure\.mock has no <template>/);
  assert.match(problems[1], /pin data-ref="b" matches nothing in its mock/);
  assert.deepEqual(lint(doc(BODY)), []);
});
