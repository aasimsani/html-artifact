// requires: shell
// Decision blocks. Each <div class="ask" data-id data-default> registers as ask:<id> with
// { answer, status, note }. Status is "not opened" until the reader touches the block, then
// "default kept" or "chosen".
(() => {
  const HA = window.HA;
  document.querySelectorAll('.ask').forEach((box, n) => {
    const id = box.dataset.id || `ask-${n + 1}`;
    const def = box.dataset.default || '';
    const radios = [...box.querySelectorAll('input[type=radio]')];
    const labelOf = v => radios.find(r => r.value === v)?.closest('label')?.textContent.replace(/recommended$/i, '').trim() || v;
    let touched = false;

    const def0 = radios.find(r => r.value === def);
    if (def0) {
      def0.checked = true;
      const rec = Object.assign(document.createElement('span'), { className: 'rec', textContent: 'recommended' });
      rec.dataset.ui = '';
      def0.closest('label').append(rec);
    }
    const note = Object.assign(document.createElement('textarea'), { rows: 2, placeholder: 'Why? (optional)' });
    note.dataset.ui = '';
    note.setAttribute('aria-label', 'Note on this decision');
    const status = Object.assign(document.createElement('p'), { className: 'ask-status' });
    status.dataset.ui = '';
    status.setAttribute('aria-live', 'polite');
    box.append(note, status);

    const answer = () => radios.find(r => r.checked)?.value ?? null;
    const statusOf = () => (!touched ? 'not opened' : answer() === def ? 'default kept' : 'chosen');
    const show = () => {
      const s = statusOf();
      box.dataset.status = s;
      status.textContent = s === 'not opened' ? `Not answered yet. The recommendation is ${labelOf(def)}.`
        : s === 'default kept' ? 'You kept the recommendation.' : `You chose ${labelOf(answer())}.`;
    };
    HA.register(`ask:${id}`, {
      el: box,
      state: () => ({ answer: answer(), status: statusOf(), note: note.value }),
      restore: s => {
        radios.forEach(r => { r.checked = r.value === s.answer; });
        note.value = s.note || '';
        touched = s.status !== 'not opened';
        show();
      },
      summary: () => { const s = statusOf(); return s === 'chosen' ? `chosen: ${labelOf(answer())}` : `${s}: ${labelOf(answer())}`; },
    });
    const changed = () => { touched = true; show(); HA.changed(`ask:${id}`); };
    box.addEventListener('change', changed);
    // Clicking the already-selected default fires no change event, but it still confirms the default.
    box.addEventListener('click', e => { if (e.target.matches('input[type=radio]')) changed(); });
    note.addEventListener('input', changed);
    show();
  });
})();
