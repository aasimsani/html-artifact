import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { launch } from '../skills/html-artifact/scripts/cdp.mjs';
import { build } from '../skills/html-artifact/scripts/build.mjs';
import { doc, fixture } from './helpers.mjs';

const RECEIVER = new URL('../skills/html-artifact/scripts/receiver.mjs', import.meta.url).pathname;
const TOKEN = 'testtoken0123456789abcdef';

let proc, url, out = '', browser;
before(async () => {
  proc = spawn('node', [RECEIVER], { env: { ...process.env, HTML_ARTIFACT_TOKEN: TOKEN, HTML_ARTIFACT_PORT: '0' } });
  proc.stdout.on('data', d => { out += d; });
  url = await new Promise((resolve, reject) => {
    let err = '';
    proc.stderr.on('data', d => { err += d; const m = err.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/\?t=\w+)/); if (m) resolve(m[1]); });
    proc.on('exit', c => reject(new Error(`receiver exited ${c}: ${err}`)));
  });
  browser = await launch();
});
after(async () => { proc.kill(); await browser.close(); });

const waitFor = async (pred, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise(r => setTimeout(r, 50))) if (pred()) return true;
  return false;
};

test('the receiver forwards a submission with the right token as one tagged line', async () => {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ kind: 'review', comments: [] }) });
  assert.equal(res.status, 200);
  assert.ok(await waitFor(() => out.includes('HTML_ARTIFACT_SUBMIT')));
  const line = out.trim().split('\n').find(l => l.startsWith('HTML_ARTIFACT_SUBMIT '));
  assert.deepEqual(JSON.parse(line.slice('HTML_ARTIFACT_SUBMIT '.length)).body, { kind: 'review', comments: [] });
});

test('the receiver rejects a wrong token, a GET and an oversized body', async () => {
  const bad = url.replace(/t=\w+/, 't=nope');
  assert.equal((await fetch(bad, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(300 * 1024) })).status, 413);
});

test('build injects the submit url from HTML_ARTIFACT_SUBMIT_URL and replaces it on rebuild', () => {
  process.env.HTML_ARTIFACT_SUBMIT_URL = 'http://127.0.0.1:1/?t=a';
  const once = build(doc('<p>x</p>'));
  process.env.HTML_ARTIFACT_SUBMIT_URL = 'http://127.0.0.1:2/?t=b';
  const twice = build(once);
  delete process.env.HTML_ARTIFACT_SUBMIT_URL;
  assert.match(once, /window\.__CLAUDE_SUBMIT_URL__ = "http:\/\/127\.0\.0\.1:1\/\?t=a"/);
  assert.equal((twice.match(/__CLAUDE_SUBMIT_URL__ =/g) || []).length, 1);
  assert.match(twice, /127\.0\.0\.1:2/);
});

test('Send to Claude posts the review export to the receiver', async () => {
  process.env.HTML_ARTIFACT_SUBMIT_URL = url;
  const fx = fixture(doc('<p>Body text for the section.</p>'));
  delete process.env.HTML_ARTIFACT_SUBMIT_URL;
  const p = await browser.open(fx.url);
  const before = out.length;
  const status = await p.eval(`(async () => {
    document.querySelector('.rv-tray').click();
    document.querySelector('.rv-drawer button.rv-send').click();
    for (let i = 0; i < 40 && !/sent/i.test(document.querySelector('.rv-send-status').textContent); i++) await new Promise(r => setTimeout(r, 50));
    return document.querySelector('.rv-send-status').textContent;
  })()`);
  await p.close();
  assert.match(status, /sent/i);
  assert.ok(await waitFor(() => out.length > before && out.slice(before).includes('"reviewed"')));
});

test('without a listener, Send falls back to copying the export', async () => {
  const fx = fixture(doc('<p>Body text for the section.</p>'));
  assert.doesNotMatch(readFileSync(fx.file, 'utf8'), /__CLAUDE_SUBMIT_URL__ =/);
  const p = await browser.open(fx.url);
  const status = await p.eval(`(async () => {
    document.querySelector('.rv-tray').click();
    document.querySelector('.rv-drawer button.rv-send').click();
    const st = () => document.querySelector('.rv-send-status').textContent;
    for (let i = 0; i < 100 && !/clipboard/i.test(st()); i++) await new Promise(r => setTimeout(r, 50));
    return st();
  })()`);
  await p.close();
  assert.match(status, /clipboard/i);
});

test('listen.sh starts one receiver per session and reports it again on a second call', async () => {
  const { execFileSync } = await import('node:child_process');
  const LISTEN = new URL('../skills/html-artifact/scripts/listen.sh', import.meta.url).pathname;
  const sid = `test-${process.pid}`;
  const kv = s => Object.fromEntries(s.trim().split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const env = { ...process.env, CLAUDE_CODE_REMOTE_SESSION_ID: '' };
  const first = kv(execFileSync('bash', [LISTEN, sid], { env }).toString());
  const second = kv(execFileSync('bash', [LISTEN, sid], { env }).toString());
  const pid = readFileSync(`${process.env.TMPDIR || '/tmp'}/html-artifact-${sid}.pid`.replace('//', '/'), 'utf8').trim();
  try {
    assert.equal(first.STATUS, 'STARTED');
    assert.equal(second.STATUS, 'RUNNING');
    assert.equal(second.URL, first.URL);
    assert.equal((await fetch(first.URL, { method: 'POST', body: '{"ping":1}' })).status, 200);
    assert.ok(await waitFor(() => readFileSync(first.LOG, 'utf8').includes('HTML_ARTIFACT_SUBMIT')));
  } finally { process.kill(+pid); }
});
