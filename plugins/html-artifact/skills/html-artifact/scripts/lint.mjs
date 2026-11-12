// Check a page's source for mistakes a browser can't report, before any browser runs.
//
//   import { lint } from './lint.mjs';
//   lint(html)  →  ['h1 "UK VAT questions" names a topic. …', …]
//
// Each problem is one line that says what is wrong and how to fix it. build.mjs prints them as ✗ lines.
// ponytail: every check is a regex over the source, so markup that nests a component inside itself can
// fool one. Switch to a real HTML parser if a check starts to misfire.

// Credential shapes, adapted from the f-labs research-reports gate. Typed placeholders such as
// <REDACTED:API_KEY> and env-var references ($API_TOKEN) don't match.
export const SECRETS = /AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|[?&](?:api_key|access_token|token|sig|X-Amz-Signature)=[^&\s"'<]{8,}|:\/\/[^/\s:@"'<]+:[^@\s"'<$]{3,}@/g;

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, 'x').replace(/\s+/g, ' ').trim();
const words = s => (s.match(/\S+/g) || []).length;
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
// A sentence has at least four words and ends with a full stop or an exclamation mark.
const isSentence = s => words(s) >= 4 && /[.!]["'”’)]?$/.test(s);
const inner = (html, re) => { const m = html.match(re); return m ? text(m[1]) : null; };

// Tags that may sit inside <pre>. Any other tag there is code the author forgot to escape.
const INLINE = /^(code|span|mark|b|i|em|strong|a|ins|del|u|s|small|sub|sup|kbd|var|samp|br)$/i;

export function lint(source) {
  const problems = [];
  // Inlined runtime blocks are ours, and they hold markup inside strings.
  const html = source.replace(/<(style|script)\b[^>]*\bdata-component="[^"]*"[^>]*>[\s\S]*?<\/\1>/g, '');

  const h1 = inner(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  const lede = inner(html, /<p\b[^>]*class="[^"]*\blede\b[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  if (h1 && h1.endsWith('?')) problems.push(`h1 "${h1}" is a question. State the answer instead`);
  else if (h1 && !isSentence(h1) && !(lede && isSentence(lede))) {
    problems.push(`h1 "${h1}" names a topic. State the answer as a full sentence in the h1 or in p.lede`);
  }

  const options = {};
  const seen = new Set();
  for (const [, open, body] of html.matchAll(/(<div\b[^>]*class="[^"]*\bask\b[^"]*"[^>]*>)([\s\S]*?)<\/div>/g)) {
    const id = attr(open, 'data-id');
    const def = attr(open, 'data-default');
    const values = [...body.matchAll(/<input\b[^>]*type="?radio[^>]*>/g)].map(([tag]) => attr(tag, 'value'));
    if (!id) problems.push('a div.ask has no data-id. Give each decision block a unique data-id');
    else if (seen.has(id)) problems.push(`two decision blocks share data-id="${id}". Make each one unique`);
    seen.add(id);
    if (id) options[id] = values;
    if (def === undefined) problems.push(`ask "${id ?? '?'}" has no data-default. Pre-select the option you recommend`);
    else if (!values.includes(def)) problems.push(`ask "${id ?? '?'}": data-default="${def}" matches no option value (${values.join(', ')})`);
  }

  for (const [, cond] of html.matchAll(/\sdata-if="([^"]*)"/g)) {
    const m = cond.match(/^([\w-]+)!?=(.*)$/);
    if (!m) problems.push(`data-if="${cond}" should look like id=value or id!=value`);
    else if (!options[m[1]]) problems.push(`data-if="${cond}" names no decision block. Use the data-id of a div.ask`);
    else if (!options[m[1]].includes(m[2])) problems.push(`data-if="${cond}": "${m[2]}" is not an option of "${m[1]}" (${options[m[1]].join(', ')})`);
  }

  // Code, mock templates and data scripts hold text that looks like markup, so they don't count as page markup.
  const markup = html.replace(/<(pre|template|script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '');
  const ids = {};
  for (const [, id] of markup.matchAll(/\sid="([^"]+)"/g)) ids[id] = (ids[id] || 0) + 1;
  for (const [id, n] of Object.entries(ids)) if (n > 1) problems.push(`id="${id}" appears ${n} times. Ids must be unique`);
  for (const [, id] of markup.matchAll(/\shref="#([^"]+)"/g)) if (!ids[id]) problems.push(`href="#${id}" points at no id on the page`);

  for (const [, list] of html.matchAll(/<ol\b[^>]*class="[^"]*\bnotes\b[^"]*"[^>]*>([\s\S]*?)<\/ol>/g)) {
    for (const [, open, body] of list.matchAll(/(<li\b[^>]*>)([\s\S]*?)<\/li>/g)) {
      const n = words(text(body));
      if (n > 40) problems.push(`note ${attr(open, 'id') ?? ''} is ${n} words. Keep each margin note under 40`.replace('  ', ' '));
    }
  }

  for (const [, body] of html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)) {
    const raw = [...body.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].find(([, tag]) => !INLINE.test(tag));
    if (raw) problems.push(`a <pre> holds a raw ${raw[0]} tag, which the browser swallows. Write &lt; for every < in code`);
  }

  for (const [, body] of html.matchAll(/<figure\b[^>]*class="[^"]*\bmock\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/g)) {
    const tpl = body.match(/<template\b[^>]*>([\s\S]*?)<\/template>/);
    if (!tpl) { problems.push('a figure.mock has no <template>. Put the mock\'s HTML inside one'); continue; }
    for (const [, ref] of body.replace(tpl[0], '').matchAll(/<li\b[^>]*\sdata-ref="([^"]+)"/g)) {
      if (!tpl[1].includes(` data-ref="${ref}"`)) problems.push(`pin data-ref="${ref}" matches nothing in its mock. Put data-ref="${ref}" on the element it points at`);
    }
  }

  return problems;
}
