#!/usr/bin/env node
// Check built artifacts in headless Chrome before delivering them.
//
//   node verify.mjs [--shots DIR] page.html [more.html ...]
//
// It prints ✓ or ✗ per file with one line per problem, and exits 1 when any file has a problem.
// With --shots, it writes <name>-desktop.png, -dark.png and -phone.png for the agent to look at.
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const BG = `(() => { const b = getComputedStyle(document.body).backgroundColor;
  return b === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : b; })()`;

// Visible text below 12px. SVG text counts at its rendered size, after the viewBox scales it.
const SMALL_TEXT = `(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || !el.checkVisibility()) continue;
    let px = parseFloat(getComputedStyle(el).fontSize);
    // SVG text scales with its viewBox. HTML inside a foreignObject scales with the foreignObject.
    const scaler = el instanceof SVGGraphicsElement ? el : el.closest('svg') ? el.closest('foreignObject') : null;
    if (scaler?.getScreenCTM) px *= scaler.getScreenCTM()?.a ?? 1;
    if (px < 11.5) out.push(Math.round(px * 10) / 10 + 'px "' + n.textContent.trim().slice(0, 30) + '"');
  }
  return out;
})()`;

// Select the start of the first long paragraph with a real mouse drag, then count floating elements that appeared.
const PROBE_TARGET = `(() => {
  document.querySelectorAll('body *').forEach(e => {
    const pos = getComputedStyle(e).position;
    if ((pos === 'fixed' || pos === 'absolute') && e.checkVisibility()) e.dataset.verifySeen = '1';
  });
  const p = [...document.querySelectorAll('main section p, main p')].find(e => e.textContent.trim().length > 40);
  if (!p) return null;
  p.scrollIntoView({ block: 'center' });
  const t = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim().length > 20 ? 1 : 3 }).nextNode();
  const r = document.createRange();
  r.setStart(t, 0); r.setEnd(t, 20);
  const box = r.getClientRects()[0];
  return { x1: box.left + 1, y: box.top + box.height / 2, x2: box.right - 1 };
})()`;
const PROBE_COUNT = `[...document.querySelectorAll('body *')].filter(e => {
  const pos = getComputedStyle(e).position;
  return (pos === 'fixed' || pos === 'absolute') && e.checkVisibility() && !e.dataset.verifySeen;
}).length`;

// Credential shapes, adapted from the f-labs research-reports gate. Typed placeholders such as
// <REDACTED:API_KEY> and env-var references ($API_TOKEN) don't match.
const SECRETS = /AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|[?&](?:api_key|access_token|token|sig|X-Amz-Signature)=[^&\s"'<]{8,}|:\/\/[^/\s:@"'<]+:[^@\s"'<$]{3,}@/g;

// Scan the authored content only. Inlined component code is ours and is skipped.
const secrets = file => [...new Set(readFileSync(file, 'utf8')
  .replace(/<(style|script) data-component="[^"]*">[\s\S]*?<\/\1>/g, '')
  .match(SECRETS) || [])];

async function check(browser, file, shots) {
  const url = pathToFileURL(file).href;
  const name = basename(file, '.html');
  const problems = [];
  for (const s of secrets(file)) problems.push(`possible secret: ${s.slice(0, 12)}… (replace it with a <REDACTED:KIND> placeholder)`);

  const desk = await browser.open(url);
  const lightBg = await desk.eval(BG);
  const small = await desk.eval(SMALL_TEXT);
  // Diagram labels (.fo inside a foreignObject) hide overflow, so a label too long for its box is silently cut.
  const clipped = await desk.eval(`[...document.querySelectorAll('foreignObject .fo')].filter(d => d.scrollHeight > d.clientHeight + 1 || d.scrollWidth > d.clientWidth + 1).map(d => d.textContent.trim().slice(0, 30))`);
  const hasReview = await desk.eval(`!!document.querySelector('[data-component="review"]')`);
  if (shots) await desk.screenshot(`${shots}/${name}-desktop.png`);
  if (hasReview) {
    const at = await desk.eval(PROBE_TARGET);
    if (at) {
      await desk.drag(at.x1, at.y, at.x2, at.y);
      await new Promise(r => setTimeout(r, 250));
      if (!(await desk.eval(PROBE_COUNT))) problems.push('selection helper did not appear after selecting text');
    }
  }
  // The session receiver lives on loopback, so its traffic and its refusals when it's down don't count.
  const LOOPBACK = /https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;
  for (const e of desk.errors.filter(e => !LOOPBACK.test(e))) problems.push(`console error: ${e.slice(0, 200)}`);
  for (const u of new Set(desk.external.filter(u => !LOOPBACK.test(u)))) problems.push(`external request: ${u.slice(0, 120)}`);
  if (clipped.length) problems.push(`${clipped.length} diagram labels are clipped by their box, e.g. "${clipped[0]}". Make the box bigger or the label shorter`);
  if (small.length) problems.push(`${small.length} text runs under 12px, e.g. ${small.slice(0, 3).join(', ')}`);
  await desk.close();

  const dark = await browser.open(url, { scheme: 'dark' });
  if ((await dark.eval(BG)) === lightBg) problems.push('no dark mode: the background is the same under prefers-color-scheme: dark');
  if (shots) await dark.screenshot(`${shots}/${name}-dark.png`);
  await dark.close();

  const phone = await browser.open(url, { width: 400 });
  const overflow = await phone.eval('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  if (overflow > 1) problems.push(`overflow at 400px: the page is ${overflow}px wider than the screen`);
  if (shots) await phone.screenshot(`${shots}/${name}-phone.png`);
  await phone.close();

  return { file, problems };
}

export async function verify(files, { shots } = {}) {
  const browser = await launch();
  try {
    const results = [];
    for (const f of files) results.push(await check(browser, f, shots));
    return results;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let shots;
  if (args[0] === '--shots') [, shots] = args.splice(0, 2);
  if (!args.length) {
    console.error('usage: verify.mjs [--shots DIR] page.html [...]');
    process.exit(2);
  }
  const results = await verify(args, { shots });
  for (const r of results) {
    console.log(`${r.problems.length ? '✗' : '✓'} ${r.file}`);
    for (const p of r.problems) console.log(`  ✗ ${p}`);
  }
  process.exit(results.some(r => r.problems.length) ? 1 : 0);
}
