// requires: shell
// Review kit: reviewed checkboxes, section comments, text highlights, a review tray and exports.
//
// Page contract: top-level <section id> elements inside <main>. Optional metas:
//   <meta name="review-label" content="Findings">                 tray and drawer title
//   <meta name="review-severities" content="Gap, Risk, Question">  severity picker, in order
//   <meta name="artifact-id" content="rfc-auth-v2">               storage key (defaults to the file path)
//
// A highlight is stored as its text plus up to 32 characters on each side, all whitespace-collapsed.
// After the page is edited, the highlight re-finds its text by that context. When the text is
// gone, the comment stays as an "outdated" card instead of disappearing.
(() => {
  // Highlighting and other components rewrite the DOM as their scripts run, so marks go on afterwards.
  const init = () => {
  performance.mark('ha:review-start');
  const HA = window.HA;
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.content;
  const KEY = `html-artifact:${meta('artifact-id') || location.pathname}:review.v2`;
  const LABEL = meta('review-label') || 'Comments';
  const TONES = ['crit', 'low', 'q', 'good', 'nit', 'high', 'med'];
  const SEVS = (meta('review-severities') || 'Concern, Suggest, Question, Praise, Nit')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map((label, i) => ({ id: label.toLowerCase().replace(/\W+/g, '-'), label, tone: TONES[i % TONES.length] }));
  const sevOf = id => SEVS.find(s => s.id === id) || SEVS[0];
  // Quick labels are one-click comment presets. Each carries a tip that only the agent sees in exports.
  const QLABELS = (meta('review-labels') || 'needs a test: write a failing test before changing code | out of scope: remove this from the document | unclear: rewrite this so a newcomer understands it | needs evidence: back this claim with a source or mark it as a guess')
    .split('|').map(x => x.trim()).filter(Boolean)
    .map(x => { const i = x.indexOf(':'); return i < 0 ? { label: x, tip: '' } : { label: x.slice(0, i).trim(), tip: x.slice(i + 1).trim() }; });
  const KINDS = [['comment', 'Comment'], ['delete', 'Delete'], ['replace', 'Replace']];
  const GENERAL = '__general';
  const CONTEXT = 32;

  const state = HA.store.get(KEY, { reviewed: {}, comments: [] });
  const save = () => HA.store.set(KEY, state);
  const main = document.querySelector('main') || document.body;
  const sections = [...main.querySelectorAll(':scope > section[id]')];
  const toc = id => document.querySelector(`nav.toc a[href="#${CSS.escape(id)}"]`);
  const labelOf = sec => sec.querySelector('.eyebrow')?.textContent.replace(/^\s*[\d.]+\s*[·.:-]\s*/, '').trim()
    || sec.querySelector('h2')?.textContent.trim() || sec.id;

  const h = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k in e && k !== 'dataset' ? (e[k] = v) : e.setAttribute(k, v);
    e.append(...kids.filter(k => k !== null && k !== undefined));
    return e;
  };

  // ---- Text model. Content text excludes review UI, so the quote offsets stay stable. ----
  const textNodes = root => {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT,
      { acceptNode: n => (n.parentElement.closest('.rv-ui, [data-ui]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n; (n = w.nextNode());) out.push(n);
    return out;
  };
  // Collapse whitespace runs to one space, and keep a map from each collapsed index to the raw index.
  const collapse = raw => {
    let norm = '';
    const map = [];
    for (let i = 0; i < raw.length; i++) {
      const ws = /\s/.test(raw[i]);
      if (ws && norm.endsWith(' ')) continue;
      norm += ws ? ' ' : raw[i];
      map.push(i);
    }
    map.push(raw.length);
    return { norm, map };
  };
  const model = sec => {
    const nodes = textNodes(sec);
    const raw = nodes.map(n => n.textContent).join('');
    return { nodes, raw, ...collapse(raw) };
  };
  // Character offset of a boundary point within the content text.
  const offsetOf = (nodes, container, offset) => {
    const point = document.createRange();
    point.setStart(container, offset);
    let acc = 0;
    for (const n of nodes) {
      if (n === container) return acc + offset;
      if (point.comparePoint(n, 0) === 1) return acc;
      acc += n.length;
    }
    return acc;
  };
  const common = (a, b, fromEnd) => {
    let k = 0;
    while (k < a.length && k < b.length && (fromEnd ? a[a.length - 1 - k] === b[b.length - 1 - k] : a[k] === b[k])) k++;
    return k;
  };
  const locate = (norm, a) => {
    const exact = norm.indexOf(a.prefix + a.text + a.suffix);
    if (exact >= 0) return exact + a.prefix.length;
    let best = -1, bestScore = -1;
    for (let i = norm.indexOf(a.text); i >= 0; i = norm.indexOf(a.text, i + 1)) {
      const score = common(norm.slice(0, i), a.prefix, true) + common(norm.slice(i + a.text.length), a.suffix, false);
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    return best;
  };
  const wrap = (nodes, start, end, make) => {
    let acc = 0;
    for (const n of nodes) {
      const ns = acc;
      acc += n.length;
      if (acc <= start || ns >= end) continue;
      const a = Math.max(start, ns) - ns, b = Math.min(end, acc) - ns;
      if (!n.textContent.slice(a, b).trim()) continue;
      let node = n;
      if (a > 0) node = node.splitText(a);
      if (b - a < node.length) node.splitText(b - a);
      const m = make();
      node.replaceWith(m);
      m.appendChild(node);
    }
  };

  // ---- Rendering ----
  // Code reviews get a blocking flag; comments on code get an optional suggested replacement.
  const isCodeReview = !!document.querySelector('.annotated, pre.diff');
  const label = c => (c.kind === 'delete' ? 'Delete' : c.kind === 'replace' ? 'Replace' : sevOf(c.sev).label + (c.blocking ? ' · blocking' : ''));
  const editor = ({ sev = SEVS[0].id, body = '', blocking = false, suggestion = '', code = false, anchored = false,
    kind = 'comment', replacement = '', qlabel = null, onSave, onCancel, onDelete }) => {
    let chosen = sev;
    const pills = h('div', { className: 'rv-sevs', role: 'radiogroup', 'aria-label': 'Severity' },
      ...SEVS.map(s => h('button', { type: 'button', className: 'rv-pill', 'data-sev': s.id, 'data-tone': s.tone,
        'aria-pressed': String(s.id === sev), textContent: s.label })));
    pills.addEventListener('click', e => {
      const b = e.target.closest('[data-sev]');
      if (!b) return;
      chosen = b.dataset.sev;
      pills.querySelectorAll('[data-sev]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
    const text = h('textarea', { rows: 3, placeholder: 'Comment (Markdown is fine)', 'aria-label': 'Comment' });
    text.value = body;
    // Highlights can ask for a deletion or a replacement instead of a discussion.
    let chosenKind = kind;
    const repl = h('textarea', { rows: 2, className: 'rv-replacement', placeholder: 'Replace with…', 'aria-label': 'Replacement text', hidden: kind !== 'replace' });
    repl.value = replacement;
    const kinds = anchored ? h('div', { className: 'rv-kinds', role: 'group', 'aria-label': 'Annotation type' },
      ...KINDS.map(([k, l]) => h('button', { type: 'button', className: 'rv-kind', 'data-kind': k, 'aria-pressed': String(k === kind), textContent: l }))) : null;
    kinds?.addEventListener('click', e => {
      const b = e.target.closest('[data-kind]');
      if (!b) return;
      chosenKind = b.dataset.kind;
      kinds.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      repl.hidden = chosenKind !== 'replace';
    });
    let chosenLabel = qlabel;
    const qrow = QLABELS.length ? h('div', { className: 'rv-qlabels', role: 'group', 'aria-label': 'Quick labels' },
      ...QLABELS.map(q => h('button', { type: 'button', className: 'rv-qlabel', 'aria-pressed': String(q.label === qlabel?.label), textContent: q.label }))) : null;
    qrow?.addEventListener('click', e => {
      const b = e.target.closest('.rv-qlabel');
      if (!b) return;
      const q = QLABELS.find(x => x.label === b.textContent);
      chosenLabel = chosenLabel?.label === q.label ? null : q;
      qrow.querySelectorAll('.rv-qlabel').forEach(x => x.setAttribute('aria-pressed', String(x.textContent === chosenLabel?.label)));
    });
    const block = isCodeReview ? h('input', { type: 'checkbox', className: 'rv-blocking', checked: blocking }) : null;
    const sug = code ? h('textarea', { rows: 2, className: 'rv-suggestion', placeholder: 'Suggested code (optional)', 'aria-label': 'Suggested code' }) : null;
    if (sug) sug.value = suggestion;
    const fields = () => ({ sev: chosen, body: text.value.trim(),
      ...(block ? { blocking: block.checked } : {}), ...(sug ? { suggestion: sug.value.replace(/\s+$/, '') } : {}),
      ...(anchored ? { kind: chosenKind } : {}), ...(chosenKind === 'replace' ? { replacement: repl.value.trim() } : {}),
      label: chosenLabel?.label || null, tip: chosenLabel?.tip || null });
    const form = h('div', { className: 'rv-editor' }, kinds, pills, qrow, text, repl, sug,
      block ? h('label', { className: 'rv-inline' }, block, ' blocking') : null, h('div', { className: 'rv-actions' },
      h('button', { type: 'button', className: 'rv-btn rv-primary', 'data-action': 'save', textContent: 'Save' }),
      h('button', { type: 'button', className: 'rv-btn', 'data-action': 'cancel', textContent: 'Cancel' }),
      onDelete ? h('button', { type: 'button', className: 'rv-btn rv-danger', 'data-action': 'delete', textContent: 'Delete' }) : null));
    form.addEventListener('click', e => {
      const act = e.target.closest('[data-action]')?.dataset.action;
      if (act === 'save') onSave(fields());
      if (act === 'cancel') onCancel();
      if (act === 'delete') onDelete();
    });
    form.addEventListener('keydown', e => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(fields());
    });
    setTimeout(() => text.focus(), 0);
    return form;
  };

  const card = c => {
    const s = sevOf(c.sev);
    const el = h('div', { className: `rv-card${c.outdated ? ' rv-outdated' : ''}${c.addressed ? ' rv-addressed' : ''}`, 'data-tone': s.tone, 'data-id': c.id },
      h('div', { className: 'rv-card-head' },
        h('span', { className: 'rv-badge', 'data-tone': s.tone, textContent: label(c) }),
        c.outdated ? h('span', { className: 'rv-badge rv-flag', textContent: 'outdated', title: 'The highlighted text is no longer on the page' }) : null,
        h('span', { className: 'rv-spacer' }),
        c.anchor && !c.outdated ? h('button', { type: 'button', className: 'rv-link', 'data-action': 'jump', textContent: 'Jump' }) : null,
        h('button', { type: 'button', className: 'rv-link', 'data-action': 'edit', textContent: 'Edit' }),
        h('label', { className: 'rv-link' }, h('input', { type: 'checkbox', 'data-action': 'addressed', checked: !!c.addressed }), ' Done')),
      c.anchor ? h('blockquote', { className: 'rv-quote', textContent: c.anchor.text }) : null,
      c.body ? h('div', { className: 'rv-body', textContent: c.body }) : null,
      c.suggestion ? h('pre', { className: 'rv-suggested' }, h('code', { textContent: c.suggestion })) : null,
      c.kind === 'replace' ? h('div', { className: 'rv-body' }, h('b', { textContent: 'Replace with: ' }), c.replacement || '') : null,
      c.label ? h('span', { className: 'rv-badge rv-flag', textContent: c.label }) : null);
    return el;
  };

  const render = () => {
    for (const sec of sections) {
      sec.querySelectorAll('mark.rv-mark').forEach(m => m.replaceWith(...m.childNodes));
      sec.normalize();
      const mine = state.comments.filter(c => c.sectionId === sec.id);
      for (const c of mine.filter(c => c.anchor)) {
        const m = model(sec);
        const at = locate(m.norm, c.anchor);
        c.outdated = at < 0;
        if (at < 0) continue;
        wrap(m.nodes, m.map[at], m.map[at + c.anchor.text.length - 1] + 1, () =>
          h('mark', { className: 'rv-mark', 'data-tone': sevOf(c.sev).tone, 'data-kind': c.kind || 'comment', 'data-id': c.id, tabIndex: 0 }));
      }
      const cards = sec.querySelector(':scope > .rv-cards');
      cards.replaceChildren(...mine.map(card));
      const done = !!state.reviewed[sec.id];
      sec.classList.toggle('rv-done', done);
      sec.querySelector(':scope > .rv-check input').checked = done;
      toc(sec.id)?.classList.toggle('rv-done', done);
    }
    const open = state.comments.filter(c => !c.addressed).length;
    tray.replaceChildren(`${LABEL} `, h('b', { textContent: String(open) }));
    if (drawer.classList.contains('rv-open')) { output.value = exportAs(format.value); if (!list.querySelector('.rv-editor')) renderList(); }
  };
  const commit = () => { save(); render(); };

  // ---- Section chrome ----
  for (const sec of sections) {
    const check = h('label', { className: 'rv-ui rv-check' }, h('input', { type: 'checkbox' }), ' Reviewed');
    check.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) state.reviewed[sec.id] = true; else delete state.reviewed[sec.id];
      commit();
    });
    const cards = h('div', { className: 'rv-ui rv-cards' });
    const add = h('button', { type: 'button', className: 'rv-ui rv-add', textContent: '+ Comment' });
    add.addEventListener('click', () => {
      const close = () => form.remove();
      const form = h('div', { className: 'rv-ui rv-form' }, editor({
        onCancel: close,
        onSave: f => {
          if (!f.body) return;
          state.comments.push({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sectionId: sec.id, ...f, ts: Date.now() });
          close();
          commit();
        },
      }));
      add.before(form);
    });
    sec.prepend(check);
    sec.append(cards, add);
    cards.addEventListener('click', e => {
      const act = e.target.closest('[data-action]')?.dataset.action;
      const id = e.target.closest('.rv-card')?.dataset.id;
      const c = state.comments.find(x => x.id === id);
      if (!c) return;
      if (act === 'jump') {
        const m = sec.querySelector(`mark.rv-mark[data-id="${id}"]`);
        m?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        m?.classList.add('rv-flash');
        setTimeout(() => m?.classList.remove('rv-flash'), 900);
      }
      if (act === 'edit') openPopover({ comment: c, x: e.clientX, y: e.clientY });
      if (act === 'addressed') { c.addressed = e.target.checked; commit(); }
    });
  }

  // ---- Selection helper and popover ----
  const helper = h('button', { type: 'button', className: 'rv-ui rv-helper', textContent: '+ Comment', hidden: true });
  const popover = h('div', { className: 'rv-ui rv-popover', role: 'dialog', 'aria-label': 'Comment on selection', hidden: true });
  let pending = null;

  const place = (el, x, y) => {
    el.hidden = false;
    const w = el.offsetWidth, ht = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
    el.style.top = `${y + ht + 8 > innerHeight ? Math.max(8, y - ht - 28) : y}px`;
  };
  const closePopover = () => { popover.hidden = true; popover.replaceChildren(); pending = null; };

  function openPopover({ comment, anchor, sectionId, x, y }) {
    helper.hidden = true;
    const quote = comment?.anchor?.text || anchor?.text;
    const ed = editor({
      sev: comment?.sev, body: comment?.body, blocking: comment?.blocking, suggestion: comment?.suggestion,
      code: !!(comment?.anchor || anchor)?.code, anchored: !!(comment?.anchor || anchor),
      kind: comment?.kind, replacement: comment?.replacement, qlabel: comment?.label ? { label: comment.label, tip: comment.tip } : null,
      onCancel: closePopover,
      onDelete: comment ? () => { state.comments = state.comments.filter(c => c !== comment); closePopover(); commit(); } : null,
      onSave: f => {
        if (comment) Object.assign(comment, f);
        else state.comments.push({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sectionId, ...f, anchor, ts: Date.now() });
        closePopover();
        getSelection().removeAllRanges();
        commit();
      },
    });
    popover.replaceChildren(quote ? h('blockquote', { className: 'rv-quote', textContent: quote }) : '', ed);
    place(popover, x, y);
  }

  const onSelect = () => setTimeout(() => {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !sel.toString().trim()) { helper.hidden = true; return; }
    const r = sel.getRangeAt(0);
    const node = r.commonAncestorContainer;
    const host = (node.nodeType === 1 ? node : node.parentElement);
    const sec = host.closest('main > section[id]');
    if (!sec || host.closest('.rv-ui, [data-ui]')) { helper.hidden = true; return; }
    const m = model(sec);
    const start = offsetOf(m.nodes, r.startContainer, r.startOffset);
    const end = offsetOf(m.nodes, r.endContainer, r.endOffset);
    const c = collapse(m.raw.slice(0, start)).norm.length;
    const text = collapse(m.raw.slice(start, end)).norm.trim();
    if (!text) { helper.hidden = true; return; }
    const found = m.norm.indexOf(text, Math.max(0, c - 1));
    const lead = found < 0 ? c : found;
    pending = { sectionId: sec.id, anchor: {
      text, prefix: m.norm.slice(Math.max(0, lead - CONTEXT), lead), suffix: m.norm.slice(lead + text.length, lead + text.length + CONTEXT),
      ...(host.closest('pre') ? { code: true } : {}),
    } };
    const rects = r.getClientRects();
    const last = rects[rects.length - 1] || r.getBoundingClientRect();
    place(helper, last.right - 20, last.bottom + 6);
  }, 0);
  document.addEventListener('mouseup', e => { if (!e.target.closest?.('.rv-helper, .rv-popover')) onSelect(); });
  document.addEventListener('keyup', e => { if (e.shiftKey) onSelect(); });
  helper.addEventListener('click', () => {
    if (!pending) return;
    const { left, top } = helper.getBoundingClientRect();
    openPopover({ ...pending, x: left, y: top });
  });
  main.addEventListener('click', e => {
    const m = e.target.closest('mark.rv-mark');
    const c = m && state.comments.find(x => x.id === m.dataset.id);
    if (c && getSelection().isCollapsed) openPopover({ comment: c, x: e.clientX, y: e.clientY + 12 });
  });
  main.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('mark.rv-mark')) e.target.click();
  });
  document.addEventListener('mousedown', e => {
    if (!popover.hidden && !e.target.closest('.rv-popover, mark.rv-mark, .rv-card')) closePopover();
  });

  // ---- Exports ----
  const exportAs = fmt => {
    const title = document.querySelector('h1')?.textContent.trim() || document.title;
    const general = { id: GENERAL, isGeneral: true };
    const bySection = [general, ...sections].map(sec => [sec, state.comments.filter(c => c.sectionId === sec.id)]).filter(([, cs]) => cs.length);
    const secLabel = sec => (sec.isGeneral ? 'General' : labelOf(sec));
    if (fmt === 'json') {
      return JSON.stringify({
        artifact: { title, path: location.pathname, id: meta('artifact-id') || null },
        exportedAt: new Date().toISOString(),
        reviewed: sections.filter(s => state.reviewed[s.id]).map(s => s.id),
        blocks: HA.blocks ? HA.blocks() : {},
        comments: bySection.flatMap(([sec, cs]) => cs.map(c => ({
          id: c.id, section: sec.id, sectionLabel: secLabel(sec), kind: c.kind || 'comment', severity: sevOf(c.sev).label, blocking: !!c.blocking,
          body: c.body, replacement: c.replacement ?? null, suggestion: c.suggestion || null, label: c.label || null, tip: c.tip || null,
          quote: c.anchor?.text ?? null, prefix: c.anchor?.prefix ?? null, suffix: c.anchor?.suffix ?? null,
          outdated: !!c.outdated, addressed: !!c.addressed,
        }))),
      }, null, 2);
    }
    if (fmt === 'bullets') {
      return bySection.map(([sec, cs]) => `*${secLabel(sec)}* — ${cs.length} item${cs.length > 1 ? 's' : ''}\n` + cs.map(c =>
        `  • [${label(c)}] ${c.anchor ? `"${c.anchor.text.slice(0, 60)}${c.anchor.text.length > 60 ? '…' : ''}" ` : ''}${c.body.split('\n')[0]}`).join('\n')).join('\n\n');
    }
    const blockList = Object.entries(HA.blocks ? HA.blocks() : {});
    const blocksMd = blockList.length ? `\n### Interactive state\n\n${blockList.map(([n, b]) => `- **${n}**: ${b.summary ?? JSON.stringify(b.state)}`).join('\n')}\n` : '';
    return `## ${title} — review notes\n\n` + bySection.map(([sec, cs]) => `### ${secLabel(sec)}\n\n` + cs.map(c =>
      `**[${label(c)}]**${c.outdated ? ' _(outdated: the highlighted text is no longer on the page)_' : ''}${c.addressed ? ' _(done)_' : ''}\n\n` +
      (c.anchor ? `> ${c.anchor.text}\n\n` : '') + (c.kind === 'replace' ? `Replace with: ${c.replacement || ''}\n\n` : '')
      + (c.kind === 'delete' && !c.body ? 'Remove this text.\n' : '') + (c.body ? `${c.body}\n` : '')
      + (c.label ? `\n_${c.label}. Agent tip: ${c.tip}_\n` : '')
      + (c.suggestion ? `\n\`\`\`suggestion\n${c.suggestion}\n\`\`\`\n` : '')).join('\n')).join('\n') + blocksMd;
  };

  // ---- Tray and drawer ----
  const tray = h('button', { type: 'button', className: 'rv-ui rv-tray', 'aria-haspopup': 'dialog' });
  const format = h('select', { 'aria-label': 'Export format' },
    h('option', { value: 'markdown', textContent: 'Markdown' }), h('option', { value: 'bullets', textContent: 'Slack bullets' }),
    h('option', { value: 'json', textContent: 'JSON for an agent' }));
  const output = h('textarea', { readOnly: true, 'aria-label': 'Export output' });
  const copyBtn = h('button', { type: 'button', className: 'rv-btn', textContent: 'Copy' });
  const sendBtn = h('button', { type: 'button', className: 'rv-btn rv-primary rv-send', textContent: 'Send to Claude' });
  const sendStatus = h('p', { className: 'rv-send-status', 'aria-live': 'polite' });
  const clearBtn = h('button', { type: 'button', className: 'rv-btn rv-danger', textContent: 'Clear all' });
  const generalBtn = h('button', { type: 'button', className: 'rv-btn rv-general', textContent: '+ General comment' });
  const shareBtn = h('button', { type: 'button', className: 'rv-btn rv-share', textContent: 'Copy share link' });
  const tabs = h('div', { className: 'rv-tabs', role: 'tablist' },
    h('button', { type: 'button', role: 'tab', 'data-tab': 'list', 'aria-selected': 'true', textContent: 'Comments' }),
    h('button', { type: 'button', role: 'tab', 'data-tab': 'export', 'aria-selected': 'false', textContent: 'Export' }));
  const list = h('div', { className: 'rv-list', role: 'tabpanel' });
  const exportPane = h('div', { className: 'rv-export', role: 'tabpanel', hidden: true });
  const closeBtn = h('button', { type: 'button', className: 'rv-btn rv-close', 'aria-label': 'Close', textContent: '×' });
  const drawer = h('aside', { className: 'rv-ui rv-drawer', role: 'dialog', 'aria-label': `${LABEL} export` },
    h('div', { className: 'rv-drawer-head' }, h('strong', { textContent: LABEL }), closeBtn),
    h('div', { className: 'rv-row' }, sendBtn, sendStatus), tabs, list, exportPane);
  exportPane.append(h('div', { className: 'rv-row' }, format, copyBtn, shareBtn, clearBtn), output);

  // The Comments tab lists every comment in document order, so the reader can review the review.
  const docOrder = () => {
    const pos = c => {
      const m = c.anchor && document.querySelector(`mark.rv-mark[data-id="${c.id}"]`);
      const sIdx = c.sectionId === GENERAL ? -1 : sections.findIndex(x => x.id === c.sectionId);
      return [sIdx, m ? 0 : 1, m];
    };
    return [...state.comments].sort((a, b) => {
      const [sa, ua, ma] = pos(a), [sb, ub, mb] = pos(b);
      if (sa !== sb) return sa - sb;
      if (ua !== ub) return ua - ub;
      return ma && mb ? (ma.compareDocumentPosition(mb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1) : 0;
    });
  };
  const renderList = () => {
    const items = docOrder().map(c => {
      const sec = sections.find(x => x.id === c.sectionId);
      const item = h('button', { type: 'button', className: `rv-list-item${c.addressed ? ' rv-addressed' : ''}`, 'data-id': c.id, 'data-tone': sevOf(c.sev).tone },
        h('span', { className: 'rv-badge', 'data-tone': sevOf(c.sev).tone, textContent: label(c) }),
        h('small', { textContent: c.sectionId === GENERAL ? 'General' : sec ? labelOf(sec) : '' }),
        c.anchor ? h('q', { textContent: c.anchor.text }) : null,
        c.body ? h('span', { className: 'rv-list-body', textContent: c.body }) : null);
      return item;
    });
    list.replaceChildren(generalBtn, ...(items.length ? items : [h('p', { className: 'rv-empty', textContent: 'No comments yet. Select text on the page, or use + Comment under a section.' })]));
  };
  list.addEventListener('click', e => {
    const item = e.target.closest('.rv-list-item');
    if (!item) return;
    const m = document.querySelector(`mark.rv-mark[data-id="${item.dataset.id}"]`);
    const target = m || document.querySelector(`.rv-card[data-id="${item.dataset.id}"]`);
    toggleDrawer(false);
    target?.scrollIntoView({ block: 'center' });
    m?.classList.add('rv-flash');
    setTimeout(() => m?.classList.remove('rv-flash'), 900);
  });
  tabs.addEventListener('click', e => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    tabs.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === t)));
    list.hidden = t.dataset.tab !== 'list';
    exportPane.hidden = t.dataset.tab !== 'export';
  });
  generalBtn.addEventListener('click', () => {
    const close = () => { form.remove(); generalBtn.hidden = false; };
    const form = editor({
      onCancel: close,
      onSave: f => {
        if (!f.body) return;
        state.comments.push({ id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, sectionId: GENERAL, ...f, ts: Date.now() });
        close();
        commit();
      },
    });
    generalBtn.hidden = true;
    generalBtn.after(form);
  });
  const toggleDrawer = open => {
    drawer.classList.toggle('rv-open', open);
    if (open) { output.value = exportAs(format.value); renderList(); closeBtn.focus(); }
  };
  tray.addEventListener('click', () => toggleDrawer(!drawer.classList.contains('rv-open')));
  closeBtn.addEventListener('click', () => toggleDrawer(false));
  format.addEventListener('change', () => { output.value = exportAs(format.value); });
  // Send posts the JSON export to the session's receiver, as text/plain so no CORS preflight is needed.
  // Without a receiver, or when the post fails, it copies the same JSON for the user to paste.
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const t = h('textarea', {}); t.value = text; document.body.append(t); t.select();
      const ok = document.execCommand('copy'); t.remove(); return ok;
    }
  };
  sendBtn.addEventListener('click', async () => {
    const payload = exportAs('json');
    const url = window.__CLAUDE_SUBMIT_URL__;
    sendStatus.textContent = 'Sending…';
    if (url) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: payload });
        if (res.ok) { sendStatus.textContent = 'Sent to Claude.'; return; }
      } catch { /* fall through to the clipboard */ }
    }
    await copyText(payload);
    sendStatus.textContent = url ? 'Claude wasn\'t listening, so the review is on your clipboard. Paste it into the chat.'
      : 'Copied to your clipboard. Paste it into the chat.';
  });
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.value); } catch { output.select(); document.execCommand('copy'); }
    copyBtn.textContent = 'Copied';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1200);
  });
  clearBtn.addEventListener('click', () => {
    if (clearBtn.dataset.armed) {
      state.comments = [];
      state.reviewed = {};
      delete clearBtn.dataset.armed;
      clearBtn.textContent = 'Clear all';
      commit();
    } else {
      clearBtn.dataset.armed = '1';
      clearBtn.textContent = 'Click again to clear';
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!popover.hidden) closePopover();
    else if (drawer.classList.contains('rv-open')) toggleDrawer(false);
  });

  // Share links carry the review in the URL fragment, deflated and base64url-encoded. Opening one
  // merges its comments and reviewed sections into this reader's review, then clears the fragment.
  const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  const shareLink = async () => {
    const packed = await pipe(new TextEncoder().encode(JSON.stringify({ comments: state.comments, reviewed: state.reviewed })), new CompressionStream('deflate-raw'));
    return `${location.href.split('#')[0]}#ha=${b64(packed)}`;
  };
  const importShared = async () => {
    const m = location.hash.match(/^#ha=([\w-]+)/);
    if (!m) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(await pipe(unb64(m[1]), new DecompressionStream('deflate-raw'))));
      const known = new Set(state.comments.map(c => c.id));
      const added = (data.comments || []).filter(c => !known.has(c.id));
      state.comments.push(...added);
      Object.assign(state.reviewed, data.reviewed || {});
      commit();
      notice(`Merged ${added.length} comment${added.length === 1 ? '' : 's'} from a shared link.`);
    } catch { notice('This share link could not be read.'); }
    history.replaceState(null, '', location.pathname + location.search);
  };
  const notice = text => {
    const n = h('div', { className: 'rv-ui rv-notice', role: 'status', textContent: text });
    document.body.append(n);
    setTimeout(() => n.remove(), 4000);
  };
  shareBtn.addEventListener('click', async () => {
    const ok = await copyText(await shareLink());
    shareBtn.textContent = ok ? 'Link copied' : 'Copy failed';
    setTimeout(() => { shareBtn.textContent = 'Copy share link'; }, 1400);
  });

  // ---- What changed since the reader last looked ----
  // build.mjs embeds each section's source text. The last build this reader saw is kept per page,
  // and a section whose text differs gets a banner with a word-level diff.
  const SEEN = `html-artifact:${location.pathname}:seen`;
  const built = (() => { try { return JSON.parse(document.querySelector('script[data-component="sections"]')?.textContent || '{}'); } catch { return {}; } })();
  const seen = HA.store.get(SEEN, {});
  const wordDiff = (a, b) => {
    const x = a.split(/(\s+)/), y = b.split(/(\s+)/);
    if (x.length * y.length > 4e6) return [['del', a], ['ins', b]];
    const L = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    const push = (t, v) => { if (out.length && out[out.length - 1][0] === t) out[out.length - 1][1] += v; else out.push([t, v]); };
    let i = 0, j = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) { push('eq', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('del', x[i++]); else push('ins', y[j++]);
    }
    while (i < x.length) push('del', x[i++]);
    while (j < y.length) push('ins', y[j++]);
    return out;
  };
  for (const sec of sections) {
    const now = built[sec.id];
    if (now === undefined) continue;
    const before = seen[sec.id];
    if (before === undefined) { seen[sec.id] = now; continue; }
    if (before === now) continue;
    sec.classList.add('rv-changed');
    const diff = h('div', { className: 'rv-ui rv-diff', hidden: true },
      ...wordDiff(before, now).map(([t, v]) => (t === 'eq' ? v : h(t, { textContent: v }))));
    const showBtn = h('button', { type: 'button', className: 'rv-link rv-changed-btn', textContent: 'Show changes' });
    const seenBtn = h('button', { type: 'button', className: 'rv-link', textContent: 'Mark as seen' });
    const bar = h('div', { className: 'rv-ui rv-changed-bar' }, h('span', { textContent: 'Changed since you last looked.' }), showBtn, seenBtn);
    showBtn.addEventListener('click', () => { diff.hidden = !diff.hidden; showBtn.textContent = diff.hidden ? 'Show changes' : 'Hide changes'; });
    seenBtn.addEventListener('click', () => { seen[sec.id] = now; HA.store.set(SEEN, seen); bar.remove(); diff.remove(); sec.classList.remove('rv-changed'); });
    sec.querySelector(':scope > .rv-check').after(bar, diff);
  }
  HA.store.set(SEEN, seen);

  document.body.append(helper, popover, tray, drawer);
  render();
  importShared();
  performance.measure('ha:review-init', 'ha:review-start');
  HA.review = { export: exportAs, shareLink, state: () => JSON.parse(JSON.stringify(state)), clear: () => { state.comments = []; state.reviewed = {}; commit(); } };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
