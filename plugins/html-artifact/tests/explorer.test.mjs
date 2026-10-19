import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const ROWS = [
  { account: 'Acme Co', region: 'EU', status: 'open', created_at: '2026-10-01' },
  { account: 'Brightline', region: 'EU', status: 'closed', created_at: '2026-10-02' },
  { account: 'Caldera', region: 'US', status: 'open', created_at: '2026-10-02' },
  { account: 'Delta Tax', region: 'US', status: 'open', created_at: '2026-10-03' },
  { account: 'Everline', region: 'APAC', status: 'closed', created_at: '2026-10-04' },
];

const BODY = `
<div class="explorer" data-id="accounts" data-facets="region,status" data-time="created_at">
  <script type="application/json">${JSON.stringify(ROWS)}</script>
  <p>Five sample accounts.</p>
</div>`;

// Each test but the reload test opens its own fixture, because explorer filters persist to
// localStorage by design and a shared fixture would carry filters from test to test.
const makeFx = () => fixture(doc(BODY));

let fx, browser;
before(async () => { fx = makeFx(); browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the explorer component', () => {
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="explorer"/);
});

test('explorer passes verify in both themes at both widths', async () => {
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('clicking a facet value filters rows and updates the other facet\'s counts', async () => {
  const fx = makeFx();
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const groups = [...document.querySelectorAll('.exp-facet-group')];
    const region = groups.find(g => g.querySelector('h4').textContent === 'region');
    const status = groups.find(g => g.querySelector('h4').textContent === 'status');
    const euLabel = [...region.querySelectorAll('label')].find(l => l.textContent.includes('EU'));
    euLabel.querySelector('input').click();
    return {
      count: document.querySelector('.exp-count').textContent,
      statusCounts: [...status.querySelectorAll('label')].map(l => l.textContent.trim()),
    };
  })()`);
  await p.close();
  assert.match(r.count, /^2 of 5 rows/);
  assert.deepEqual(new Set(r.statusCounts), new Set(['open (1)', 'closed (1)']));
});

test('the search box matches any field', async () => {
  const fx = makeFx();
  const p = await browser.open(fx.url);
  const count = await p.eval(`(() => {
    const input = document.querySelector('.exp-tools input[type=search]');
    input.value = 'caldera'; input.dispatchEvent(new Event('input'));
    return document.querySelector('.exp-count').textContent;
  })()`);
  await p.close();
  assert.match(count, /^1 of 5 rows/);
});

test('the SQL WHERE string reflects the active facet filters', async () => {
  const fx = makeFx();
  const p = await browser.open(fx.url);
  const sql = await p.eval(`(() => {
    const region = [...document.querySelectorAll('.exp-facet-group')].find(g => g.querySelector('h4').textContent === 'region');
    [...region.querySelectorAll('label')].find(l => l.textContent.includes('EU')).querySelector('input').click();
    [...region.querySelectorAll('label')].find(l => l.textContent.includes('US')).querySelector('input').click();
    return HA.explorer.get('accounts').sql();
  })()`);
  await p.close();
  assert.equal(sql, "region IN ('EU', 'US')");
});

test('the CSV export contains only the filtered rows', async () => {
  const fx = makeFx();
  const p = await browser.open(fx.url);
  const csv = await p.eval(`(() => {
    const status = [...document.querySelectorAll('.exp-facet-group')].find(g => g.querySelector('h4').textContent === 'status');
    [...status.querySelectorAll('label')].find(l => l.textContent.includes('closed')).querySelector('input').click();
    return HA.explorer.get('accounts').csv();
  })()`);
  await p.close();
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'account,region,status,created_at');
  assert.equal(lines.length, 3); // header + Brightline + Everline
  assert.ok(lines.every((l, i) => i === 0 || l.includes(',closed,')));
});

test('filters survive a reload', async () => {
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    const region = [...document.querySelectorAll('.exp-facet-group')].find(g => g.querySelector('h4').textContent === 'region');
    [...region.querySelectorAll('label')].find(l => l.textContent.includes('APAC')).querySelector('input').click();
    const input = document.querySelector('.exp-tools input[type=search]');
    input.value = 'ever'; input.dispatchEvent(new Event('input'));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const r = await again.eval(`(() => {
    const region = [...document.querySelectorAll('.exp-facet-group')].find(g => g.querySelector('h4').textContent === 'region');
    const apac = [...region.querySelectorAll('label')].find(l => l.textContent.includes('APAC')).querySelector('input').checked;
    return { apac, search: document.querySelector('.exp-tools input[type=search]').value, count: document.querySelector('.exp-count').textContent };
  })()`);
  await again.close();
  assert.equal(r.apac, true);
  assert.equal(r.search, 'ever');
  assert.match(r.count, /^1 of 5 rows/);
});
