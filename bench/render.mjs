// Score HTML artifacts in headless Chrome, with the skill's own zero-dependency driver.
//   node render.mjs score [--shots DIR] <files...>   print one JSON line of metrics per file
import { launch } from '../plugins/html-artifact/skills/html-artifact/scripts/cdp.mjs';
import { pathToFileURL } from 'node:url';
import { basename, dirname } from 'node:path';
import { statSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);
let shots = null;
if (rest[0] === '--shots') { shots = rest[1]; rest.splice(0, 2); }

const browser = await launch();
const textLen = page => page.eval('document.body ? document.body.innerText.trim().length : 0');

async function score(file) {
  const name = basename(dirname(file)) + '/' + basename(file, '.html');
  const shot = kind => `${shots}/${name.replace('/', '__')}-${kind}.png`;
  const url = pathToFileURL(file).href;
  const out = { file: name, bytes: statSync(file).size };

  const t0 = Date.now();
  const desk = await browser.open(url);
  out.loadMs = Date.now() - t0;
  out.textChars = await textLen(desk);
  Object.assign(out, await desk.eval(`({
    sections: document.querySelectorAll('section').length,
    svgs: document.querySelectorAll('svg').length,
    tables: document.querySelectorAll('table').length,
    codeBlocks: document.querySelectorAll('pre').length,
    domNodes: document.getElementsByTagName('*').length,
  })`));
  const lightBg = await desk.eval(`getComputedStyle(document.body).backgroundColor`);
  if (shots) await desk.screenshot(shot('desktop'));

  // Review affordances. A real mouse drag selects text inside main; a helper must appear.
  const at = await desk.eval(`(() => {
    document.querySelectorAll('body *').forEach(e => { const p = getComputedStyle(e).position; if ((p === 'fixed' || p === 'absolute') && e.checkVisibility()) e.dataset.seen = '1'; });
    const p = [...document.querySelectorAll('main p, article p, p')].find(e => e.textContent.trim().length > 60 && !e.closest('nav,header,footer'));
    if (!p) return null;
    p.scrollIntoView({ block: 'center' });
    const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim().length > 20 ? 1 : 3 }).nextNode();
    if (!t) return null;
    const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 20);
    const b = r.getClientRects()[0];
    return { x1: b.left + 1, y: b.top + b.height / 2, x2: b.right - 1 };
  })()`);
  let helper = false;
  if (at) {
    await desk.drag(at.x1, at.y, at.x2, at.y);
    await new Promise(r => setTimeout(r, 250));
    helper = await desk.eval(`[...document.querySelectorAll('body *')].some(e => { const p = getComputedStyle(e).position; return (p === 'fixed' || p === 'absolute') && e.checkVisibility() && !e.dataset.seen; })`);
  }
  out.review = await desk.eval(`(() => {
    const html = document.documentElement.outerHTML;
    return {
      sectionCheckboxes: document.querySelectorAll('section input[type=checkbox]').length,
      exportButton: /copy|export|submit|send/i.test([...document.querySelectorAll('button')].map(b => b.textContent).join(' ')),
      roundTrip: /__CLAUDE_SUBMIT_URL__|showSaveFilePicker|companion|Send to Claude/i.test(html),
    };
  })()`);
  out.review.selectionHelper = helper;
  out.errors = desk.errors;
  out.external = [...new Set(desk.external)];
  await desk.close();

  const dark = await browser.open(url, { scheme: 'dark' });
  out.darkBg = await dark.eval(`getComputedStyle(document.body).backgroundColor`);
  out.hasDarkMode = out.darkBg !== lightBg;
  if (shots) await dark.screenshot(shot('dark'));
  await dark.close();

  const phone = await browser.open(url, { width: 400 });
  out.phoneOverflowPx = await phone.eval('Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)');
  if (shots) await phone.screenshot(shot('phone'));
  await phone.close();

  // First paint without JS. A low ratio means the content only exists after scripts run.
  const nojs = await browser.open(url, { js: false });
  out.noJsTextRatio = out.textChars ? +((await textLen(nojs)) / out.textChars).toFixed(2) : 0;
  await nojs.close();
  return out;
}

if (mode === 'score') {
  for (const f of rest) console.log(JSON.stringify(await score(f)));
} else {
  console.error('usage: render.mjs score [--shots DIR] <files...>');
  process.exitCode = 2;
}
await browser.close();
