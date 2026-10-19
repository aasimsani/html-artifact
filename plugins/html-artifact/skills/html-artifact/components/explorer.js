// requires: shell
// enhances: .explorer
// Data explorer: a facet sidebar (AND across fields, OR within a field), a search box, a
// sortable paginated table, an optional day histogram, row expansion, and CSV/SQL exports.
(() => {
  const HA = window.HA;
  const PAGE_SIZE = 200;
  const quote = v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const toCSV = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => quote(String(r[c] ?? ''))).join(','))].join('\n');
  const numOf = v => { const n = Number(v); return v !== '' && v !== null && v !== undefined && !isNaN(n) ? n : null; };

  document.querySelectorAll('.explorer').forEach((root, n) => {
    const id = root.dataset.id || root.id || String(n);
    const facetFields = (root.dataset.facets || '').split(',').map(s => s.trim()).filter(Boolean);
    const timeField = root.dataset.time || null;
    const script = root.querySelector('script[type="application/json"]');
    const rows = script ? JSON.parse(script.textContent) : [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const idxOf = new Map(rows.map((r, i) => [r, i]));

    const filters = {};
    facetFields.forEach(f => { filters[f] = new Set(); });
    let search = '';
    let sortField = null, sortDir = 1;
    let page = 0;
    let lastFiltered = rows;
    const expanded = new Set();

    const matchesFacetsExcept = (row, except) => facetFields.every(f => {
      if (f === except) return true;
      const sel = filters[f];
      return sel.size === 0 || sel.has(String(row[f]));
    });
    const matchesSearch = row => !search || columns.some(c => String(row[c] ?? '').toLowerCase().includes(search));
    const matchesAll = row => matchesFacetsExcept(row, null) && matchesSearch(row);

    const sqlWhere = () => {
      const clauses = facetFields.filter(f => filters[f].size).map(f => {
        const vals = [...filters[f]].map(v => `'${v.replace(/'/g, "''")}'`);
        return vals.length === 1 ? `${f} = ${vals[0]}` : `${f} IN (${vals.join(', ')})`;
      });
      return clauses.length ? clauses.join(' AND ') : '1=1';
    };

    const summaryText = () => {
      const parts = facetFields.filter(f => filters[f].size).map(f => `${f}=${[...filters[f]].join('|')}`);
      let s = `${lastFiltered.length} of ${rows.length} rows`;
      if (parts.length) s += ' · ' + parts.join(', ');
      if (search) s += ` · search="${search}"`;
      return s;
    };

    // --- DOM scaffold: header, facet sidebar, tools row, table, pager, histogram. ---
    const header = document.createElement('div');
    header.className = 'exp-header';
    header.dataset.ui = '';
    const countP = document.createElement('p');
    countP.className = 'exp-count';
    header.append(countP);

    const layout = document.createElement('div');
    layout.className = 'exp-layout';
    const sidebar = document.createElement('aside');
    sidebar.className = 'exp-facets';
    sidebar.dataset.ui = '';
    const content = document.createElement('div');
    content.className = 'exp-content';
    layout.append(sidebar, content);

    const facetLists = {};
    facetFields.forEach(field => {
      const group = document.createElement('div');
      group.className = 'exp-facet-group';
      const h = document.createElement('h4');
      h.textContent = field;
      const list = document.createElement('ul');
      group.append(h, list);
      sidebar.append(group);
      facetLists[field] = list;
    });

    const tools = document.createElement('div');
    tools.className = 'exp-tools';
    tools.dataset.ui = '';
    const search_ = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Search all fields' });
    search_.setAttribute('aria-label', 'Search all fields');
    const csvBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copy CSV' });
    const sqlBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copy as SQL WHERE' });
    tools.append(search_, csvBtn, sqlBtn);

    const histoWrap = document.createElement('div');
    histoWrap.className = 'exp-histo';
    histoWrap.dataset.ui = '';

    const table = document.createElement('table');
    table.className = 'exp-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach(col => { const th = document.createElement('th'); th.textContent = col; th.tabIndex = 0; headRow.append(th); });
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    table.append(thead, tbody);

    const pager = document.createElement('div');
    pager.className = 'exp-pager';
    pager.dataset.ui = '';
    const prevBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Prev' });
    const nextBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Next' });
    const pageLabel = document.createElement('span');
    pager.append(prevBtn, pageLabel, nextBtn);

    content.append(tools, ...(timeField ? [histoWrap] : []), table, pager);
    root.append(header, layout);

    // --- rendering ---
    const renderFacets = () => {
      facetFields.forEach(field => {
        const counts = new Map();
        rows.forEach(r => {
          if (!matchesFacetsExcept(r, field) || !matchesSearch(r)) return;
          const v = String(r[field]);
          counts.set(v, (counts.get(v) || 0) + 1);
        });
        const list = facetLists[field];
        list.replaceChildren();
        [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([value, count]) => {
          const li = document.createElement('li');
          const label = document.createElement('label');
          const cb = Object.assign(document.createElement('input'), { type: 'checkbox' });
          cb.checked = filters[field].has(value);
          cb.addEventListener('change', () => {
            if (cb.checked) filters[field].add(value); else filters[field].delete(value);
            page = 0;
            save();
            render();
          });
          const countEl = document.createElement('span');
          countEl.className = 'exp-count-badge';
          countEl.textContent = `(${count})`;
          label.append(cb, document.createTextNode(` ${value} `), countEl);
          li.append(label);
          list.append(li);
        });
      });
    };

    const renderRows = (filtered, slice) => {
      tbody.replaceChildren();
      slice.forEach(row => {
        const tr = document.createElement('tr');
        const idx = idxOf.get(row);
        columns.forEach(col => { const td = document.createElement('td'); td.textContent = String(row[col] ?? ''); tr.append(td); });
        tr.addEventListener('click', () => { expanded.has(idx) ? expanded.delete(idx) : expanded.add(idx); render(); });
        tbody.append(tr);
        if (expanded.has(idx)) {
          const detailTr = document.createElement('tr');
          detailTr.className = 'exp-detail-row';
          detailTr.dataset.ui = '';
          const td = document.createElement('td');
          td.colSpan = columns.length;
          const dl = document.createElement('dl');
          dl.className = 'exp-detail';
          columns.forEach(c => {
            const dt = document.createElement('dt'); dt.textContent = c;
            const dd = document.createElement('dd'); dd.textContent = String(row[c] ?? '');
            dl.append(dt, dd);
          });
          td.append(dl);
          detailTr.append(td);
          tbody.append(detailTr);
        }
      });
    };

    const renderHistogram = filtered => {
      if (!timeField) return;
      histoWrap.replaceChildren();
      const dayOf = row => { const d = new Date(row[timeField]); return isNaN(d) ? null : d.toISOString().slice(0, 10); };
      const allDays = [...new Set(rows.map(dayOf).filter(Boolean))].sort();
      if (!allDays.length) return;
      const counts = new Map(allDays.map(d => [d, 0]));
      filtered.forEach(r => { const d = dayOf(r); if (d && counts.has(d)) counts.set(d, counts.get(d) + 1); });
      const max = Math.max(1, ...counts.values());
      const w = 600, h = 48, bw = w / allDays.length;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Rows per day, ${allDays[0]} to ${allDays[allDays.length - 1]}`);
      allDays.forEach((d, i) => {
        const c = counts.get(d);
        const barH = (c / max) * (h - 2);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(i * bw + 0.5));
        rect.setAttribute('y', String(h - barH));
        rect.setAttribute('width', String(Math.max(1, bw - 1)));
        rect.setAttribute('height', String(barH));
        rect.setAttribute('class', 'exp-histo-bar');
        svg.append(rect);
      });
      histoWrap.append(svg);
    };

    const render = () => {
      let filtered = rows.filter(matchesAll);
      if (sortField) {
        filtered = [...filtered].sort((a, b) => {
          const x = a[sortField], y = b[sortField];
          const nx = numOf(x), ny = numOf(y);
          const cmp = nx !== null && ny !== null ? nx - ny : String(x ?? '').localeCompare(String(y ?? ''));
          return cmp * sortDir;
        });
      }
      lastFiltered = filtered;
      countP.textContent = `${filtered.length} of ${rows.length} rows — the full dataset is embedded in this file.`;
      renderFacets();
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.min(page, totalPages - 1);
      renderRows(filtered, filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE));
      pageLabel.textContent = `Page ${page + 1} of ${totalPages}`;
      prevBtn.disabled = page === 0;
      nextBtn.disabled = page >= totalPages - 1;
      renderHistogram(filtered);
    };

    const save = () => HA.changed(`explorer:${id}`);

    search_.addEventListener('input', () => { search = search_.value.trim().toLowerCase(); page = 0; save(); render(); });
    prevBtn.addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
    nextBtn.addEventListener('click', () => { page += 1; render(); });
    csvBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(toCSV(lastFiltered, columns)); csvBtn.textContent = 'Copied'; } catch { csvBtn.textContent = 'Copy failed'; }
      setTimeout(() => { csvBtn.textContent = 'Copy CSV'; }, 1200);
    });
    sqlBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(sqlWhere()); sqlBtn.textContent = 'Copied'; } catch { sqlBtn.textContent = 'Copy failed'; }
      setTimeout(() => { sqlBtn.textContent = 'Copy as SQL WHERE'; }, 1200);
    });
    headRow.querySelectorAll('th').forEach((th, i) => {
      const col = columns[i];
      const sort = () => {
        sortDir = sortField === col ? -sortDir : 1;
        sortField = col;
        headRow.querySelectorAll('th').forEach(x => x.removeAttribute('aria-sort'));
        th.setAttribute('aria-sort', sortDir > 0 ? 'ascending' : 'descending');
        page = 0;
        render();
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', e => { if (e.key === 'Enter') sort(); });
    });

    HA.register(`explorer:${id}`, {
      state: () => ({ filters: Object.fromEntries(facetFields.map(f => [f, [...filters[f]]])), search: search_.value }),
      restore: saved => {
        facetFields.forEach(f => { filters[f] = new Set((saved.filters && saved.filters[f]) || []); });
        search = (saved.search || '').trim().toLowerCase();
        search_.value = saved.search || '';
        render();
      },
      summary: () => summaryText(),
    });

    render();

    HA.explorer = HA.explorer || new Map();
    HA.explorer.set(id, { csv: () => toCSV(lastFiltered, columns), sql: () => sqlWhere() });
  });
})();
