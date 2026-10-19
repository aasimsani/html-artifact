import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<table data-sortable>
  <thead><tr><th>State</th><th class="num">Invoices</th><th class="num">Missing $</th></tr></thead>
  <tbody>
    <tr><td>Texas</td><td class="num">812</td><td class="num">141,200</td></tr>
    <tr><td>Ohio</td><td class="num">301</td><td class="num">48,900</td></tr>
    <tr><td>Washington</td><td class="num">1,655</td><td class="num">120,050</td></tr>
  </tbody>
</table>
<table class="matrix">
  <thead><tr><th>Option</th><th class="num" data-weight="5">Burst safety</th><th class="num" data-weight="3">Simplicity</th><th class="num">Total</th></tr></thead>
  <tbody>
    <tr><td>Token bucket</td><td class="num">9</td><td class="num">6</td><td class="num total"></td></tr>
    <tr><td>Fixed window</td><td class="num">4</td><td class="num">9</td><td class="num total"></td></tr>
  </tbody>
</table>
<p class="verdict"></p>`;

let fx, browser;
before(async () => { fx = fixture(doc(BODY)); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the table component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="table"/);
});

test('tables pass verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('clicking a numeric header sorts numerically, then reverses', async () => {
  const p = await browser.open(fx.url);
  const order = await p.eval(`(() => {
    const t = document.querySelector('table[data-sortable]');
    const col = () => [...t.tBodies[0].rows].filter(r => !r.hidden).map(r => r.cells[0].textContent);
    t.tHead.rows[0].cells[1].click(); const asc = col();
    t.tHead.rows[0].cells[1].click(); const desc = col();
    return { asc, desc, sort: t.tHead.rows[0].cells[1].getAttribute('aria-sort') };
  })()`);
  await p.close();
  assert.deepEqual(order.asc, ['Ohio', 'Texas', 'Washington']);
  assert.deepEqual(order.desc, ['Washington', 'Texas', 'Ohio']);
  assert.equal(order.sort, 'descending');
});

test('the filter hides rows and the count says how many show', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const input = document.querySelector('.table-tools input[type=search]');
    input.value = 'o'; input.dispatchEvent(new Event('input'));
    return document.querySelector('.table-tools .count').textContent;
  })()`);
  await p.close();
  assert.equal(r, '2 of 3 rows');
});

test('csv export covers the visible rows in their current order', async () => {
  const p = await browser.open(fx.url);
  const csv = await p.eval(`HA.table.csv(document.querySelector('table[data-sortable]'))`);
  await p.close();
  assert.equal(csv.split('\n')[0], 'State,Invoices,Missing $');
  assert.match(csv, /Texas,812,"141,200"/);
});

test('the matrix totals by weight, marks the winner and writes the verdict', async () => {
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const t = document.querySelector('table.matrix');
    const read = () => [[...t.querySelectorAll('td.total')].map(c => c.textContent), t.querySelector('tr.win td').textContent, document.querySelector('p.verdict').textContent];
    const before = read();
    const slider = t.querySelectorAll('th input[type=range]')[1];
    slider.value = 10; slider.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, after: read() };
  })()`);
  await p.close();
  assert.deepEqual(r.before[0], ['7.9', '5.9']);
  assert.equal(r.before[1], 'Token bucket');
  assert.match(r.before[2], /Token bucket wins/);
  assert.equal(r.after[1], 'Fixed window');
});
