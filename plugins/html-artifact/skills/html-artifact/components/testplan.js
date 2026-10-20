// requires: shell
// enhances: .testplan
// Test-plan checklist: a state control per step, a sticky global progress bar plus one per flow,
// a search filter, a hide-resolved toggle, and j/k/p/f/b/s keyboard shortcuts.
(() => {
  const HA = window.HA;
  const STATES = ['pending', 'pass', 'fail', 'blocked', 'skipped'];
  const LABEL = { pending: 'Pending', pass: 'Pass', fail: 'Fail', blocked: 'Blocked', skipped: 'Skip' };
  const BAR_STATES = ['pass', 'fail', 'blocked', 'skipped'];

  // The dt immediately before this dt/dd pair carries the label ("Action", "Pass", "Watch").
  const fieldText = (step, label) => {
    const dts = [...step.querySelectorAll('dl > dt')];
    const dt = dts.find(d => d.textContent.trim() === label);
    return dt && dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : '';
  };

  const instances = [];

  document.querySelectorAll('.testplan').forEach((root, n) => {
    const id = root.dataset.id || root.id || String(n);
    const flows = [...root.querySelectorAll('.tp-flow')];
    const steps = [...root.querySelectorAll('.tp-step')];
    steps.forEach((step, i) => { if (!step.dataset.id) step.dataset.id = `step-${i}`; });

    // Global progress bar, sticky above the flows.
    const progress = document.createElement('div');
    progress.className = 'tp-progress';
    progress.dataset.ui = '';
    const track = document.createElement('div');
    track.className = 'tp-bar';
    const fills = {};
    BAR_STATES.forEach(s => { fills[s] = document.createElement('span'); fills[s].className = `tp-fill tp-${s}`; track.append(fills[s]); });
    const summaryLine = document.createElement('p');
    summaryLine.className = 'tp-summary';
    summaryLine.setAttribute('aria-live', 'polite');
    progress.append(track, summaryLine);

    // Search and hide-resolved toolbar.
    const toolbar = document.createElement('div');
    toolbar.className = 'tp-toolbar';
    toolbar.dataset.ui = '';
    const search = Object.assign(document.createElement('input'), { type: 'search', placeholder: 'Search steps' });
    search.setAttribute('aria-label', 'Search steps');
    const hideLabel = document.createElement('label');
    const hideBox = Object.assign(document.createElement('input'), { type: 'checkbox' });
    hideLabel.append(hideBox, document.createTextNode(' Hide resolved'));
    toolbar.append(search, hideLabel);
    root.prepend(toolbar, progress);

    // One sub-bar per flow.
    const flowBars = flows.map(flow => {
      const title = document.createElement('p');
      title.className = 'tp-flow-title';
      title.dataset.ui = '';
      const minutes = flow.dataset.minutes ? ` · ${flow.dataset.minutes} min` : '';
      title.textContent = `${flow.dataset.title || ''}${minutes}`;
      const bar = document.createElement('div');
      bar.className = 'tp-bar tp-bar-sm';
      bar.dataset.ui = '';
      const fs = {};
      BAR_STATES.forEach(s => { fs[s] = document.createElement('span'); fs[s].className = `tp-fill tp-${s}`; bar.append(fs[s]); });
      const label = document.createElement('span');
      label.className = 'tp-flow-summary';
      label.dataset.ui = '';
      const head = document.createElement('div');
      head.className = 'tp-flow-head';
      head.dataset.ui = '';
      head.append(title, label);
      flow.prepend(head, bar);
      return { flow, fills: fs, label };
    });

    // stepState maps a step id to { status, notes }; setters maps it to a status setter.
    const stepState = new Map();
    const setters = new Map();

    const summarize = ids => {
      const c = { total: ids.length, pass: 0, fail: 0, blocked: 0, skipped: 0, pending: 0 };
      ids.forEach(id => c[stepState.get(id).status]++);
      return c;
    };
    const fillBar = (fillEls, c) => {
      const total = c.total || 1;
      BAR_STATES.forEach(s => { fillEls[s].style.width = `${(100 * c[s]) / total}%`; });
    };
    const summaryText = c => `${c.total - c.pending}/${c.total} resolved · ${c.fail} fail · ${c.blocked} blocked`;

    const refresh = () => {
      const allIds = steps.map(s => s.dataset.id);
      const c = summarize(allIds);
      fillBar(fills, c);
      summaryLine.textContent = summaryText(c);
      flowBars.forEach(({ flow, fills: fs, label }) => {
        const ids = [...flow.querySelectorAll('.tp-step')].map(s => s.dataset.id);
        const fc = summarize(ids);
        fillBar(fs, fc);
        label.textContent = `${fc.total - fc.pending}/${fc.total}`;
      });
    };

    const applyFilter = () => {
      const q = search.value.trim().toLowerCase();
      const hide = hideBox.checked;
      steps.forEach(step => {
        const matches = !q || step.textContent.toLowerCase().includes(q);
        const resolved = stepState.get(step.dataset.id).status !== 'pending';
        step.hidden = !matches || (hide && resolved);
      });
    };

    const save = () => HA.changed(`testplan:${id}`);

    steps.forEach(step => {
      const sid = step.dataset.id;
      stepState.set(sid, { status: 'pending', notes: '' });

      const control = document.createElement('div');
      control.className = 'tp-control';
      control.dataset.ui = '';
      control.setAttribute('role', 'group');
      control.setAttribute('aria-label', 'Step state');
      const buttons = {};
      STATES.forEach(s => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = LABEL[s];
        b.setAttribute('aria-pressed', String(s === 'pending'));
        buttons[s] = b;
        control.append(b);
      });

      const notes = document.createElement('textarea');
      notes.className = 'tp-notes';
      notes.dataset.ui = '';
      notes.placeholder = 'Notes';
      notes.hidden = true;
      notes.setAttribute('aria-label', 'Step notes');

      step.append(control, notes);

      const setStatus = status => {
        stepState.get(sid).status = status;
        step.dataset.status = status;
        STATES.forEach(s => buttons[s].setAttribute('aria-pressed', String(s === status)));
        notes.hidden = status !== 'fail' && status !== 'blocked';
        refresh();
        applyFilter();
        save();
      };
      STATES.forEach(s => buttons[s].addEventListener('click', () => setStatus(s)));
      notes.addEventListener('input', () => { stepState.get(sid).notes = notes.value; save(); });
      setters.set(sid, setStatus);
    });

    search.addEventListener('input', applyFilter);
    hideBox.addEventListener('change', applyFilter);

    HA.register(`testplan:${id}`, {
      state: () => ({
        results: steps.map(step => {
          const s = stepState.get(step.dataset.id);
          return { id: step.dataset.id, flow: step.closest('.tp-flow')?.dataset.title || '', step: fieldText(step, 'Action'), status: s.status, notes: s.notes };
        }),
        summary: summarize(steps.map(s => s.dataset.id)),
      }),
      restore: saved => {
        (saved.results || []).forEach(r => {
          if (!stepState.has(r.id)) return;
          stepState.set(r.id, { status: r.status, notes: r.notes || '' });
          setters.get(r.id)(r.status);
          const notes = steps.find(s => s.dataset.id === r.id).querySelector('.tp-notes');
          notes.value = r.notes || '';
        });
      },
      summary: () => summaryText(summarize(steps.map(s => s.dataset.id))),
    });

    refresh();
    applyFilter();
    instances.push({ root, steps, current: 0, setters });
  });

  // One shared keydown listener routes to the testplan instance the focus is inside, or the first one.
  document.addEventListener('keydown', e => {
    if (!instances.length) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && tag !== 'input' && tag !== 'textarea') {
      const inst = instances.find(i => i.root.contains(e.target)) || instances[0];
      e.preventDefault();
      inst.root.querySelector('.tp-toolbar input[type=search]').focus();
      return;
    }
    if (tag === 'input' || tag === 'textarea') return;
    const inst = instances.find(i => i.root.contains(e.target)) || instances[0];
    const visible = () => inst.steps.filter(s => !s.hidden);
    if (e.key === 'j' || e.key === 'k') {
      const vis = visible();
      if (!vis.length) return;
      vis.forEach(s => s.classList.remove('tp-current'));
      inst.current = Math.max(0, Math.min(inst.current + (e.key === 'j' ? 1 : -1), vis.length - 1));
      vis[inst.current].classList.add('tp-current');
      vis[inst.current].scrollIntoView({ block: 'nearest' });
      return;
    }
    const map = { p: 'pass', f: 'fail', b: 'blocked', s: 'skipped' };
    if (map[e.key]) {
      const vis = visible();
      const step = vis[inst.current];
      if (step) inst.setters.get(step.dataset.id)(map[e.key]);
    }
  });
})();
