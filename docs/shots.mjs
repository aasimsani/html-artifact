// Captures the README images from the two built examples. Run it after a component or an example changes:
//   node docs/shots.mjs
// It needs Node >= 22 and Google Chrome, like the tests.
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch } from '../plugins/html-artifact/skills/html-artifact/scripts/cdp.mjs';

const here = path => new URL(path, import.meta.url).pathname;
const example = name => pathToFileURL(here(`../plugins/html-artifact/examples/${name}.example.html`)).href;
const out = name => here(`./screenshots/${name}.webp`);
const wait = ms => new Promise(r => setTimeout(r, ms));

// A whole-section crop runs from the section's eyebrow to its last block. It leaves out the review controls
// and anything hidden, because a hidden element has an empty box at the top left of the page.
const section = id => `#${id} > :not(.rv-ui, [hidden])`;

// Each crop shows one component family, taken from the part of the tour that uses it.
const CROPS = {
  ask: section('decisions'),
  diagram: '#architecture figure.flow, #architecture figure.diagram',
  mock: '#architecture figure.mock',
  timeline: section('rollout'),
  table: section('options'),
  code: '#review table.findings, #review ol.risk, #review .annotated',
  testplan: section('testplan'),
  explorer: section('data'),
  erd: section('schema'),
  mindmap: section('ideas'),
  variants: section('variants'),
  playground: section('tune'),
  editor: section('triage'),
  content: section('followups'),
};

// The crops hide the floating buttons, which sit over the page, and the review controls inside each section,
// which would show as a sliver at the edge of a crop.
const HIDE_CONTROLS = `document.head.append(Object.assign(document.createElement('style'), { textContent: '[data-theme-toggle], .rv-tray, .ask-next, main .rv-ui { visibility: hidden !important; }' }))`;

// Selects a phrase in the first section with a real mouse drag, saves a comment on it, scrolls to that section
// and opens the review drawer.
async function comment(page, phrase, text) {
  const at = await page.eval(`(() => {
    const walker = document.createTreeWalker(document.querySelector('#start'), NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !node.textContent.includes(${JSON.stringify(phrase)}));
    const i = node.textContent.indexOf(${JSON.stringify(phrase)});
    const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + ${phrase.length});
    const rects = range.getClientRects(), a = rects[0], b = rects[rects.length - 1];
    return { x1: a.left + 1, y1: a.top + a.height / 2, x2: b.right - 1, y2: b.top + b.height / 2 };
  })()`);
  await page.drag(at.x1, at.y1, at.x2, at.y2);
  await wait(200);
  await page.eval(`document.querySelector('.rv-helper').click()`);
  await page.eval(`(() => {
    const pop = document.querySelector('.rv-popover');
    (pop.querySelector('[data-sev="question"]') || pop.querySelector('[data-sev]')).click();
    pop.querySelector('textarea').value = ${JSON.stringify(text)};
    pop.querySelector('[data-action="save"]').click();
  })()`);
  await page.eval(`document.querySelector('#start').scrollIntoView(); document.querySelector('.rv-tray').click()`);
  await wait(400);
}

mkdirSync(here('./screenshots/'), { recursive: true });
const browser = await launch();
try {
  for (const scheme of ['light', 'dark']) {
    const page = await browser.open(example('tour'), { scheme });
    await page.screenshot(out(`tour-${scheme}`), { scale: 2 });
    await page.close();
  }

  // At 860px the page has one column that is wide enough for the text diagram, so nothing in a crop scrolls sideways.
  const column = await browser.open(example('tour'), { width: 860, height: 900 });
  await column.eval(HIDE_CONTROLS);
  for (const [name, selector] of Object.entries(CROPS)) await column.screenshot(out(name), { selector, scale: 2, pad: 12 });
  await column.close();

  const deck = await browser.open(`${example('deck')}#proposal`, { width: 1280, height: 720 });
  await deck.eval(`document.querySelector('.deck-present-btn').click()`);
  await wait(400);
  await deck.screenshot(out('deck'), { scale: 2 });
  await deck.close();

  // The comment is saved in the browser profile, so this capture runs last and the crops above stay clean.
  const review = await browser.open(example('tour'));
  await comment(review, 'inlined only the components that HTML uses', 'How many bytes does the review kit add to each page?');
  await review.screenshot(out('review'), { scale: 2 });
  await review.close();
} finally {
  await browser.close();
}
