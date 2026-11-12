// requires: shell
// Mockups. <figure class="mock" data-frame="none|browser|phone|terminal" data-w="440"> holds a
// <template> with real HTML. The template renders inside a shadow root, so page styles can't reach
// the mock and the mock's styles can't leak out. It is laid out at data-w and shrinks to fit the
// column. Each <ol class="pins"><li data-ref="name"> puts a numbered badge beside the element that
// carries the same data-ref.
(() => {
  // The mock looks like a screenshot, so it keeps a light surface in both themes. `all: initial`
  // stops inherited page styles at the host. Custom properties still pass, which lets the badges
  // match the pin list under the mock.
  const BASE = `:host { all: initial; display: block; }
.root { position: relative; overflow: hidden; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1f2328; background: #fff; }
.root.term { padding: 12px 14px; white-space: pre; font: 13px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace; color: #e6e6e6; background: #16161a; }
.term .dim { color: #8b8b93; } .term .g { color: #7bd88f; } .term .r { color: #f19999; } .term .y { color: #e3c65a; } .term .b { color: #93b4f8; }
.pin { position: absolute; width: 20px; height: 20px; border-radius: 50%; font: 700 12px/20px system-ui, sans-serif; text-align: center; color: var(--bg, #fff); background: var(--accent, #4338ca); box-shadow: 0 0 0 2px #fff; }`;
  const el = (tag, cls) => Object.assign(document.createElement(tag), { className: cls });

  document.querySelectorAll('figure.mock').forEach(fig => {
    const tpl = fig.querySelector(':scope > template');
    if (!tpl) return;
    const frame = fig.dataset.frame || 'none';
    const stage = el('div', 'mock-stage');
    stage.dataset.ui = '';
    stage.dataset.frame = frame;
    if (frame === 'browser' || frame === 'terminal') {
      const bar = el('div', 'mock-bar');
      bar.textContent = fig.dataset.url || fig.dataset.title || '';
      stage.append(bar);
    }
    const host = el('div', 'mock-host');
    const root = host.attachShadow({ mode: 'open' });
    const body = el('div', frame === 'terminal' ? 'root term' : 'root');
    body.append(tpl.content.cloneNode(true));
    root.append(Object.assign(document.createElement('style'), { textContent: BASE }), body);
    host.style.width = `${+fig.dataset.w || (frame === 'phone' ? 375 : 440)}px`;
    stage.append(host);
    tpl.after(stage);

    const badges = [...fig.querySelectorAll(':scope > ol.pins > li[data-ref]')].map((li, i) => {
      const target = body.querySelector(`[data-ref="${CSS.escape(li.dataset.ref)}"]`);
      if (!target) return null;
      const badge = el('span', 'pin');
      badge.textContent = i + 1;
      body.append(badge);
      return [badge, target];
    }).filter(Boolean);

    // The first time the figure has a size, measure the mock unscaled and place the badges. A mock
    // inside closed <details> has no size yet, so this waits until it opens. After that, only the scale changes.
    let natural = 0, last = 0;
    const fit = () => {
      const room = fig.clientWidth;
      if (!room || room === last) return;
      last = room;
      if (!natural) {
        natural = stage.offsetWidth;
        const o = body.getBoundingClientRect();
        for (const [badge, target] of badges) {
          const r = target.getBoundingClientRect();
          // The badge sits just past the target's right edge, so it never covers what it points at.
          // A tall target takes it at the top corner, and a line of text takes it level with the line.
          badge.style.left = `${Math.max(0, Math.min(r.right - o.left + 2, o.width - 20))}px`;
          badge.style.top = `${Math.max(0, (r.height >= 28 ? r.top : r.top + r.height / 2) - o.top - 10)}px`;
        }
      }
      stage.style.zoom = Math.min(1, room / natural);
    };
    new ResizeObserver(fit).observe(fig);
  });
})();
