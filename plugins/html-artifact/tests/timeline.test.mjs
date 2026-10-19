import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<ol class="timeline">
  <li data-tone="crit"><time>09:40</time> Worker v4.12 ships with prefetch raised from 10 to 200.</li>
  <li><time>09:58</time> The on-call alert fires for job latency.</li>
  <li data-tone="good"><time>10:44</time> The backlog drains.</li>
</ol>
<ol class="stepper">
  <li><b>Edit ship date</b> saves in QBO</li>
  <li data-tone="crit"><b>AST recomputes</b> TotalTax → $0</li>
  <li><b>Webhook</b> writes TotalTax</li>
  <li data-tone="crit"><b>Invoice reopens</b> balance = tax</li>
</ol>
<div class="roadmap" data-start="2026-10-01" data-end="2027-01-31" data-today="2026-11-10">
  <div class="lane" data-name="Platform">
    <span data-start="2026-10-01" data-end="2026-11-05" data-tone="good">Limiter core</span>
    <span data-start="2026-11-10" data-end="2026-12-20" data-tone="high">Burst tuning</span>
  </div>
  <div class="lane" data-name="API">
    <span data-start="2026-11-01" data-end="2026-12-01">429 + Retry-After</span>
  </div>
</div>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the timeline component for this markup', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="timeline"/);
});

test('timeline, stepper and roadmap pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('the stepper numbers its steps and lays them in a row on desktop and a column on a phone', async () => {
  const pos = async width => {
    const p = await browser.open(fx.url, { width });
    const r = await p.eval(`[...document.querySelectorAll('.stepper > li')].map(li => { const b = li.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), getComputedStyle(li, '::before').content]; })`);
    await p.close();
    return r;
  };
  const desk = await pos(1280), phone = await pos(400);
  assert.match(desk[0][2], /^counter\(/);
  assert.ok(desk.every(([, y]) => y === desk[0][1]), 'desktop steps share a row');
  assert.ok(phone.every(([x]) => x === phone[0][0]), 'phone steps share a column');
});

test('roadmap bars are placed by date and the today marker sits between them', async () => {
  const p = await browser.open(fx.url);
  const g = await p.eval(`(() => {
    const track = document.querySelector('.roadmap .lane').getBoundingClientRect();
    const bars = [...document.querySelector('.roadmap .lane').querySelectorAll('span')].map(s => s.getBoundingClientRect());
    const today = document.querySelector('.roadmap .today').getBoundingClientRect();
    const axis = document.querySelectorAll('.roadmap .axis span').length;
    return { first: bars[0].left, firstRight: bars[0].right, second: bars[1].left, today: today.left, axis };
  })()`);
  await p.close();
  assert.ok(g.first < g.firstRight && g.firstRight <= g.second, 'bars ordered by date');
  assert.ok(g.today > g.firstRight - 2 && g.today <= g.second + 2, `today ${g.today} between ${g.firstRight} and ${g.second}`);
  assert.equal(g.axis, 4, 'one axis label per month');
});
