// requires: shell
// enhances: .deck
// Slide deck: a scrolling review view by default, and a present mode with keyboard navigation.
// Page contract: <body class="deck"> with <section class="slide" id="…"> inside <main>, each with an
// optional <aside class="notes">. Registered state is { slide, presenting }.
(() => {
  if (!document.body.classList.contains('deck')) return;
  const HA = window.HA;
  const slides = [...document.querySelectorAll('main .slide[id]')];
  if (!slides.length) return;

  let i = 0;
  let presenting = false;

  const mk = (tag, props) => { const e = Object.assign(document.createElement(tag), props); e.dataset.ui = ''; return e; };
  const presentBtn = mk('button', { type: 'button', className: 'deck-present-btn', textContent: 'Present' });
  const exitBtn = mk('button', { type: 'button', className: 'deck-exit', textContent: 'Exit', title: 'Leave presentation' });
  const counter = mk('div', { className: 'deck-counter' });
  const progress = mk('div', { className: 'deck-progress' });
  const progressFill = mk('span', {});
  progress.append(progressFill);
  const notesPanel = mk('div', { className: 'deck-notes-panel', hidden: true });
  document.body.append(presentBtn, exitBtn, counter, progress, notesPanel);

  const clamp = n => Math.max(0, Math.min(slides.length - 1, n));

  const show = () => {
    slides.forEach((s, k) => s.classList.toggle('current', k === i));
    counter.textContent = `${i + 1} / ${slides.length}`;
    progressFill.style.width = `${((i + 1) / slides.length) * 100}%`;
    const notes = slides[i].querySelector('.notes');
    notesPanel.textContent = notes ? notes.textContent.trim() : '';
    notesPanel.hidden = !document.body.classList.contains('deck-notes') || !notes;
    history.replaceState(null, '', `#${slides[i].id}`);
  };

  const goto = n => { i = clamp(n); show(); HA.changed('deck'); };

  const enterPresent = () => { presenting = true; document.body.classList.add('deck-presenting'); show(); };
  const exitPresent = () => { presenting = false; document.body.classList.remove('deck-presenting'); HA.changed('deck'); };

  presentBtn.addEventListener('click', () => { enterPresent(); HA.changed('deck'); });
  exitBtn.addEventListener('click', exitPresent);

  document.addEventListener('keydown', e => {
    if (!presenting) return;
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); goto(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goto(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); goto(0); }
    else if (e.key === 'End') { e.preventDefault(); goto(slides.length - 1); }
    else if (e.key === 'n' || e.key === 'N') { document.body.classList.toggle('deck-notes'); show(); }
    else if (e.key === 'Escape') exitPresent();
  });

  const hashIndex = () => slides.findIndex(s => s.id === location.hash.slice(1));

  HA.register('deck', {
    state: () => ({ slide: i, presenting }),
    restore: s => {
      i = clamp(s.slide ?? 0);
      if (s.presenting) enterPresent(); else show();
    },
    summary: () => `slide ${i + 1} of ${slides.length}`,
  });

  if (!presenting) {
    const h = hashIndex();
    if (h >= 0) i = h;
    show();
  }
})();
