// requires: shell
// ERD explorer: entity tables (table.entity) laid out in a responsive grid, with FK -> PK
// reference lines drawn in an SVG overlay, a click-to-focus lens that dims unrelated entities,
// and a column search box. State is {focus, search}.
(() => {
  const HA = window.HA;
  const SVG = 'http://www.w3.org/2000/svg';
  const se = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  // Every FK row (tr[data-ref]), resolved to the PK row it points at.
  const refs = erd => [...erd.querySelectorAll('tr[data-ref]')].map(row => {
    const [entity, col] = row.dataset.ref.split('.');
    const target = erd.querySelector(`table.entity[data-name="${entity}"] tr[data-col="${col}"]`);
    return target ? { row, target, card: row.dataset.card } : null;
  }).filter(Boolean);

  // Edge endpoints in viewport coordinates: whichever side of each row faces the other row.
  const edgesOf = erd => refs(erd).map(({ row, target, card }) => {
    const a = row.getBoundingClientRect(), b = target.getBoundingClientRect();
    const fromLeft = a.left + a.width / 2 > b.left + b.width / 2;
    const x1 = fromLeft ? a.left : a.right, y1 = a.top + a.height / 2;
    const x2 = fromLeft ? b.right : b.left, y2 = b.top + b.height / 2;
    const [many, one] = card ? card.split(':').reverse() : ['n', '1'];
    return { row, target, x1, y1, x2, y2, one, many };
  });

  function draw(erd, svg) {
    const box = erd.getBoundingClientRect();
    svg.style.width = `${erd.scrollWidth}px`;
    svg.style.height = `${erd.scrollHeight}px`;
    svg.replaceChildren();
    const label = (text, x, y) => {
      const g = se('g', { class: 'label' });
      const t = se('text', { x, y: y + 1 });
      t.textContent = text;
      g.append(se('rect', { x: x - 8, y: y - 9, width: 16, height: 18 }), t);
      svg.append(g);
    };
    for (const e of edgesOf(erd)) {
      const x1 = e.x1 - box.left, y1 = e.y1 - box.top, x2 = e.x2 - box.left, y2 = e.y2 - box.top;
      const mx = (x1 + x2) / 2;
      const path = se('path', { class: 'edge', d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
      path.dataset.row = e.row.closest('table.entity').dataset.name;
      path.dataset.target = e.target.closest('table.entity').dataset.name;
      svg.append(path);
      label(e.many, x1 + (x2 > x1 ? 10 : -10), y1);
      label(e.one, x2 + (x1 > x2 ? 10 : -10), y2);
    }
  }

  function applyFocus(erd, name) {
    const related = new Set();
    if (name) {
      related.add(name);
      for (const { row, target } of refs(erd)) {
        const a = row.closest('table.entity').dataset.name;
        const b = target.closest('table.entity').dataset.name;
        if (a === name) related.add(b);
        if (b === name) related.add(a);
      }
    }
    erd.querySelectorAll('table.entity').forEach(t => {
      const n = t.dataset.name;
      t.classList.toggle('focus', n === name);
      t.classList.toggle('dim', !!name && !related.has(n));
    });
    erd.querySelectorAll('.lines .edge').forEach(p => {
      p.classList.toggle('active', !!name && (p.dataset.row === name || p.dataset.target === name));
    });
  }

  function applySearch(erd, query) {
    const q = query.trim().toLowerCase();
    erd.querySelectorAll('tr[data-col]').forEach(row => {
      row.classList.toggle('match', !!q && row.dataset.col.toLowerCase().includes(q));
    });
  }

  document.querySelectorAll('.erd').forEach((erd, idx) => {
    const id = erd.dataset.id || `erd-${idx}`;
    const name = `erd:${id}`;
    const tables = [...erd.children];

    const search = document.createElement('div');
    search.className = 'search';
    const input = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Search columns' });
    input.setAttribute('aria-label', 'Search columns');
    search.append(input);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.append(...tables);

    const lines = se('svg', { class: 'lines' });
    erd.append(search, grid, lines);

    let state = { focus: null, search: '' };
    const redraw = () => draw(erd, lines);
    new ResizeObserver(redraw).observe(erd);

    grid.addEventListener('click', e => {
      const caption = e.target.closest('caption');
      if (!caption) return;
      const n = caption.closest('table.entity').dataset.name;
      state.focus = state.focus === n ? null : n;
      applyFocus(erd, state.focus);
      HA.changed(name);
    });

    input.addEventListener('input', () => {
      state.search = input.value;
      applySearch(erd, state.search);
      HA.changed(name);
    });

    HA.register(name, {
      state: () => state,
      restore: s => {
        state = { focus: s.focus || null, search: s.search || '' };
        input.value = state.search;
        applyFocus(erd, state.focus);
        applySearch(erd, state.search);
        redraw();
      },
      summary: () => (state.focus ? `focus: ${state.focus}` : state.search ? `search: "${state.search}"` : 'no focus'),
    });
  });

  HA.erd = { edges: edgesOf };
})();
