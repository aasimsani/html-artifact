// requires: shell
// Brainstorm grid: pick one winner, shortlist or reject any variant, keep per-variant notes,
// and compare any two shortlisted variants side by side.
(() => {
  const HA = window.HA;
  document.querySelectorAll('.variants').forEach(grid => {
    const id = grid.dataset.id || 'variants';
    const name = `variants:${id}`;
    const articles = [...grid.querySelectorAll('.variant')];
    const state = { picked: null, shortlisted: [], rejected: [], notes: {} };
    const toggleIn = (list, vid) => { const i = list.indexOf(vid); i === -1 ? list.push(vid) : list.splice(i, 1); };

    articles.forEach(a => {
      const vid = a.dataset.id;
      const toolbar = document.createElement('div');
      toolbar.className = 'variant-toolbar';
      toolbar.dataset.ui = '';
      const pick = document.createElement('button');
      pick.type = 'button'; pick.dataset.action = 'pick'; pick.dataset.ui = ''; pick.textContent = 'Pick';
      const star = document.createElement('button');
      star.type = 'button'; star.dataset.action = 'shortlist'; star.dataset.ui = ''; star.textContent = '☆ Shortlist';
      const reject = document.createElement('button');
      reject.type = 'button'; reject.dataset.action = 'reject'; reject.dataset.ui = ''; reject.textContent = 'Reject';
      pick.addEventListener('click', () => { state.picked = state.picked === vid ? null : vid; HA.changed(name); render(); });
      star.addEventListener('click', () => { toggleIn(state.shortlisted, vid); HA.changed(name); render(); });
      reject.addEventListener('click', () => { toggleIn(state.rejected, vid); HA.changed(name); render(); });
      toolbar.append(pick, star, reject);

      const notesLabel = document.createElement('label');
      notesLabel.className = 'variant-notes';
      notesLabel.dataset.ui = '';
      notesLabel.append('Notes');
      const textarea = document.createElement('textarea');
      textarea.rows = 2;
      textarea.dataset.ui = '';
      textarea.addEventListener('input', () => { state.notes[vid] = textarea.value; HA.changed(name); });
      notesLabel.append(textarea);

      a.append(toolbar, notesLabel);
    });

    const tools = document.createElement('div');
    tools.className = 'variants-tools';
    tools.dataset.ui = '';
    const compareBtn = document.createElement('button');
    compareBtn.type = 'button'; compareBtn.dataset.ui = ''; compareBtn.textContent = 'Compare shortlisted';
    const hint = document.createElement('p');
    hint.className = 'variants-hint';
    hint.dataset.ui = '';
    tools.append(compareBtn, hint);
    grid.before(tools);

    let comparing = false;
    function render() {
      articles.forEach(a => {
        const vid = a.dataset.id;
        a.classList.toggle('picked', state.picked === vid);
        a.classList.toggle('shortlisted', state.shortlisted.includes(vid));
        a.classList.toggle('rejected', state.rejected.includes(vid));
        a.querySelector('[data-action="pick"]').setAttribute('aria-pressed', state.picked === vid);
        a.querySelector('[data-action="shortlist"]').setAttribute('aria-pressed', state.shortlisted.includes(vid));
        a.querySelector('[data-action="reject"]').setAttribute('aria-pressed', state.rejected.includes(vid));
      });
      const twoShortlisted = state.shortlisted.length === 2;
      grid.classList.toggle('comparing', comparing && twoShortlisted);
      hint.textContent = comparing && !twoShortlisted ? 'Shortlist exactly two variants to compare.' : '';
      articles.forEach(a => { a.hidden = comparing && twoShortlisted && !state.shortlisted.includes(a.dataset.id); });
    }
    compareBtn.addEventListener('click', () => {
      comparing = !comparing;
      compareBtn.setAttribute('aria-pressed', comparing);
      render();
    });

    HA.register(name, {
      state: () => ({ picked: state.picked, shortlisted: [...state.shortlisted], rejected: [...state.rejected], notes: { ...state.notes } }),
      restore: s => {
        state.picked = s.picked ?? null;
        state.shortlisted = s.shortlisted ?? [];
        state.rejected = s.rejected ?? [];
        state.notes = s.notes ?? {};
        articles.forEach(a => { a.querySelector('textarea').value = state.notes[a.dataset.id] || ''; });
        render();
      },
      summary: () => {
        const parts = [];
        if (state.picked) parts.push(`picked ${state.picked}`);
        if (state.shortlisted.length) parts.push(`shortlisted ${state.shortlisted.join(', ')}`);
        if (state.rejected.length) parts.push(`rejected ${state.rejected.join(', ')}`);
        return parts.length ? parts.join(' · ') : 'no decisions yet';
      },
    });

    render();
  });
})();
