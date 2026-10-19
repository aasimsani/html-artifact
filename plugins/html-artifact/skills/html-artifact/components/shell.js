// Page shell behaviour: guarded storage, theme toggle, table of contents, scroll-spy.
// Other components reach shared helpers through window.HA.
(() => {
  const HA = (window.HA = window.HA || {});
  HA.store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked; state lives for this visit only */ }
    },
  };

  // Interactive blocks register here. Their state is saved whenever they report a change, restored
  // on the next load (including after the agent rebuilds the page), and included in review exports.
  const blocks = new Map();
  const blockKey = name => `html-artifact:${location.pathname}:block:${name}`;
  HA.register = (name, block) => {
    blocks.set(name, block);
    const saved = HA.store.get(blockKey(name));
    if (saved !== null && block.restore) block.restore(saved);
  };
  HA.changed = name => { const b = blocks.get(name); if (b) HA.store.set(blockKey(name), b.state()); };
  HA.blocks = () => Object.fromEntries([...blocks].map(([name, b]) => [name, { state: b.state(), summary: b.summary ? b.summary() : null }]));

  const root = document.documentElement;
  const THEME = 'html-artifact:theme';
  const saved = HA.store.get(THEME);
  if (saved) root.dataset.theme = saved;
  const toggle = document.querySelector('[data-theme-toggle]') || document.body.appendChild(Object.assign(
    document.createElement('button'), { type: 'button', textContent: 'Theme' }));
  toggle.setAttribute('data-theme-toggle', '');
  toggle.setAttribute('aria-label', 'Switch light or dark theme');
  toggle.addEventListener('click', () => {
    const dark = (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    root.dataset.theme = dark ? 'light' : 'dark';
    HA.store.set(THEME, root.dataset.theme);
  });

  const toc = document.querySelector('nav.toc');
  const sections = [...document.querySelectorAll('main > section[id]')];
  if (toc && !toc.querySelector('a')) {
    for (const s of sections) {
      const a = document.createElement('a');
      a.href = `#${s.id}`;
      // The eyebrow ("01 · Summary") is the short label, so the TOC uses it without its number.
      const eyebrow = s.querySelector('.eyebrow')?.textContent.replace(/^\s*[\d.]+\s*[·.:-]\s*/, '').trim();
      a.textContent = eyebrow || (s.querySelector('h2') || s).textContent.trim();
      toc.appendChild(a);
    }
  }
  if (toc && 'IntersectionObserver' in window) {
    const links = new Map([...toc.querySelectorAll('a[href^="#"]')].map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting || !links.has(e.target.id)) continue;
        links.forEach(a => a.removeAttribute('aria-current'));
        links.get(e.target.id).setAttribute('aria-current', 'true');
      }
    }, { rootMargin: '-30% 0px -60% 0px' });
    sections.forEach(s => io.observe(s));
  }
})();
