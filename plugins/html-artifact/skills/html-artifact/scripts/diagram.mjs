// Draw a diagram from text, so nobody computes SVG coordinates by hand.
//
//   limiter = Rate limiter / token bucket [hot]   # Holds one bucket per API key.
//   redis   = Redis [store]
//   | limiter | redis |
//   limiter --> redis : INCR
//
// A node is `id = Label / sublabel [kinds] # detail`. A `| a | b | . |` row places nodes on a grid, and
// `.` leaves a cell empty. An edge is `a -> b : label`, where `->` is a call, `-->` is asynchronous and
// `..>` is a fallback. `[hot]` or `[problem]` after an edge colours it.
//
// renderDiagram returns the markup figure.diagram already styles, plus one line per problem. The svg
// is null when the text can't be laid out at all.
// ponytail: every edge is one straight line between two boxes. Add orthogonal routing if readers
// need edges that go around a box, because today the fix is to move the nodes in the grid.

const NODE_W = 168, ROW_GAP = 64, PAD = 24, CHARS = 18;
const KINDS = new Set(['hot', 'problem', 'external', 'store', 'queue']);
const ARROWS = { '->': '', '-->': ' async', '..>': ' fallback' };
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = n => Math.round(n * 10) / 10;

// The number of lines a label takes at CHARS characters a line. The estimate runs a little high,
// so the box is never too short for its text.
const lines = s => {
  let count = 1, used = 0;
  for (const word of s.split(/\s+/)) {
    if (used && used + 1 + word.length > CHARS) { count++; used = 0; }
    count += Math.ceil(word.length / CHARS) - 1;
    used = (used ? used + 1 : 0) + (word.length % CHARS || CHARS);
  }
  return count;
};

function parse(src, problems) {
  const nodes = new Map(), edges = [], grid = [];
  src.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const at = `line ${i + 1}`;
    let m;
    if (!line || line.startsWith('#')) return;
    if (line.startsWith('|')) {
      grid.push(line.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    } else if ((m = line.match(/^([\w-]+)\s+(-->|\.\.>|->)\s+([\w-]+)(?:\s*:\s*(.*?))?(?:\s*\[(hot|problem)\])?$/))) {
      edges.push({ from: m[1], to: m[3], cls: `edge${ARROWS[m[2]]}${m[5] ? ` ${m[5]}` : ''}`, label: (m[4] || '').trim(), name: `${m[1]} -> ${m[3]}` });
    } else if ((m = line.match(/^([\w-]+)\s*=\s*(.+)$/))) {
      let [rest, detail = ''] = m[2].split(/\s+#\s+(.*)/);
      const k = rest.match(/\s*\[([^\]]*)\]\s*$/);
      const kinds = k ? k[1].split(/\s+/).filter(Boolean) : [];
      if (k) rest = rest.slice(0, k.index);
      const bad = kinds.find(x => !KINDS.has(x));
      if (bad) problems.push(`${at}: [${bad}] is not a node kind. Use ${[...KINDS].join(', ')}`);
      if (nodes.has(m[1])) problems.push(`${at}: node "${m[1]}" is defined twice`);
      const [label, sub = ''] = rest.split(/\s+\/\s+/).map(s => s.trim());
      nodes.set(m[1], { id: m[1], label, sub, kinds, detail: detail.trim() });
    } else {
      problems.push(`${at}: "${line}" is not a node, an edge or a grid row`);
    }
  });
  return { nodes, edges, grid };
}

// The point where the line from a box's centre toward (tx, ty) leaves the box.
const leave = (b, tx, ty) => {
  const dx = tx - b.cx, dy = ty - b.cy;
  const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return [b.cx + dx * t, b.cy + dy * t];
};

// Whether the segment p→q passes through box b.
const through = (p, q, b) => {
  let t0 = 0, t1 = 1;
  for (const [s, d, lo, hi] of [[p[0], q[0] - p[0], b.x, b.x + b.w], [p[1], q[1] - p[1], b.y, b.y + b.h]]) {
    if (d === 0) { if (s <= lo || s >= hi) return false; continue; }
    const a = (lo - s) / d, c = (hi - s) / d;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  return t0 < t1;
};

export function renderDiagram(src, title = 'Diagram') {
  const problems = [];
  const { nodes, edges, grid } = parse(src, problems);
  if (!nodes.size) problems.push('the diagram has no nodes');

  const gridless = !grid.length;
  if (gridless) grid.push([...nodes.keys()]);
  grid.forEach((row, r) => row.forEach((id, c) => {
    if (!id || id === '.') return;
    const n = nodes.get(id);
    if (!n) problems.push(`grid names "${id}", which is not a node`);
    else if (n.row !== undefined) problems.push(`node "${id}" is placed twice in the grid rows`);
    else Object.assign(n, { row: r, col: c });
  }));
  for (const n of nodes.values()) if (n.row === undefined) problems.push(`node "${n.id}" is missing from the grid rows`);
  for (const e of edges) for (const id of [e.from, e.to]) if (!nodes.has(id)) problems.push(`edge ${e.name} names "${id}", which is not a node`);
  if (problems.length) return { svg: null, problems };

  const cols = Math.max(...grid.map(row => row.length));
  if (gridless && nodes.size > 4) problems.push(`${nodes.size} nodes need grid rows. Place them with | a | b | rows, four columns at most`);
  else if (cols > 4) problems.push(`the grid has ${cols} columns. Use four at most and add rows, because a phone scrolls a wide diagram sideways`);
  if (nodes.size > 12) problems.push(`${nodes.size} nodes is too many to read. Keep a diagram to 12, and split the rest into a second one`);
  for (const n of nodes.values()) if (n.label.length > 32) problems.push(`the label of "${n.id}" is ${n.label.length} characters. Shorten it to 32, and move the rest to the sublabel or the detail`);
  for (const e of edges) if (e.label.length > 28) problems.push(`the label on ${e.name} is ${e.label.length} characters. An arrow carries a few words, so shorten it to 28`);

  // Rows are as tall as their tallest label. Two neighbouring columns sit far enough apart for the
  // longest label between them, with 22px of arrow showing on each side of it.
  const rowH = grid.map(() => 48);
  for (const n of nodes.values()) {
    const h = 16 + lines(n.label) * 17 + (n.sub ? 2 + lines(n.sub) * 16 : 0) + (n.kinds.includes('store') ? 12 : 0);
    rowH[n.row] = Math.max(rowH[n.row], h + (h % 2));
  }
  const gaps = Array.from({ length: cols - 1 }, () => 72);
  for (const e of edges) {
    const [i, j] = [nodes.get(e.from).col, nodes.get(e.to).col].sort((x, y) => x - y);
    if (j - i === 1) gaps[i] = Math.max(gaps[i], Math.ceil(e.label.length * 7.2 + 56));
  }
  const colX = c => PAD + c * NODE_W + gaps.slice(0, c).reduce((a, b) => a + b, 0);
  const top = PAD + (edges.some(e => e.from === e.to && nodes.get(e.from).row === 0) ? 32 : 0);
  const rowY = rowH.map((_, r) => top + rowH.slice(0, r).reduce((a, b) => a + b, 0) + r * ROW_GAP);
  for (const n of nodes.values()) {
    Object.assign(n, { x: colX(n.col), y: rowY[n.row], w: NODE_W, h: rowH[n.row] });
    Object.assign(n, { cx: n.x + n.w / 2, cy: n.y + n.h / 2 });
  }
  const W = colX(cols - 1) + NODE_W + PAD;
  const H = rowY.at(-1) + rowH.at(-1) + PAD;

  const paths = [], labels = [];
  const label = (text, x, y) => {
    if (!text) return;
    const w = Math.ceil(text.length * 7.2 + 12);
    labels.push(`<g class="label"><rect x="${r1(x - w / 2)}" y="${r1(y - 9)}" width="${w}" height="18" rx="3"/><text x="${r1(x)}" y="${r1(y)}">${esc(text)}</text></g>`);
  };
  for (const e of edges) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    if (a === b) {
      // A loop back to the same node arcs over the top of its box.
      paths.push(`<path class="${e.cls}" d="M${a.cx - 14},${a.y} C${a.cx - 14},${a.y - 36} ${a.cx + 14},${a.y - 36} ${a.cx + 14},${a.y}"/>`);
      label(e.label, a.cx, a.y - 30);
      continue;
    }
    let p = leave(a, b.cx, b.cy), q = leave(b, a.cx, a.cy);
    // Two edges between the same pair would share one line, so each moves to its own side.
    // Its label moves further out the same way, so the two labels sit outside the pair.
    const paired = edges.some(o => o.from === e.to && o.to === e.from);
    let out = [0, 0];
    if (paired) {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nx = -(q[1] - p[1]) / len, ny = (q[0] - p[0]) / len;
      p = [p[0] + nx * 8, p[1] + ny * 8];
      q = [q[0] + nx * 8, q[1] + ny * 8];
      const reach = (Math.abs(nx) * (e.label.length * 7.2 + 12) + Math.abs(ny) * 18) / 2 + 4;
      out = [nx * reach, ny * reach];
    }
    const blocker = [...nodes.values()].find(n => n !== a && n !== b && through(p, q, n));
    if (blocker) problems.push(`edge ${e.name} runs through "${blocker.id}". Move the nodes in the grid rows so the two ends have a clear line`);
    paths.push(`<path class="${e.cls}" d="M${r1(p[0])},${r1(p[1])} L${r1(q[0])},${r1(q[1])}"/>`);
    label(e.label, (p[0] + q[0]) / 2 + out[0], (p[1] + q[1]) / 2 + out[1]);
  }

  const boxes = [...nodes.values()].map(n => {
    const store = n.kinds.includes('store');
    const shape = store
      ? `<path d="M${n.x},${n.y + 7} a${n.w / 2},7 0 0 1 ${n.w},0 v${n.h - 14} a${n.w / 2},7 0 0 1 ${-n.w},0 z M${n.x},${n.y + 7} a${n.w / 2},7 0 0 0 ${n.w},0"/>`
      : `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.kinds.includes('queue') ? n.h / 2 : 6}"/>`;
    const cls = ['node', ...n.kinds.filter(k => k !== 'queue')].join(' ');
    const [fy, fh] = store ? [n.y + 12, n.h - 12] : [n.y, n.h];
    return `<g class="${cls}"${n.detail ? ` data-detail="${esc(n.detail)}"` : ''}>${shape}`
      + `<foreignObject x="${n.x}" y="${fy}" width="${n.w}" height="${fh}"><div class="fo" xmlns="http://www.w3.org/1999/xhtml">${esc(n.label)}${n.sub ? `<small>${esc(n.sub)}</small>` : ''}</div></foreignObject></g>`;
  });

  const svg = `<div class="scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">\n`
    + `${[...paths, ...boxes, ...labels].join('\n')}\n</svg></div>`;
  return { svg, problems };
}
