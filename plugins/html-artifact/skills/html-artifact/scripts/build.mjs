#!/usr/bin/env node
// Inline the components a page names into one self-contained HTML file.
//
//   node build.mjs page.src.html [page.html] [--verify] [--shots DIR] [--root DIR]
//
// A page names its components in <meta name="components" content="shell,review">.
// Each name maps to components/<name>.css and/or components/<name>.js. A component
// declares what it needs on its first line as /* requires: a, b */, and those load first.
// Inlined blocks carry data-component, so rebuilding a built page replaces them in place.
//
// Without the meta, the page gets shell and review plus every component whose declared selectors
// appear in its markup. A component declares them on a header line: /* enhances: .rail, [data-ask] */
import { readFileSync, writeFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve as absolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, SECRETS } from './lint.mjs';
import { renderDiagram } from './diagram.mjs';

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

// Conservative minifiers. CSS loses comments and spare whitespace. JS loses only full-line comments,
// indentation and blank lines, because anything cleverer needs a parser to stay safe.
const minCss = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
  .replace(/\s*([{};])\s*/g, '$1').replace(/:\s+/g, ':').replace(/,\s+/g, ',').trim();
const minJs = js => js.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n');

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

// <pre data-src="core/sync.py" data-lines="10-24"> is filled from the file under `root`, so the agent
// never retypes code and the page can't drift from the repo. A built page gets shared, which is why
// the fill refuses anything outside the root, any file named like a secrets file, and any slice that
// holds a secret-shaped string.
const SECRET_FILE = /(^|\/)(\.env(\.[\w.-]+)?|\.npmrc|\.netrc|\.pgpass|id_(rsa|dsa|ecdsa|ed25519)|credentials(\.\w+)?|secrets?(\.\w+)?|[^/]*\.(pem|key|p12|pfx|keystore))$/i;
const LANG = { py: 'python', js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash' };
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const outside = (root, file) => { const rel = relative(root, file); return rel.startsWith('..') || isAbsolute(rel); };

function fillCode(html, root, problems, embedded) {
  return html.replace(/(<pre\b[^>]*\sdata-src="([^"]+)"[^>]*>)([\s\S]*?)<\/pre>/g, (whole, open, src, body) => {
    const fail = why => { problems.push(`data-src="${src}": ${why}`); return whole; };
    const file = absolute(root, src);
    if (outside(root, file)) return fail('the path is outside --root, so the build will not read it');
    if (SECRET_FILE.test(src)) return fail('the name looks like a secrets file, so the build will not read it');
    if (!existsSync(file)) return fail(`no such file under ${root}. Pass --root <repo>`);
    // A symlink inside the root can still point outside it.
    if (outside(realpathSync(root), realpathSync(file))) return fail('the path is outside --root, so the build will not read it');
    const lines = readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
    const range = open.match(/\sdata-lines="([^"]*)"/)?.[1];
    const m = range?.match(/^(\d+)(?:-(\d+))?$/);
    if (range !== undefined && !m) return fail(`data-lines="${range}" should look like 10-24`);
    const [from, to] = m ? [+m[1], +(m[2] ?? m[1])] : [1, lines.length];
    if (from < 1 || to < from || to > lines.length) return fail(`the file has ${lines.length} lines, so data-lines="${range}" is out of range`);
    const slice = lines.slice(from - 1, to).join('\n');
    if (slice.search(SECRETS) >= 0) return fail('the slice holds a secret-shaped string, so the build will not embed it');
    embedded.push(range ? `${src}:${range}` : src);
    const lang = LANG[extname(src).slice(1)];
    const code = body.match(/<code\b[^>]*>/)?.[0] ?? (lang ? `<code class="language-${lang}">` : '<code>');
    return `${open}${code}${escape(slice)}</code></pre>`;
  });
}

// <figure class="diagram"><script type="text/diagram">…</script></figure> becomes the SVG that
// figure.diagram already styles. The caption doubles as the picture's accessible name.
function drawDiagrams(html, problems) {
  return html.replace(/(<figure\b[^>]*class="[^"]*\bdiagram\b[^"]*"[^>]*>)([\s\S]*?)<\/figure>/g, (whole, open, body) => {
    const text = body.match(/<script type="text\/diagram">([\s\S]*?)<\/script>/);
    if (!text) return whole;
    const caption = body.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/)?.[1].replace(/<[^>]+>/g, '').trim();
    const drawn = renderDiagram(text[1], caption || 'Diagram');
    problems.push(...drawn.problems.map(p => `diagram: ${p}`));
    return drawn.svg ? `${open}${body.replace(text[0], () => drawn.svg)}</figure>` : whole;
  });
}

// `problems` collects one line per mistake in the source, and `embedded` lists the files whose code
// the page now holds. The page is built either way.
export function build(html, { componentsDir = DEFAULT_DIR, root = process.cwd(), problems = [], embedded = [] } = {}) {
  html = html.replace(/<(style|script)\b[^>]*\bdata-component="[^"]*"[^>]*>[\s\S]*?<\/\1>\n/g, '');
  problems.push(...lint(html));
  html = drawDiagrams(fillCode(html, root, problems, embedded), problems);
  const meta = html.match(/<meta name="components" content="([^"]*)"/);
  const names = meta ? meta[1].split(/[\s,]+/).filter(Boolean) : detect(html, componentsDir);
  const parts = resolve(names, componentsDir);
  const block = (tag, p, body) => `<${tag} data-component="${p.name}">${body}</${tag}>\n`;
  const styles = parts.filter(p => p.css !== null).map(p => block('style', p, minCss(p.css))).join('');
  // When listen.sh is running, the agent exports its URL so Send to Claude posts straight into the session.
  const submit = process.env.HTML_ARTIFACT_SUBMIT_URL
    ? block('script', { name: 'submit-url' }, `window.__CLAUDE_SUBMIT_URL__ = ${JSON.stringify(process.env.HTML_ARTIFACT_SUBMIT_URL).replace(/</g, '\\u003c')};`)
    : '';
  // The review kit compares these build-time section texts with the last build the reader saw,
  // so it can show what the agent changed without being fooled by scripts that rewrite the DOM.
  const sections = parts.some(p => p.name === 'review')
    ? `<script type="application/json" data-component="sections">${JSON.stringify(sectionTexts(html)).replace(/</g, '\\u003c')}</script>\n`
    : '';
  const scripts = submit + sections + parts.filter(p => p.js !== null).map(p => block('script', p, minJs(p.js))).join('');
  return insertBefore(insertBefore(html, '</head>', styles), '</body>', scripts, true);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // node build.mjs page.src.html [page.html] [--verify] [--shots DIR] [--root DIR]
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1]; };
  const verifyAfter = flag('--verify');
  const shots = option('--shots');
  const root = option('--root');
  const [src, out = src?.replace(/\.src\.html$/, '.html')] = args;
  if (!src || out === src) {
    console.error('usage: build.mjs page.src.html [page.html] [--verify] [--shots DIR] [--root DIR]');
    process.exit(2);
  }
  const problems = [], embedded = [];
  writeFileSync(out, build(readFileSync(src, 'utf8'), { root, problems, embedded }));
  console.log(out);
  // The reader should know which files' code is inside the page before they share it.
  if (embedded.length) console.log(`code from: ${embedded.join(', ')}`);
  // Tell the session receiver, so any open copy of this page reloads itself.
  if (process.env.HTML_ARTIFACT_SUBMIT_URL) {
    await fetch(process.env.HTML_ARTIFACT_SUBMIT_URL.replace('/?', '/built?'), {
      method: 'POST', body: JSON.stringify({ path: absolute(out) }), signal: AbortSignal.timeout(2000),
    }).catch(() => {});
  }
  if (verifyAfter) {
    const { verify } = await import('./verify.mjs');
    problems.push(...(await verify([out], { shots }))[0].problems);
  }
  if (verifyAfter || problems.length) console.log(`${problems.length ? '✗' : '✓'} ${out}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(problems.length ? 1 : 0);
}
