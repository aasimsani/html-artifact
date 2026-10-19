import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<ol class="editor-list" data-id="triage" data-labels="bug,feature,chore" data-tones="crit,good,nit">
  <li data-id="T-12">Fix crash on save <small>backend</small></li>
  <li data-id="T-13">Add dark mode toggle <small>frontend</small></li>
  <li data-id="T-14">Upgrade build tooling <small>infra</small></li>
</ol>`;

// Each HA.register'd editor persists its state keyed by the fixture's own file path, so every test
// below that mutates state gets a fresh fixture: sharing one would leak state between tests.
let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the editor component', () => {
  const fx = fixture(doc(BODY));
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="editor"/);
});

test('the editor list passes verify in both themes at both widths', async () => {
  const fx = fixture(doc(BODY));
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('alt+down reorders the focused item and updates state', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const order = await p.eval(`(() => {
    document.querySelector('[data-id="T-12"]').focus();
    document.querySelector('.editor-list').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    return HA.blocks()['editor:triage'].state.order;
  })()`);
  await p.close();
  assert.deepEqual(order, ['T-13', 'T-12', 'T-14']);
});

test('clicking a label chip toggles it for that item', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const chip = document.querySelector('[data-id="T-12"] .et-chip[data-label="bug"]');
    chip.click();
    const pressedAfterOn = chip.getAttribute('aria-pressed');
    chip.click();
    const pressedAfterOff = chip.getAttribute('aria-pressed');
    return { pressedAfterOn, pressedAfterOff, labels: HA.blocks()['editor:triage'].state.labels };
  })()`);
  await p.close();
  assert.equal(r.pressedAfterOn, 'true');
  assert.equal(r.pressedAfterOff, 'false');
  assert.deepEqual(r.labels['T-12'] ?? [], []);
});

test('deleting an item removes it from the list and restoring brings it back', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    document.querySelector('[data-id="T-13"] .et-del').click();
    const afterDelete = {
      inList: !!document.querySelector('.editor-list [data-id="T-13"]'),
      deleted: HA.blocks()['editor:triage'].state.deleted.slice(),
    };
    document.querySelector('[data-id="T-13"] .et-del').click();
    const afterRestore = {
      inList: !!document.querySelector('.editor-list [data-id="T-13"]'),
      deleted: HA.blocks()['editor:triage'].state.deleted.slice(),
    };
    return { afterDelete, afterRestore };
  })()`);
  await p.close();
  assert.equal(r.afterDelete.inList, false);
  assert.deepEqual(r.afterDelete.deleted, ['T-13']);
  assert.equal(r.afterRestore.inList, true);
  assert.deepEqual(r.afterRestore.deleted, []);
});

test('double-clicking an item edits its text, leaving the meta alone', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const r = await p.eval(`(() => {
    const li = document.querySelector('[data-id="T-14"]');
    li.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = li.querySelector('.et-edit');
    input.value = 'Upgrade build tooling to v2';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    return { text: li.firstChild.textContent, meta: li.querySelector('small').textContent, edits: HA.blocks()['editor:triage'].state.edits };
  })()`);
  await p.close();
  assert.equal(r.text, 'Upgrade build tooling to v2');
  assert.equal(r.meta, 'infra');
  assert.equal(r.edits['T-14'], 'Upgrade build tooling to v2');
});

test('the count line reports items, label counts and deletions', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const line = await p.eval(`(() => {
    document.querySelector('[data-id="T-12"] .et-chip[data-label="bug"]').click();
    document.querySelector('[data-id="T-13"] .et-del').click();
    return document.querySelector('.et-count').textContent;
  })()`);
  await p.close();
  assert.equal(line, '2 items · 1 labelled bug · 1 deleted');
});

test('state (order, labels, deleted, edits) survives a reload', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    document.querySelector('[data-id="T-12"] .et-chip[data-label="bug"]').click();
    document.querySelector('[data-id="T-13"] .et-del').click();
    const li = document.querySelector('[data-id="T-14"]');
    li.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = li.querySelector('.et-edit');
    input.value = 'Renamed task';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const state = await again.eval(`HA.blocks()['editor:triage'].state`);
  await again.close();
  assert.deepEqual(state.labels['T-12'], ['bug']);
  assert.deepEqual(state.deleted, ['T-13']);
  assert.equal(state.edits['T-14'], 'Renamed task');
});
