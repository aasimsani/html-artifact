// A minimal Chrome DevTools Protocol driver with no npm dependencies.
// It launches the system Chrome headless and talks to it over Node's built-in WebSocket (Node >= 22).
// Set CHROME_PATH when Chrome lives somewhere unusual.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

const LOCAL = /^(file|data|blob|about|chrome|devtools):/;

export async function launch() {
  const bin = CANDIDATES.find(p => p && existsSync(p));
  if (!bin) throw new Error('Chrome not found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'html-artifact-chrome-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    proc.on('exit', code => reject(new Error(`Chrome exited (${code}) before it opened DevTools`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${p.method}: ${msg.error.message}`)) : p.resolve(msg.result);
    } else {
      (listeners.get(msg.sessionId) || []).forEach(fn => fn(msg.method, msg.params));
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  async function open(url, { width = 1280, height = 800, scheme = 'light', js = true } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params) => send(method, params, sessionId);
    const page = { errors: [], external: [] };
    let loaded;
    const onLoad = new Promise(r => { loaded = r; });
    listeners.set(sessionId, [(method, p) => {
      if (method === 'Runtime.exceptionThrown') page.errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
      if (method === 'Runtime.consoleAPICalled' && p.type === 'error') page.errors.push(p.args.map(a => a.value ?? a.description).join(' '));
      if (method === 'Log.entryAdded' && p.entry.level === 'error') page.errors.push(p.entry.text);
      if (method === 'Network.requestWillBeSent' && !LOCAL.test(p.request.url)) page.external.push(p.request.url);
      if (method === 'Page.loadEventFired') loaded();
    }]);
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'].map(m => s(m)));
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    if (!js) await s('Emulation.setScriptExecutionDisabled', { value: true });
    await s('Page.navigate', { url });
    await onLoad;
    await new Promise(r => setTimeout(r, 200));

    page.eval = async expression => {
      const { result, exceptionDetails } = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };
    page.drag = async (x1, y1, x2, y2) => {
      const base = { button: 'left', clickCount: 1 };
      await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, ...base });
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x2, y: y2, button: 'left', buttons: 1 });
      await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, ...base });
    };
    page.screenshot = async path => {
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      writeFileSync(path, Buffer.from(data, 'base64'));
    };
    page.close = () => send('Target.closeTarget', { targetId });
    return page;
  }

  async function close() {
    const exited = proc.exitCode !== null ? Promise.resolve() : new Promise(r => proc.once('exit', r));
    await send('Browser.close').catch(() => {});
    ws.close();
    await Promise.race([exited, new Promise(r => setTimeout(r, 3000))]);
    proc.kill();
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  return { open, close };
}
