import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<div class="erd" data-id="shop">
  <table class="entity" data-name="organizations"><caption>organizations</caption>
    <tr data-col="id" data-pk><td>id</td><td>uuid</td></tr>
    <tr data-col="name"><td>name</td><td>text</td></tr>
  </table>
  <table class="entity" data-name="customers"><caption>customers</caption>
    <tr data-col="id" data-pk><td>id</td><td>uuid</td></tr>
    <tr data-col="org_id" data-ref="organizations.id" data-card="1:n"><td>org_id</td><td>uuid</td></tr>
  </table>
  <table class="entity" data-name="orders"><caption>orders</caption>
    <tr data-col="id" data-pk><td>id</td><td>uuid</td></tr>
    <tr data-col="customer_id" data-ref="customers.id"><td>customer_id</td><td>uuid</td></tr>
  </table>
  <table class="entity" data-name="products"><caption>products</caption>
    <tr data-col="id" data-pk><td>id</td><td>uuid</td></tr>
  </table>
</div>`;

let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the erd component', () => {
  const fx = fixture(doc(BODY));
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="erd"/);
});

test('an erd page passes verify in both themes at both widths', async () => {
  const fx = fixture(doc(BODY));
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('there is one connector per ref row, with endpoints near the right rows', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const erd = document.querySelector('.erd');
    const edges = HA.erd.edges(erd);
    const rect = sel => document.querySelector(sel).getBoundingClientRect();
    const near = (y, box) => y >= box.top - 2 && y <= box.bottom + 2;
    const custOrgRow = rect('.entity[data-name=customers] tr[data-col=org_id]');
    const orgIdRow = rect('.entity[data-name=organizations] tr[data-col=id]');
    const ordCustRow = rect('.entity[data-name=orders] tr[data-col=customer_id]');
    const custIdRow = rect('.entity[data-name=customers] tr[data-col=id]');
    return {
      count: edges.length,
      orgEdgeOk: edges.some(e => near(e.y1, custOrgRow) && near(e.y2, orgIdRow)),
      ordEdgeOk: edges.some(e => near(e.y1, ordCustRow) && near(e.y2, custIdRow)),
    };
  })()`);
  await p.close();
  assert.equal(r.count, 2);
  assert.ok(r.orgEdgeOk, 'customers.org_id should connect to organizations.id');
  assert.ok(r.ordEdgeOk, 'orders.customer_id should connect to customers.id');
});

test('clicking an entity dims entities unrelated to it', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('.entity[data-name=customers] caption').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const dim = n => document.querySelector('.entity[data-name=' + n + ']').classList.contains('dim');
    const focus = n => document.querySelector('.entity[data-name=' + n + ']').classList.contains('focus');
    return { customers: dim('customers'), organizations: dim('organizations'), orders: dim('orders'), products: dim('products'), focusedCustomers: focus('customers') };
  })()`);
  await p.close();
  assert.equal(r.focusedCustomers, true);
  assert.equal(r.customers, false);
  assert.equal(r.organizations, false);
  assert.equal(r.orders, false);
  assert.equal(r.products, true);
});

test('the search box highlights matching columns only', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const input = document.querySelector('.erd .search input');
    input.value = 'customer_id';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('.erd tr.match')].map(t => t.dataset.col);
  })()`);
  await p.close();
  assert.deepEqual(r, ['customer_id']);
});

test('focus and search state survive a reload', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    document.querySelector('.entity[data-name=customers] caption').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const input = document.querySelector('.erd .search input');
    input.value = 'org';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const r = await again.eval(`(() => ({
    focused: document.querySelector('.entity[data-name=customers]').classList.contains('focus'),
    dimmed: document.querySelector('.entity[data-name=products]').classList.contains('dim'),
    search: document.querySelector('.erd .search input').value,
  }))()`);
  await again.close();
  assert.equal(r.focused, true);
  assert.equal(r.dimmed, true);
  assert.equal(r.search, 'org');
});
