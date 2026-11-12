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

test('inlined components are minified: no comment lines and no indentation', () => {
  const dir = fixtureDir();
  writeFileSync(join(dir, 'components', 'mini.css'), '/* requires: shell */\n/* A block comment. */\n.a {\n  color: red;\n}\n');
  writeFileSync(join(dir, 'components', 'mini.js'), '// requires: shell\n// A line comment.\n(() => {\n    const url = "http://x.y/z"; // trailing\n    window.mini = url;\n})();\n');
  const out = build(page('mini'), { componentsDir: join(dir, 'components') });
  const css = out.match(/<style data-component="mini">([\s\S]*?)<\/style>/)[1];
  const js = out.match(/<script data-component="mini">([\s\S]*?)<\/script>/)[1];
  assert.equal(css, '.a{color:red;}');
  assert.doesNotMatch(js, /A line comment|^\s+/m);
  assert.match(js, /"http:\/\/x\.y\/z"/);
});

test('a typical document runtime stays within a 55 KB budget once minified', () => {
  // Budget for shell, review, content and timeline, the components most documents use.
  const out = build(page('shell,review,content,timeline'));
  const runtime = [...out.matchAll(/<(style|script) data-component="[^"]*">([\s\S]*?)<\/\1>/g)].reduce((n, m) => n + m[2].length, 0);
  assert.ok(runtime <= 55 * 1024, `runtime is ${(runtime / 1024).toFixed(1)} KB`);
});

test('build --verify builds the page and reports problems in the same call', () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-verify-'));
  writeFileSync(join(dir, 'ok.src.html'), bare('<section id="a"><h2>Fine.</h2><p>This page passes every check without any trouble at all.</p></section>'));
  writeFileSync(join(dir, 'bad.src.html'), bare('<section id="a"><h2>Wide.</h2><div style="width:2000px">This block is far too wide for a phone screen.</div></section>'));
  const ok = execFileSync('node', [BUILD, join(dir, 'ok.src.html'), '--verify'], { stdio: 'pipe' }).toString();
  assert.match(ok, /✓ .*ok\.html/);
  assert.throws(() => execFileSync('node', [BUILD, join(dir, 'bad.src.html'), '--verify'], { stdio: 'pipe' }),
    e => e.status === 1 && /overflow at 400px/.test(e.stdout.toString()));
});

// ---- Code filled from the repo: <pre data-src="path" data-lines="a-b"> ----

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'fill-root-'));
  mkdirSync(join(root, 'core'));
  writeFileSync(join(root, 'core', 'sync.py'), 'import db\n\ndef sync(a: list[int]) -> bool:\n    return a < [1] & True\n# end\n');
  writeFileSync(join(root, '.env'), 'TOKEN=abc\n');
  writeFileSync(join(root, 'core', 'keys.py'), `KEY = "${['sk', 'live', '51HxQwErTyUiOpAsDfGhJkLz'].join('_')}"\n`);
  return root;
}
const filled = (pre, root, extra = {}) => {
  const problems = [], embedded = [];
  const out = build(bare(pre), { componentsDir: join(fixtureDir(), 'components'), root, problems, embedded, ...extra });
  return { out, problems, embedded, pre: out.match(/<pre\b[\s\S]*?<\/pre>/)[0] };
};

test('data-src fills the block with the named lines, escaped, and infers the language', () => {
  const r = filled('<pre data-src="core/sync.py" data-lines="3-4"></pre>', repo());
  assert.equal(r.pre, '<pre data-src="core/sync.py" data-lines="3-4"><code class="language-python">def sync(a: list[int]) -&gt; bool:\n    return a &lt; [1] &amp; True</code></pre>');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.embedded, ['core/sync.py:3-4']);
});

test('data-src keeps an existing code tag, takes one line, or takes the whole file', () => {
  const root = repo();
  assert.match(filled('<pre data-src="core/sync.py" data-lines="1"><code class="language-text">stale</code></pre>', root).pre, /<code class="language-text">import db<\/code>/);
  assert.match(filled('<pre data-src="core/sync.py"></pre>', root).pre, /import db\n\ndef sync[\s\S]*# end<\/code>/);
});

test('a rebuild of a filled page changes nothing', () => {
  const root = repo();
  const opts = { componentsDir: join(fixtureDir(), 'components'), root };
  const once = build(bare('<pre data-src="core/sync.py" data-lines="3-4"></pre>'), opts);
  assert.equal(build(once, opts), once);
});

test('data-src refuses a path outside the root and leaves the block alone', () => {
  const root = repo();
  for (const src of ['../outside.py', '/etc/hosts', 'core/../../outside.py']) {
    const r = filled(`<pre data-src="${src}"></pre>`, root);
    assert.equal(r.pre, `<pre data-src="${src}"></pre>`);
    assert.match(r.problems[0], /outside --root/, src);
    assert.deepEqual(r.embedded, []);
  }
});

test('data-src refuses a secrets file and a slice that holds a secret-shaped string', () => {
  const root = repo();
  assert.match(filled('<pre data-src=".env"></pre>', root).problems[0], /secrets file/);
  const r = filled('<pre data-src="core/keys.py"></pre>', root);
  assert.match(r.problems[0], /holds a secret/);
  assert.doesNotMatch(r.out, /51HxQwErTyUiOpAsDfGhJkLz/);
});

test('data-src reports a missing file and a range past the end of the file', () => {
  const root = repo();
  assert.match(filled('<pre data-src="core/nope.py"></pre>', root).problems[0], /data-src="core\/nope\.py": no such file/);
  assert.match(filled('<pre data-src="core/sync.py" data-lines="4-9"></pre>', root).problems[0], /has 5 lines/);
  assert.match(filled('<pre data-src="core/sync.py" data-lines="x"></pre>', root).problems[0], /data-lines="x" should look like 10-24/);
});

test('cli takes --root and lists the files whose code the page now holds', () => {
  const root = repo();
  const dir = mkdtempSync(join(tmpdir(), 'fill-cli-'));
  writeFileSync(join(dir, 'p.src.html'), bare('<pre data-src="core/sync.py" data-lines="3-4"></pre>'));
  const out = execFileSync('node', [BUILD, join(dir, 'p.src.html'), '--root', root], { stdio: 'pipe' }).toString();
  assert.match(out, /code from: core\/sync\.py:3-4/);
  assert.match(readFileSync(join(dir, 'p.html'), 'utf8'), /def sync\(a: list\[int\]\) -&gt; bool:/);
});

test('a page with data-src gets the code component, which draws the file label', () => {
  const out = build(bare('<pre data-src="core/sync.py" data-lines="3-4"></pre>'), { root: repo() });
  assert.match(out, /data-component="code"/);
  assert.match(out, /pre\[data-src\]\[data-lines\]::before/);
});
