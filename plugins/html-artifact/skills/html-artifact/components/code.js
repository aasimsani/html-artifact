// requires: shell
// Syntax colours for <pre><code class="language-…"> and line classes for <pre class="diff">.
// It builds DOM nodes rather than HTML strings, so code text can never inject markup.
(() => {
  const KEYWORDS = 'async await def class return raise if elif else for while try except finally with from import in not and or None True False lambda yield pass break continue as is self cls global nonlocal del assert const let var function new this typeof instanceof export default interface type enum public private SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT INSERT UPDATE DELETE SET VALUES INTO AS IS NULL COUNT AND OR NOT';
  const BUILTINS = 'str int bool list dict set tuple float bytes len range isinstance sum type hasattr getattr setattr repr print object Exception ValueError TypeError RuntimeError KeyError Optional Literal Any Callable Decimal datetime timedelta date console JSON Promise Array Object Map';
  const words = s => s.split(' ').join('|');
  // Group order is token precedence: comment, string, decorator, keyword, builtin, number, CamelCase type.
  const MASTER = new RegExp(
    '(#[^\\n]*|--\\s[^\\n]*|//[^\\n]*)'
    + '|([fFrRbB]{0,2}"(?:[^"\\\\\\n]|\\\\.)*"|[fFrRbB]{0,2}\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)'
    + '|(@[A-Za-z_][\\w.]*)'
    + `|\\b(${words(KEYWORDS)})\\b`
    + `|\\b(${words(BUILTINS)})\\b`
    + '|(\\b\\d+(?:\\.\\d+)?\\b)'
    + '|(\\b[A-Z][a-z0-9_]+[A-Z]?[A-Za-z0-9_]*\\b)', 'g');
  const CLASS = [null, 'c', 's', 'd', 'k', 'b', 'n', 't'];

  const highlight = el => {
    const text = el.textContent;
    const out = document.createDocumentFragment();
    let last = 0;
    MASTER.lastIndex = 0;
    for (let m; (m = MASTER.exec(text));) {
      if (m.index > last) out.append(text.slice(last, m.index));
      const span = document.createElement('span');
      span.className = `hl-${CLASS[m.findIndex((v, i) => i > 0 && v !== undefined)]}`;
      span.textContent = m[0];
      out.append(span);
      last = m.index + m[0].length;
    }
    out.append(text.slice(last));
    el.replaceChildren(out);
  };

  document.querySelectorAll('pre:not(.diff) > code[class*="language-"]:not(.language-text):not(.language-json):not(.language-yaml)').forEach(highlight);
  document.querySelectorAll('pre.diff > code').forEach(code => {
    code.replaceChildren(...code.textContent.replace(/\n$/, '').split('\n').map(line => {
      const span = document.createElement('span');
      span.className = `ln ${line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx'}`;
      span.textContent = line || ' ';
      return span;
    }));
  });

  // ---- Code review: annotated diffs, a files index with viewed ticks, and a split view ----
  const HA = (window.HA = window.HA || {});
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text !== undefined ? { textContent: text } : {});
  const ui = node => { node.dataset.ui = ''; return node; };
  const boxes = [...document.querySelectorAll('.annotated')];

  boxes.forEach((box, n) => {
    box.id = box.id || `file-${n + 1}`;
    // A diff line ending in ⟦F1⟧ gets a badge that links to note F1.
    box.querySelectorAll('pre.diff .ln').forEach(line => {
      const m = line.textContent.match(/\s*⟦([\w-]+)⟧\s*$/);
      if (!m) return;
      line.textContent = line.textContent.slice(0, m.index);
      line.dataset.note = m[1];
      line.append(ui(Object.assign(el('a', 'mark', m[1]), { href: `#${m[1]}` })));
    });
    box.querySelectorAll('ol.notes > li[id]').forEach(li => li.prepend(ui(el('span', 'mark', li.id))));
    box.addEventListener('click', e => {
      const a = e.target.closest('a.mark');
      if (!a) return;
      e.preventDefault();
      document.querySelectorAll('.notes li.active').forEach(x => x.classList.remove('active'));
      const note = document.getElementById(a.getAttribute('href').slice(1));
      note?.classList.add('active');
      note?.scrollIntoView({ block: 'nearest' });
    });

    // Split view, built on first use from the unified lines.
    const pre = box.querySelector('pre.diff');
    if (!pre) return;
    const tools = ui(el('div', 'anno-tools'));
    const toggle = el('button', 'split-toggle', 'Split view');
    toggle.type = 'button';
    tools.append(toggle);
    pre.before(tools);
    let split = null;
    toggle.addEventListener('click', () => {
      if (!split) {
        const old = el('div', 'side old'), neu = el('div', 'side new');
        const lines = [...pre.querySelectorAll('.ln')];
        const copy = (line, side) => { const c = line.cloneNode(true); side.append(c); };
        const blank = side => side.append(el('span', 'ln pad', ' '));
        for (let i = 0; i < lines.length;) {
          const kind = lines[i].classList[1];
          if (kind === 'del' || kind === 'add') {
            const dels = [], adds = [];
            while (i < lines.length && lines[i].classList.contains('del')) dels.push(lines[i++]);
            while (i < lines.length && lines[i].classList.contains('add')) adds.push(lines[i++]);
            for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
              dels[k] ? copy(dels[k], old) : blank(old);
              adds[k] ? copy(adds[k], neu) : blank(neu);
            }
          } else { copy(lines[i], old); copy(lines[i], neu); i++; }
        }
        split = el('div', 'split');
        split.append(old, neu);
        pre.after(split);
        split.hidden = true;
      }
      const toSplit = split.hidden;
      split.hidden = !toSplit;
      pre.hidden = toSplit;
      toggle.textContent = toSplit ? 'Unified view' : 'Split view';
    });
  });

  if (boxes.length) {
    const key = `html-artifact:${location.pathname}:viewed`;
    const viewed = HA.store ? HA.store.get(key, {}) : {};
    const nav = ui(el('nav', 'files'));
    nav.setAttribute('aria-label', 'Files in this review');
    const count = el('span', 'count');
    const head = el('p', 'files-head');
    head.append(el('b', '', 'Files '), count);
    const list = el('ul');
    const show = () => {
      boxes.forEach(b => b.classList.toggle('viewed', !!viewed[b.dataset.file]));
      count.textContent = `${boxes.filter(b => viewed[b.dataset.file]).length} / ${boxes.length} viewed`;
    };
    boxes.forEach(b => {
      const li = el('li');
      const box = Object.assign(el('input'), { type: 'checkbox', checked: !!viewed[b.dataset.file] });
      box.setAttribute('aria-label', `Viewed ${b.dataset.file}`);
      box.addEventListener('change', () => { viewed[b.dataset.file] = box.checked; HA.store?.set(key, viewed); show(); });
      li.append(box, Object.assign(el('a', '', b.dataset.file), { href: `#${b.id}` }));
      list.append(li);
    });
    nav.append(head, list);
    boxes[0].before(nav);
    show();
  }

  HA.highlight = highlight;
})();
