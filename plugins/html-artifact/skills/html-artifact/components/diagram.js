// requires: shell
// SVG diagram kit: arrowheads on every edge, click-to-expand node details, and a Copy SVG button
// that inlines computed colours so the figure renders the same when pasted elsewhere.
(() => {
  const HA = window.HA;
  const SVG = 'http://www.w3.org/2000/svg';
  const PAINT = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'opacity'];

  // Clone an SVG with its computed paint inlined as attributes, and with no classes left to depend on.
  const serialize = svg => {
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((el, i) => {
      const cs = getComputedStyle(el);
      for (const p of PAINT) {
        const v = cs.getPropertyValue(p);
        if (v && v !== 'none' && v !== 'normal' && v !== 'auto' || (p === 'fill' && v === 'none')) dst[i].setAttribute(p, v);
      }
      dst[i].removeAttribute('class');
      dst[i].removeAttribute('tabindex');
      dst[i].removeAttribute('role');
    });
    clone.setAttribute('xmlns', SVG);
    return clone.outerHTML;
  };

  document.querySelectorAll('figure.diagram').forEach((fig, n) => {
    const svg = fig.querySelector('svg');
    if (!svg) return;

    // One arrowhead marker per diagram; edges without their own marker get it.
    const id = `ha-arrow-${n}`;
    const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS(SVG, 'defs'), svg.firstChild);
    const marker = document.createElementNS(SVG, 'marker');
    Object.entries({ id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })
      .forEach(([k, v]) => marker.setAttribute(k, v));
    const head = document.createElementNS(SVG, 'path');
    head.setAttribute('d', 'M0,0 L10,5 L0,10 z');
    head.setAttribute('class', 'arrowhead');
    marker.append(head);
    defs.append(marker);
    svg.querySelectorAll('.edge').forEach(e => { if (!e.getAttribute('marker-end')) e.setAttribute('marker-end', `url(#${id})`); });

    // Nodes with data-detail open a panel under the figure.
    const panel = document.createElement('div');
    panel.className = 'detail';
    panel.dataset.ui = '';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');
    const open = node => {
      const was = node.classList.contains('open');
      svg.querySelectorAll('.node.open').forEach(x => x.classList.remove('open'));
      if (was) { panel.hidden = true; return; }
      node.classList.add('open');
      const title = document.createElement('b');
      title.textContent = node.querySelector('text')?.textContent.trim() || '';
      panel.replaceChildren(title, node.dataset.detail);
      panel.hidden = false;
    };
    svg.querySelectorAll('.node[data-detail]').forEach(node => {
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.addEventListener('click', () => open(node));
      node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(node); } });
    });

    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.dataset.ui = '';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-svg';
    copy.textContent = 'Copy SVG';
    copy.addEventListener('click', async () => {
      const text = serialize(svg);
      try { await navigator.clipboard.writeText(text); } catch {
        const t = Object.assign(document.createElement('textarea'), { value: text });
        document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
      }
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy SVG'; }, 1200);
    });
    tools.append(copy);
    (fig.querySelector('figcaption') || svg).after(panel, tools);
  });

  HA.diagram = { serialize };
})();
