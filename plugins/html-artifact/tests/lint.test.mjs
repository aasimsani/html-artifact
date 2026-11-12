import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { lint } from '../skills/html-artifact/scripts/lint.mjs';
import { doc } from './helpers.mjs';

const BUILD = new URL('../skills/html-artifact/scripts/build.mjs', import.meta.url).pathname;

const page = ({ h1 = 'Payment confirmations were delayed for 64 minutes.', lede = '', body = '' } = {}) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body>
<header class="masthead"><h1>${h1}</h1>${lede}</header>
<div class="page"><nav class="toc"></nav><main><section id="one"><h2>One.</h2>${body}</section></main></div></body></html>`;

const has = (problems, re) => assert.ok(problems.some(p => re.test(p)), `expected a problem matching ${re}, got ${JSON.stringify(problems)}`);

test('a clean page has no lint problems', () => {
  assert.deepEqual(lint(page()), []);
  assert.deepEqual(lint(doc('<p>plain</p>')), []);
});

test('a page with no h1 is not a lint problem', () => {
  assert.deepEqual(lint('<!doctype html><html><head><title>t</title></head><body><main><p>hi</p></main></body></html>'), []);
});

test('flags an h1 that asks a question', () => {
  has(lint(page({ h1: 'Why were payment confirmations delayed?' })), /h1 .*question/);
});

test('flags a topic h1 when no lede carries the answer', () => {
  has(lint(page({ h1: 'UK VAT questions' })), /h1 "UK VAT questions" names a topic/);
  has(lint(page({ h1: 'UK VAT questions', lede: '<p class="lede">Answers from production data</p>' })), /names a topic/);
});

test('accepts a topic h1 when the lede is a full sentence', () => {
  const lede = '<p class="lede">Three of the five answers were wrong, and <b>£41K</b> of VAT is owed.</p>';
  assert.deepEqual(lint(page({ h1: 'UK VAT questions', lede })), []);
});

const ask = (attrs, name = 'redis-down') => `<div class="ask" ${attrs}>
  <p><b>When Redis is unavailable, the limiter should…</b></p>
  <label><input type="radio" name="${name}" value="open"> Fail open</label>
  <label><input type="radio" name="${name}" value="closed"> Fail closed</label>
</div>`;

test('accepts a decision block with an id and a default that matches an option', () => {
  assert.deepEqual(lint(page({ body: ask('data-id="redis-down" data-default="open"') })), []);
});

test('flags a decision block with no default, or a default that matches no option', () => {
  has(lint(page({ body: ask('data-id="redis-down"') })), /ask "redis-down" has no data-default/);
  has(lint(page({ body: ask('data-id="redis-down" data-default="maybe"') })), /data-default="maybe" matches no option/);
});

test('flags a decision block with no data-id, and two blocks that share one', () => {
  has(lint(page({ body: ask('data-default="open"') })), /ask .*no data-id/);
  const twice = ask('data-id="a" data-default="open"', 'a') + ask('data-id="a" data-default="open"', 'b');
  has(lint(page({ body: twice })), /two decision blocks share data-id="a"/);
});

test('flags a duplicate id and an anchor that points at no id', () => {
  has(lint(page({ body: '<p id="one">again</p>' })), /id="one" appears 2 times/);
  has(lint(page({ body: '<a href="#nowhere">see</a><a href="#one">ok</a>' })), /href="#nowhere" points at no id/);
  assert.equal(lint(page({ body: '<a href="#nowhere">see</a><a href="#one">ok</a>' })).length, 1);
});

test('ids inside code, templates and scripts are not page ids', () => {
  const body = '<pre><code>&lt;p id="one"&gt;</code></pre><template><p id="one">mock</p></template><script type="text/plain"><p id="one"></script>';
  assert.deepEqual(lint(page({ body })), []);
});

test('flags a margin note over 40 words', () => {
  const words = n => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
  const notes = n => `<ol class="notes"><li id="F1">${words(n)}</li></ol>`;
  assert.deepEqual(lint(page({ body: notes(40) })), []);
  has(lint(page({ body: notes(41) })), /note F1 is 41 words/);
});

test('flags a raw tag inside pre, which the browser would swallow', () => {
  has(lint(page({ body: '<pre><code class="language-ts">const m = new Map<string, number>();</code></pre>' })), /<pre> holds a raw <string/);
  const fine = '<pre><code class="language-ts">const m = new Map&lt;string, number&gt;(); if (a < b) <mark>x</mark> <span class="hl">y</span></code></pre>';
  assert.deepEqual(lint(page({ body: fine })), []);
});

test('lint ignores inlined component blocks, so a built page lints like its source', () => {
  const built = page().replace('</body>', '<script data-component="x">el.innerHTML = \'<h1>Topic</h1><pre><T></pre>\';</script>\n</body>');
  assert.deepEqual(lint(built), []);
});

test('the cli still writes the page, prints each lint problem as a ✗ line and exits 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lint-cli-'));
  writeFileSync(join(dir, 'bad.src.html'), page({ h1: 'Is it broken?' }));
  assert.throws(() => execFileSync('node', [BUILD, join(dir, 'bad.src.html')], { stdio: 'pipe' }),
    e => e.status === 1 && /✗ .*h1 .*question/.test(e.stdout.toString()));
  assert.ok(existsSync(join(dir, 'bad.html')), 'the page must still be written');
});
