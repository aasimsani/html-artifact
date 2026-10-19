// requires: shell
// Sortable, filterable tables with a live row count and CSV export; and a weighted matrix that re-ranks live.
(() => {
  const HA = window.HA;
  const num = s => { const t = s.replace(/[$,%\s]/g, ''); return t !== '' && !isNaN(t) ? +t : null; };
  const cell = c => c.textContent.trim();
  const quote = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = table => [table.tHead.rows[0], ...[...table.tBodies[0].rows].filter(r => !r.hidden)]
    .map(r => [...r.cells].map(c => quote(cell(c).replace(/\s*[↑↓]$/, ''))).join(',')).join('\n');

  document.querySelectorAll('table[data-sortable]').forEach(table => {
    const body = table.tBodies[0];
    const rows = [...body.rows];
    const tools = document.createElement('div');
    tools.className = 'table-tools';
    tools.dataset.ui = '';
    const filter = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Filter rows' });
    filter.setAttribute('aria-label', 'Filter rows');
    const count = Object.assign(document.createElement('span'), { className: 'count' });
    count.setAttribute('aria-live', 'polite');
    const copy = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copy CSV' });
    tools.append(filter, count, copy);
    table.before(tools);

    const show = () => {
      const q = filter.value.trim().toLowerCase();
      let n = 0;
      rows.forEach(r => { const hit = !q || r.textContent.toLowerCase().includes(q); r.hidden = !hit; n += hit; });
      count.textContent = `${n} of ${rows.length} rows`;
    };
    filter.addEventListener('input', show);
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(csv(table)); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
      setTimeout(() => { copy.textContent = 'Copy CSV'; }, 1200);
    });

    [...table.tHead.rows[0].cells].forEach((th, k) => {
      th.tabIndex = 0;
      const sort = () => {
        const dir = th.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
        [...table.tHead.rows[0].cells].forEach(x => x.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
        const key = r => { const t = cell(r.cells[k]); const v = num(t); return v === null ? t.toLowerCase() : v; };
        rows.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; }).forEach(r => body.append(r));
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', e => { if (e.key === 'Enter') sort(); });
    });
    show();
  });

  document.querySelectorAll('table.matrix').forEach(table => {
    const head = [...table.tHead.rows[0].cells];
    const weighted = head.map((th, i) => [th, i]).filter(([th]) => th.dataset.weight !== undefined);
    const rows = [...table.tBodies[0].rows];
    const verdict = table.nextElementSibling?.matches('p.verdict') ? table.nextElementSibling : null;
    weighted.forEach(([th]) => {
      const label = th.textContent.trim();
      const range = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 10, value: th.dataset.weight });
      range.setAttribute('aria-label', `Weight: ${label}`);
      const w = Object.assign(document.createElement('span'), { className: 'weight' });
      w.dataset.ui = '';
      th.append(w, range);
    });
    const update = () => {
      const ws = weighted.map(([th]) => +th.querySelector('input').value);
      const sum = ws.reduce((a, b) => a + b, 0) || 1;
      weighted.forEach(([th], j) => { th.querySelector('.weight').textContent = `${Math.round((100 * ws[j]) / sum)}%`; });
      const totals = rows.map(r => {
        const t = weighted.reduce((acc, [, i], j) => acc + ws[j] * (num(cell(r.cells[i])) ?? 0), 0) / sum;
        const c = r.querySelector('td.total');
        if (c) c.textContent = t.toFixed(1);
        return t;
      });
      const best = totals.indexOf(Math.max(...totals));
      rows.forEach((r, i) => r.classList.toggle('win', i === best));
      if (verdict) {
        const names = weighted.map(([th], j) => `${th.firstChild.textContent.trim()} ${Math.round((100 * ws[j]) / sum)}%`);
        verdict.textContent = `With weights ${names.join(', ')}, ${cell(rows[best].cells[0])} wins at ${totals[best].toFixed(1)}.`;
      }
    };
    table.addEventListener('input', update);
    update();
  });

  HA.table = { csv };
})();
