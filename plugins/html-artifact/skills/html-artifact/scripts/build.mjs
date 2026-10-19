#!/usr/bin/env node
// Inline the components a page names into one self-contained HTML file.
//
//   node build.mjs page.src.html [page.html]
//
// A page names its components in <meta name="components" content="shell,review">.
// Each name maps to components/<name>.css and/or components/<name>.js. A component
// declares what it needs on its first line as /* requires: a, b */, and those load first.
// Inlined blocks carry data-component, so rebuilding a built page replaces them in place.
//
// Without the meta, the page gets shell and review plus every component whose declared selectors
// appear in its markup. A component declares them on a header line: /* enhances: .rail, [data-ask] */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = process.env.HTML_ARTIFACT_COMPONENTS
  || join(dirname(fileURLToPath(import.meta.url)), '..', 'components');

const read = (dir, name, ext) => {
  const p = join(dir, `${name}.${ext}`);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};

function resolve(names, dir, seen = new Set(), order = []) {
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const css = read(dir, name, 'css');
    const js = read(dir, name, 'js');
    if (css === null && js === null) throw new Error(`unknown component: ${name}`);
    const requires = `${css ?? ''}\n${js ?? ''}`.match(/^\/[*/]\s*requires:\s*([\w, -]+)/m);
    if (requires) resolve(requires[1].split(/[\s,]+/).filter(Boolean), dir, seen, order);
    order.push({ name, css, js });
  }
  return order;
}

const insertBefore = (html, tag, text, last = false) => {
  const i = last ? html.lastIndexOf(tag) : html.indexOf(tag);
  if (i < 0) throw new Error(`page has no ${tag}`);
  return html.slice(0, i) + text + html.slice(i);
};

// A selector matches when its class sits in a class attribute as a whole word, or its attribute is present.
const uses = (html, selector) => {
  const cls = selector.match(/\.([\w-]+)(\*?)/);
  if (cls) return new RegExp(`class="[^"]*(?<![\\w-])${cls[1]}${cls[2] ? '' : '(?![\\w-])'}[^"]*"`).test(html);
  const attr = selector.match(/^\[([\w-]+)/);
  return attr ? new RegExp(`\\s${attr[1]}[\\s=>]`).test(html) : false;
};

function detect(html, dir) {
  const names = new Set(readdirSync(dir).map(f => f.replace(/\.(css|js)$/, '')));
  const used = [...names].filter(name => {
    const header = `${read(dir, name, 'css') ?? ''}\n${read(dir, name, 'js') ?? ''}`.match(/^\/[*/]\s*enhances:\s*(.+?)\s*(?:\*\/)?$/m);
    return header && header[1].split(',').map(s => s.trim()).filter(Boolean).some(sel => uses(html, sel));
  });
  return ['shell', 'review', ...used];
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const sectionTexts = html => Object.fromEntries([...html.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)]
  .map(([, id, body]) => [id, body
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ').trim()
    .replace(/\s+([.,;:!?])/g, '$1')]));

export function build(html, { componentsDir = DEFAULT_DIR } = {}) {
  html = html.replace(/<(style|script)\b[^>]*\bdata-component="[^"]*"[^>]*>[\s\S]*?<\/\1>\n/g, '');
  const meta = html.match(/<meta name="components" content="([^"]*)"/);
  const names = meta ? meta[1].split(/[\s,]+/).filter(Boolean) : detect(html, componentsDir);
  const parts = resolve(names, componentsDir);
  const block = (tag, p, body) => `<${tag} data-component="${p.name}">${body}</${tag}>\n`;
  const styles = parts.filter(p => p.css !== null).map(p => block('style', p, p.css)).join('');
  // When listen.sh is running, the agent exports its URL so Send to Claude posts straight into the session.
  const submit = process.env.HTML_ARTIFACT_SUBMIT_URL
    ? block('script', { name: 'submit-url' }, `window.__CLAUDE_SUBMIT_URL__ = ${JSON.stringify(process.env.HTML_ARTIFACT_SUBMIT_URL).replace(/</g, '\\u003c')};`)
    : '';
  // The review kit compares these build-time section texts with the last build the reader saw,
  // so it can show what the agent changed without being fooled by scripts that rewrite the DOM.
  const sections = parts.some(p => p.name === 'review')
    ? `<script type="application/json" data-component="sections">${JSON.stringify(sectionTexts(html)).replace(/</g, '\\u003c')}</script>\n`
    : '';
  const scripts = submit + sections + parts.filter(p => p.js !== null).map(p => block('script', p, p.js)).join('');
  return insertBefore(insertBefore(html, '</head>', styles), '</body>', scripts, true);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, out = src.replace(/\.src\.html$/, '.html')] = process.argv.slice(2);
  if (!src || out === src) {
    console.error('usage: build.mjs page.src.html [page.html]');
    process.exit(2);
  }
  writeFileSync(out, build(readFileSync(src, 'utf8')));
  console.log(out);
}
