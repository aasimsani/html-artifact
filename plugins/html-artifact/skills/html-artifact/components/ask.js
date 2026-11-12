// requires: shell
// Decision blocks. Each <div class="ask" data-id data-default> registers as ask:<id> with
// { answer, status, note }. Status is "not opened" until the reader touches the block, then
// "default kept" or "chosen".
//
// Any element with data-if="id=value" (or id!=value) shows only while that decision holds that
// answer, which is how a page states what each option changes. A floating button counts the
// decisions nobody has opened yet and jumps to the next one.
(() => {
  const HA = window.HA;
  const asks = [];
  const conditionals = [...document.querySelectorAll('[data-if]')];
  const next = Object.assign(document.createElement('button'), { type: 'button', className: 'ask-next', hidden: true });
  next.dataset.ui = '';
  const sync = () => {
    const answers = Object.fromEntries(asks.map(a => [a.id, a.answer()]));
    for (const el of conditionals) {
      const m = el.dataset.if.match(/^([\w-]+)(!?=)(.*)$/);
      if (m) el.hidden = (answers[m[1]] === m[3]) === (m[2] === '!=');
    }
    const left = asks.filter(a => a.status() === 'not opened').length;
    next.hidden = !left;
    next.textContent = `${left} to answer`;
  };

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
      sync();
    };
    asks.push({ id, box, answer, status: statusOf });
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
  if (!asks.length) return;

  next.addEventListener('click', () => {
    const box = asks.find(a => a.status() === 'not opened')?.box;
    if (!box) return;
    for (let d = box.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    box.scrollIntoView({ block: 'center' });
    // Focus shows the reader where they landed. It doesn't count as an answer.
    box.querySelector('input')?.focus({ preventScroll: true });
  });
  // On a phone the button would cover the first screen's content, so it waits until the reader scrolls.
  const narrow = matchMedia('(max-width: 700px)');
  const tuck = () => next.classList.toggle('ask-tucked', narrow.matches && scrollY < innerHeight * 0.6);
  addEventListener('scroll', tuck, { passive: true });
  narrow.addEventListener('change', tuck);
  tuck();
  document.body.append(next);
})();
