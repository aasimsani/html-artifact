import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from '../skills/html-artifact/scripts/build.mjs';

const BUILD = new URL('../skills/html-artifact/scripts/build.mjs', import.meta.url).pathname;

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'build-test-'));
  mkdirSync(join(dir, 'components'));
  writeFileSync(join(dir, 'components', 'shell.css'), '.shell{}');
  writeFileSync(join(dir, 'components', 'shell.js'), 'window.shell=1;');
  writeFileSync(join(dir, 'components', 'review.css'), '/* requires: shell */\n.review{}');
  writeFileSync(join(dir, 'components', 'review.js'), 'window.review=1;');
  writeFileSync(join(dir, 'components', 'timeline.css'), '/* requires: shell */\n/* enhances: .rail, .stepper */\n.rail{}');
  writeFileSync(join(dir, 'components', 'ask.js'), '// enhances: [data-ask]\nwindow.ask=1;');
  return dir;
}

const page = names => `<!doctype html><html><head><meta charset="utf-8">
<meta name="components" content="${names}"><title>t</title></head>
<body><main><p>hi</p></main></body></html>`;

test('inlines a named component css into head and js before body end', () => {
  const dir = fixtureDir();
  const out = build(page('shell'), { componentsDir: join(dir, 'components') });
  assert.match(out, /<style data-component="shell">\.shell\{\}<\/style>\s*<\/head>/);
  assert.match(out, /<script data-component="shell">window\.shell=1;<\/script>\s*<\/body>/);
});

test('pulls in required components first', () => {
  const dir = fixtureDir();
  const out = build(page('review'), { componentsDir: join(dir, 'components') });
  assert.ok(out.indexOf('data-component="shell"') > -1, 'shell was not pulled in');
  assert.ok(out.indexOf('.shell{}') < out.indexOf('.review{}'), 'shell css must come before review css');
});

test('throws on an unknown component name', () => {
  const dir = fixtureDir();
  assert.throws(() => build(page('shell,nope'), { componentsDir: join(dir, 'components') }), /unknown component: nope/);
});

test('rebuilding a built page changes nothing', () => {
  const dir = fixtureDir();
  const opts = { componentsDir: join(dir, 'components') };
  const once = build(page('review'), opts);
  assert.equal(build(once, opts), once);
});

test('cli writes foo.html next to foo.src.html', () => {
  const dir = fixtureDir();
  writeFileSync(join(dir, 'foo.src.html'), page('shell'));
  execFileSync('node', [BUILD, join(dir, 'foo.src.html')], { env: { ...process.env, HTML_ARTIFACT_COMPONENTS: join(dir, 'components') } });
  assert.match(readFileSync(join(dir, 'foo.html'), 'utf8'), /window\.shell=1;/);
});

const bare = body => `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main>${body}</main></body></html>`;

test('without a components meta, it includes shell, review and every component the markup uses', () => {
  const dir = fixtureDir();
  const out = build(bare('<ol class="rail big"><li>x</li></ol><div data-ask="q1"></div>'), { componentsDir: join(dir, 'components') });
  for (const name of ['shell', 'review', 'timeline', 'ask']) assert.match(out, new RegExp(`data-component="${name}"`), name);
});

test('auto mode leaves out components the markup does not use', () => {
  const dir = fixtureDir();
  const out = build(bare('<p>plain</p>'), { componentsDir: join(dir, 'components') });
  assert.doesNotMatch(out, /data-component="timeline"/);
  assert.doesNotMatch(out, /data-component="ask"/);
});

test('a class name that only contains a declared one does not trigger it', () => {
  const dir = fixtureDir();
  const out = build(bare('<div class="railway"></div>'), { componentsDir: join(dir, 'components') });
  assert.doesNotMatch(out, /data-component="timeline"/);
});

test('auto mode ignores markup inside already-inlined component blocks', () => {
  const dir = fixtureDir();
  const opts = { componentsDir: join(dir, 'components') };
  const once = build(bare('<p>plain</p>').replace('</body>', '<script data-component="x">el.innerHTML = \'<ol class="rail">\';</script>\n</body>'), opts);
  assert.doesNotMatch(once, /data-component="timeline"/);
  assert.equal(build(once, opts), once);
});

test('a trailing * in a declared class matches any class with that prefix', () => {
  const dir = fixtureDir();
  writeFileSync(join(dir, 'components', 'code.js'), '// enhances: .language-*\nwindow.code=1;');
  const out = build(bare('<pre><code class="language-python">x</code></pre>'), { componentsDir: join(dir, 'components') });
  assert.match(out, /data-component="code"/);
});

test('build embeds each section text, so the review kit can show what changed between builds', () => {
  const dir = fixtureDir();
  const html = bare('<section id="a"><h2>Alpha &amp; one</h2><p>First <b>bold</b> text.</p></section><section id="b"><p>Second.</p></section>');
  const out = build(html, { componentsDir: join(dir, 'components') });
  const json = out.match(/<script type="application\/json" data-component="sections">([\s\S]*?)<\/script>/);
  assert.ok(json, 'sections block missing');
  assert.deepEqual(JSON.parse(json[1]), { a: 'Alpha & one First bold text.', b: 'Second.' });
});
