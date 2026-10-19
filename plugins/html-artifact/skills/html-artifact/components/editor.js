// requires: shell
// enhances: .editor-list
// Throwaway editor: a one-off triage, reorder or label tool whose result goes back to Claude.
// Page contract: <ol class="editor-list" data-id="…" data-labels="bug,feature" data-tones="crit,good">
//   <li data-id="T-12">Item text <small>meta</small></li>…</ol>
// Registered state is { order: [ids], labels: {id: [...]}, deleted: [ids], edits: {id: text} }.
(() => {
  const HA = window.HA;
  const h = (tag, props = {}) => { const e = Object.assign(document.createElement(tag), props); e.dataset.ui = ''; return e; };

  document.querySelectorAll('.editor-list').forEach(list => {
    const id = list.dataset.id || 'editor';
    const labels = (list.dataset.labels || '').split(',').map(s => s.trim()).filter(Boolean);
    const tones = (list.dataset.tones || '').split(',').map(s => s.trim());
    const toneOf = label => tones[labels.indexOf(label)] || '';

    const items = [...list.querySelectorAll(':scope > li[data-id]')];
    const originals = new Map();
    const textNodes = new Map();
    const elBy = new Map(items.map(li => [li.dataset.id, li]));

    for (const li of items) {
      const small = li.querySelector('small');
      const main = [...li.childNodes].filter(n => n !== small).map(n => n.textContent).join(' ').trim().replace(/\s+/g, ' ');
      originals.set(li.dataset.id, main);
      li.replaceChildren();
      const textNode = document.createTextNode(main);
      textNodes.set(li.dataset.id, textNode);
      li.append(textNode);
      if (small) li.append(' ', small);
      const chips = h('span', { className: 'et-chips' });
      for (const label of labels) {
        const chip = h('button', { type: 'button', className: 'et-chip', textContent: label, title: `Toggle ${label}` });
        chip.dataset.label = label;
        chip.dataset.tone = toneOf(label);
        chip.setAttribute('aria-pressed', 'false');
        chips.append(chip);
      }
      const del = h('button', { type: 'button', className: 'et-del', textContent: '×' });
      li.append(chips, del);
      li.tabIndex = 0;
      li.draggable = true;
    }

    const state = { order: items.map(li => li.dataset.id), labels: {}, deleted: [], edits: {} };
    let filterLabel = null;
    let dragId = null;

    // A plain wrapper, not UI chrome itself, so the toolbar, the list and its trash share one
    // ancestor to delegate events from — including once a deleted item's li moves into the trash.
    const wrap = document.createElement('div');
    wrap.className = 'et-wrap';
    list.replaceWith(wrap);

    const toolbar = h('div', { className: 'et-toolbar' });
    const filterSelect = h('select', { className: 'et-filter' });
    filterSelect.setAttribute('aria-label', 'Filter by label');
    filterSelect.append(h('option', { value: '', textContent: 'All labels' }));
    for (const label of labels) filterSelect.append(h('option', { value: label, textContent: label }));
    const count = h('span', { className: 'et-count' });
    count.setAttribute('aria-live', 'polite');
    toolbar.append(filterSelect, count);

    const trash = h('details', { className: 'et-trash', hidden: true });
    trash.append(h('summary', { textContent: 'Deleted' }));
    const trashList = h('ul', { className: 'et-trash-list' });
    trash.append(trashList);

    wrap.append(toolbar, list, trash);

    const countText = () => {
      const live = state.order.filter(x => !state.deleted.includes(x));
      const parts = [`${live.length} item${live.length === 1 ? '' : 's'}`];
      for (const label of labels) {
        const n = live.filter(x => (state.labels[x] || []).includes(label)).length;
        if (n) parts.push(`${n} labelled ${label}`);
      }
      if (state.deleted.length) parts.push(`${state.deleted.length} deleted`);
      return parts.join(' · ');
    };

    const render = () => {
      for (const [idd, li] of elBy) {
        textNodes.get(idd).textContent = state.edits[idd] ?? originals.get(idd);
        const active = new Set(state.labels[idd] || []);
        li.querySelectorAll('.et-chip').forEach(chip => chip.setAttribute('aria-pressed', String(active.has(chip.dataset.label))));
        const isDeleted = state.deleted.includes(idd);
        li.classList.toggle('et-deleted', isDeleted);
        li.draggable = !isDeleted;
        li.tabIndex = isDeleted ? -1 : 0;
        li.querySelector('.et-del').textContent = isDeleted ? 'Restore' : '×';
        li.querySelector('.et-del').setAttribute('aria-label', `${isDeleted ? 'Restore' : 'Delete'} ${idd}`);
      }
      const visible = state.order
        .filter(idd => !state.deleted.includes(idd))
        .filter(idd => !filterLabel || (state.labels[idd] || []).includes(filterLabel));
      list.replaceChildren(...visible.map(idd => elBy.get(idd)));
      trashList.replaceChildren(...state.deleted.map(idd => elBy.get(idd)));
      trash.hidden = !state.deleted.length;
      count.textContent = countText();
    };

    const commit = () => { HA.changed(`editor:${id}`); render(); };

    const commitOrderFromDom = () => {
      const newVisible = [...list.children].map(li => li.dataset.id);
      let k = 0;
      state.order = state.order.map(idd => {
        const eligible = !state.deleted.includes(idd) && (!filterLabel || (state.labels[idd] || []).includes(filterLabel));
        return eligible ? newVisible[k++] : idd;
      });
      commit();
    };

    let toastTimer;
    const toast = (text, onUndo) => {
      document.querySelectorAll('.et-toast').forEach(t => t.remove());
      clearTimeout(toastTimer);
      const el = h('div', { className: 'et-toast' });
      el.append(document.createTextNode(text), ' ');
      const undo = h('button', { type: 'button', textContent: 'Undo' });
      undo.addEventListener('click', () => { onUndo(); el.remove(); });
      el.append(undo);
      document.body.append(el);
      toastTimer = setTimeout(() => el.remove(), 5000);
    };

    const toggleDeleted = idd => {
      const was = state.deleted.includes(idd);
      state.deleted = was ? state.deleted.filter(x => x !== idd) : [...state.deleted, idd];
      commit();
      if (!was) toast(`Deleted ${idd}`, () => toggleDeleted(idd));
    };

    const textNodeOf = idd => textNodes.get(idd);
    const startEdit = li => {
      const idd = li.dataset.id;
      if (state.deleted.includes(idd)) return;
      const text = textNodeOf(idd);
      const input = h('input', { type: 'text', className: 'et-edit', value: state.edits[idd] ?? originals.get(idd) });
      li.insertBefore(input, text);
      text.remove();
      input.focus();
      input.select();
      const finish = save => {
        input.remove();
        li.insertBefore(text, li.firstChild);
        if (save) {
          const val = input.value.trim();
          if (val && val !== originals.get(idd)) state.edits[idd] = val; else delete state.edits[idd];
          commit();
        }
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
    };

    wrap.addEventListener('click', e => {
      const chip = e.target.closest('.et-chip');
      if (chip) {
        const li = chip.closest('li');
        const idd = li.dataset.id;
        const set = new Set(state.labels[idd] || []);
        set.has(chip.dataset.label) ? set.delete(chip.dataset.label) : set.add(chip.dataset.label);
        state.labels[idd] = [...set];
        commit();
        return;
      }
      const del = e.target.closest('.et-del');
      if (del) toggleDeleted(del.closest('li').dataset.id);
    });

    wrap.addEventListener('dblclick', e => {
      if (e.target.closest('.et-chip, .et-del, small, input')) return;
      const li = e.target.closest('li[data-id]');
      if (li && !state.deleted.includes(li.dataset.id)) startEdit(li);
    });

    // Keyboard reorder targets the focused item even when a test (or a screen reader) dispatches
    // the key on the list itself rather than on the li, so fall back to document.activeElement.
    wrap.addEventListener('keydown', e => {
      const li = e.target.closest?.('li[data-id]') || document.activeElement?.closest?.('li[data-id]');
      if (!li || state.deleted.includes(li.dataset.id)) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const sib = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
        if (!sib) return;
        e.key === 'ArrowUp' ? sib.before(li) : sib.after(li);
        li.focus();
        commitOrderFromDom();
      } else if (e.key === 'Enter' && !e.target.closest('input')) {
        e.preventDefault();
        startEdit(li);
      }
    });

    wrap.addEventListener('dragstart', e => {
      const li = e.target.closest('li[data-id]');
      if (!li || state.deleted.includes(li.dataset.id)) return;
      dragId = li.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    wrap.addEventListener('dragover', e => {
      const li = e.target.closest('li[data-id]');
      if (!li || !dragId || li.dataset.id === dragId) return;
      e.preventDefault();
    });
    wrap.addEventListener('drop', e => {
      const li = e.target.closest('li[data-id]');
      if (!li || !dragId || li.dataset.id === dragId) return;
      e.preventDefault();
      const dragged = elBy.get(dragId);
      const before = e.clientY < li.getBoundingClientRect().top + li.offsetHeight / 2;
      before ? li.before(dragged) : li.after(dragged);
      dragId = null;
      commitOrderFromDom();
    });

    filterSelect.addEventListener('change', () => { filterLabel = filterSelect.value || null; render(); });

    HA.register(`editor:${id}`, {
      state: () => JSON.parse(JSON.stringify(state)),
      restore: s => { Object.assign(state, { order: s.order, labels: s.labels, deleted: s.deleted, edits: s.edits }); },
      summary: () => countText(),
    });
    render();
  });
})();
