import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verify } from '../skills/html-artifact/scripts/verify.mjs';

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

let results;
before(async () => {
  const list = await verify([fx('bad'), fx('good'), fx('review'), fx('review-broken'), fx('review-lede'), secretFixture(), fx('redacted')]);
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

test('cli exits 1 on problems and 0 on a clean page', () => {
  assert.throws(() => execFileSync('node', [VERIFY, fx('bad')], { stdio: 'pipe' }), e => e.status === 1);
  execFileSync('node', [VERIFY, fx('good')], { stdio: 'pipe' });
});
