import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';

const VERIFY = new URL('../skills/html-artifact/scripts/verify.mjs', import.meta.url).pathname;
const fx = name => new URL(`./fixtures/${name}.html`, import.meta.url).pathname;

// The secret fixture is assembled at runtime from pieces, so the repo never holds a credential-shaped
// string that push protection or a scanner would flag. It mirrors fixtures/redacted.html with real-looking values.
const secretFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-secret-'));
  const key = ['sk', 'live', '51HxQwErTyUiOpAsDfGhJkLz'].join('_');
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'abc'].join('.');
  const html = readFileSync(fx('redacted'), 'utf8')
    .replace('<title>redacted</title>', '<title>secret</title>')
    .replace('&lt;REDACTED:STRIPE_KEY&gt;', key)
    .replace('Bearer $API_TOKEN', `Bearer ${jwt}`);
  const file = join(dir, 'secret.html');
  writeFileSync(file, html);
  return file;
};

// A page that talks to a session receiver on loopback, which isn't running here.
const loopbackFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-loopback-'));
  const file = join(dir, 'loopback.html');
  writeFileSync(file, readFileSync(fx('good'), 'utf8').replace('</main>', '</main><script>new EventSource("http://127.0.0.1:9/events?t=x");</script>'));
  return file;
};

// A diagram label too long for its 30px box.
const clippedFixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-clipped-'));
  const file = join(dir, 'clipped.html');
  writeFileSync(file, readFileSync(fx('good'), 'utf8').replace('</main>', `<svg viewBox="0 0 200 40" width="200" height="40"><foreignObject x="0" y="0" width="120" height="30"><div class="fo" xmlns="http://www.w3.org/1999/xhtml" style="height:100%;overflow:hidden;font-size:14px">Authentication and authorization service</div></foreignObject></svg></main>`));
  return file;
};

let results;
before(async () => {
  const list = await verify([fx('bad'), fx('good'), fx('review'), fx('review-broken'), fx('review-lede'), secretFixture(), fx('redacted'), loopbackFixture(), clippedFixture()]);
  results = Object.fromEntries(list.map(r => [r.file.match(/(\w[\w-]*)\.html$/)[1], r]));
});

const has = (r, re) => assert.ok(r.problems.some(p => re.test(p)), `expected a problem matching ${re}, got ${JSON.stringify(r.problems)}`);

test('flags a console error', () => has(results.bad, /console/));
test('flags an external request', () => has(results.bad, /external request.*example\.invalid/));
test('flags horizontal overflow at 400px', () => has(results.bad, /overflow at 400px/));
test('flags a page with no dark mode', () => has(results.bad, /dark mode/));
test('flags text under 12px', () => has(results.bad, /under 12px/));
test('passes a clean page', () => assert.deepEqual(results.good.problems, []));
test('passes a review page whose helper appears on selection', () => assert.deepEqual(results.review.problems, []));
test('ignores a long lede outside main when probing the selection helper', () => assert.deepEqual(results['review-lede'].problems, []));
test('flags a review page whose helper never appears', () => has(results['review-broken'], /selection helper/));

test('flags credential-shaped strings', () => has(results.secret, /possible secret/));
test('passes typed placeholders and env-var references', () => assert.deepEqual(results.redacted.problems, []));

test('loopback connections to the session receiver are not external requests or errors', () => assert.deepEqual(results.loopback.problems, []));

test('flags diagram labels clipped by their box', () => has(results.clipped, /clipped/));

test('cli exits 1 on problems and 0 on a clean page', () => {
  assert.throws(() => execFileSync('node', [VERIFY, fx('bad')], { stdio: 'pipe' }), e => e.status === 1);
  execFileSync('node', [VERIFY, fx('good')], { stdio: 'pipe' });
});

test('a screenshot can be cropped to elements, padded, scaled up, and written as WebP', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-shot-'));
  const file = join(dir, 'box.html');
  // The boxes sit below the first screen, so the test also proves the crop reaches past the viewport.
  // They sit 40px from the left edge, because the padding stops at the edge of the page.
  writeFileSync(file, '<!doctype html><body style="margin:0"><div style="height:1500px"></div><div id="box" class="b" style="width:200px;height:100px;margin-left:40px;background:#4338ca"></div><div class="b" style="width:200px;height:100px;margin:50px 0 0 40px;background:#166534"></div></body>');
  const browser = await launch();
  // The browser closes in `finally`, because a throw that left Chrome open would keep the test process alive.
  try {
    const p = await browser.open(pathToFileURL(file).href);
    await p.screenshot(join(dir, 'box.png'), { selector: '#box', scale: 2 });
    await p.screenshot(join(dir, 'box.webp'), { selector: '#box' });
    await p.screenshot(join(dir, 'both.png'), { selector: '.b', pad: 10 });
    await p.screenshot(join(dir, 'screen.png'), { scale: 2 });
    await assert.rejects(p.screenshot(join(dir, 'none.png'), { selector: '#missing' }), /no element matches #missing/);
  } finally {
    await browser.close();
  }
  const size = name => { const png = readFileSync(join(dir, name)); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
  assert.deepEqual(size('box.png'), [400, 200], 'the crop is the element size times the scale');
  assert.deepEqual(size('both.png'), [220, 270], 'several matches are cropped as one box, with the padding around it');
  assert.deepEqual(size('screen.png'), [2560, 1600], 'without a selector the scale applies to the viewport');
  assert.equal(readFileSync(join(dir, 'box.webp')).subarray(8, 12).toString(), 'WEBP');
});
