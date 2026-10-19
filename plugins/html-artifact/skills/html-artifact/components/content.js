// requires: shell
// Checklists (ol.ranked, ul.checklist): a progress line above each list, ticks saved per page.
(() => {
  const HA = window.HA;
  document.querySelectorAll('ol.ranked, ul.checklist').forEach((list, n) => {
    const boxes = [...list.querySelectorAll('input[type=checkbox]')];
    const key = `html-artifact:${location.pathname}:checklist:${n}`;
    const saved = HA.store.get(key, []);
    boxes.forEach((b, i) => { b.checked = !!saved[i]; });
    const progress = document.createElement('p');
    progress.className = 'progress';
    progress.dataset.ui = '';
    progress.setAttribute('aria-live', 'polite');
    list.before(progress);
    const show = () => { progress.textContent = `${boxes.filter(b => b.checked).length} / ${boxes.length} done`; };
    list.addEventListener('change', () => { HA.store.set(key, boxes.map(b => b.checked)); show(); });
    show();
  });
})();
