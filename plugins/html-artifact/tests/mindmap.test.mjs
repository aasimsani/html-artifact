import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { doc, fixture } from './helpers.mjs';

const BODY = `
<ul class="mindmap" data-id="launch-plan">
  <li>Launch plan
    <ul>
      <li data-tone="keep">Marketing
        <ul>
          <li>Blog post</li>
          <li data-tone="drop">Print ads</li>
        </ul>
      </li>
      <li data-tone="maybe">Beta invites</li>
    </ul>
  </li>
</ul>`;

const TREE = [{
  text: 'Launch plan', mark: null, children: [
    { text: 'Marketing', mark: 'keep', children: [
      { text: 'Blog post', mark: null, children: [] },
      { text: 'Print ads', mark: 'drop', children: [] },
    ] },
    { text: 'Beta invites', mark: 'maybe', children: [] },
  ],
}];

let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

test('auto mode inlines the mindmap component', () => {
  const fx = fixture(doc(BODY));
  assert.match(readFileSync(fx.file, 'utf8'), /data-component="mindmap"/);
});

test('a mindmap page passes verify in both themes at both widths', async () => {
  const fx = fixture(doc(BODY));
  const [r] = await verify([fx.file]);
  assert.deepEqual(r.problems, []);
});

test('the initial tree comes from the markup', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const state = await p.eval(`HA.blocks()['mindmap:launch-plan'].state`);
  await p.close();
  assert.deepEqual(state, TREE);
});

test('adding a child, renaming it and deleting another node update HA.blocks() state', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const result = await p.eval(`(() => {
    const root = document.querySelector('ul.mindmap');
    const li = n => [...root.querySelectorAll('li')].find(x => x.querySelector(':scope > .row > .label').textContent.trim() === n);

    li('Beta invites').querySelector('.add-child').click();
    const added = li('New idea');
    added.querySelector('.label').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    added.querySelector('.label').textContent = 'Confirm venue';
    added.querySelector('.label').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    li('Print ads').querySelector('.delete').click();

    return HA.blocks()['mindmap:launch-plan'].state;
  })()`);
  await p.close();
  const [root] = result;
  assert.equal(root.children[1].text, 'Beta invites');
  assert.equal(root.children[1].children[0].text, 'Confirm venue');
  assert.equal(root.children[0].text, 'Marketing');
  assert.deepEqual(root.children[0].children.map(c => c.text), ['Blog post']);
});

test('tab indents a node under its previous sibling', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  const result = await p.eval(`(() => {
    const root = document.querySelector('ul.mindmap');
    const li = n => [...root.querySelectorAll('li')].find(x => x.querySelector(':scope > .row > .label').textContent.trim() === n);
    const label = li('Beta invites').querySelector('.label');
    label.focus();
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    return HA.blocks()['mindmap:launch-plan'].state;
  })()`);
  await p.close();
  const [root] = result;
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].text, 'Marketing');
  assert.deepEqual(root.children[0].children.map(c => c.text), ['Blog post', 'Print ads', 'Beta invites']);
});

test('the tree survives a reload', async () => {
  const fx = fixture(doc(BODY));
  const p = await browser.open(fx.url);
  await p.eval(`(() => {
    const root = document.querySelector('ul.mindmap');
    const label = [...root.querySelectorAll('.label')].find(l => l.textContent.trim() === 'Blog post');
    label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    label.textContent = 'Write blog post';
    label.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  })()`);
  await p.close();
  const again = await browser.open(fx.url);
  const state = await again.eval(`HA.blocks()['mindmap:launch-plan'].state`);
  await again.close();
  assert.equal(state[0].children[0].children[0].text, 'Write blog post');
});
