// requires: shell
// Mind map: an editable outline (ul.mindmap) with per-node rename, add child/sibling,
// delete with undo, indent/outdent, sibling reordering, and a keep / maybe / drop mark.
// State is the full tree as JSON: [{text, mark, children: […]}].
(() => {
  const HA = window.HA;
  const ui = n => { n.dataset.ui = ''; return n; };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const MARKS = [null, 'keep', 'maybe', 'drop'];
  const markLabel = m => (m ? m[0].toUpperCase() + m.slice(1) : 'Mark');

  document.querySelectorAll('ul.mindmap').forEach((root, idx) => {
    const id = root.dataset.id || `mindmap-${idx}`;
    const name = `mindmap:${id}`;
    let undoSlot = null;

    const ownerLi = ul => (ul.parentElement.tagName === 'LI' ? ul.parentElement : null);

    function updateToggle(li) {
      const childUl = li.querySelector(':scope > ul');
      const has = !!(childUl && childUl.children.length);
      const toggle = li.querySelector(':scope > .row > .toggle');
      toggle.hidden = !has;
      if (has) toggle.textContent = childUl.hidden ? '▸' : '▾';
    }

    function startEdit(label) {
      label.dataset.before = label.textContent;
      label.contentEditable = 'true';
      label.focus();
      const range = document.createRange();
      range.selectNodeContents(label);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function cancelEdit(label) {
      label.textContent = label.dataset.before;
      label.contentEditable = 'false';
    }
    function commitEdit(label) {
      if (label.contentEditable !== 'true') return;
      label.contentEditable = 'false';
      const text = label.textContent.trim() || label.dataset.before || 'Idea';
      const changed = text !== label.dataset.before;
      label.textContent = text;
      delete label.dataset.before;
      if (changed) HA.changed(name);
    }

    function enhanceLi(li) {
      if (li.querySelector(':scope > .row')) return;
      const childUl = li.querySelector(':scope > ul');
      let text = '';
      [...li.childNodes].forEach(n => { if (n.nodeType === Node.TEXT_NODE) text += n.textContent; });
      [...li.childNodes].forEach(n => { if (n.nodeType === Node.TEXT_NODE) li.removeChild(n); });

      const toggle = ui(el('button', 'toggle'));
      toggle.type = 'button';
      toggle.setAttribute('aria-label', 'Collapse or expand');
      toggle.addEventListener('click', () => {
        childUl.hidden = !childUl.hidden;
        toggle.textContent = childUl.hidden ? '▸' : '▾';
      });

      const label = el('span', 'label', text.trim());
      label.tabIndex = 0;
      label.contentEditable = 'false';

      const mark = ui(el('button', 'mark', markLabel(li.dataset.tone || null)));
      mark.type = 'button';
      mark.setAttribute('aria-label', 'Cycle keep, maybe, drop mark');
      mark.addEventListener('click', () => {
        const next = MARKS[(MARKS.indexOf(li.dataset.tone || null) + 1) % MARKS.length];
        if (next) li.dataset.tone = next; else delete li.dataset.tone;
        mark.textContent = markLabel(next);
        HA.changed(name);
      });

      const addChildBtn = el('button', 'add-child', '+ child');
      const addSiblingBtn = el('button', 'add-sibling', '+ sibling');
      const deleteBtn = el('button', 'delete', 'Delete');
      [addChildBtn, addSiblingBtn, deleteBtn].forEach(b => { b.type = 'button'; });
      addChildBtn.addEventListener('click', () => addChild(li));
      addSiblingBtn.addEventListener('click', () => addSibling(li));
      deleteBtn.addEventListener('click', () => removeNode(li));
      const controls = ui(el('div', 'controls'));
      controls.append(mark, addChildBtn, addSiblingBtn, deleteBtn);

      const row = el('div', 'row');
      row.append(toggle, label, controls);
      li.prepend(row);
      updateToggle(li);
      if (childUl) [...childUl.children].forEach(enhanceLi);
    }

    const newLi = text => {
      const li = document.createElement('li');
      li.append(document.createTextNode(text));
      return li;
    };

    function addChild(li) {
      let childUl = li.querySelector(':scope > ul');
      if (!childUl) { childUl = document.createElement('ul'); li.append(childUl); }
      const nli = newLi('New idea');
      childUl.append(nli);
      enhanceLi(nli);
      updateToggle(li);
      HA.changed(name);
      startEdit(nli.querySelector(':scope > .row > .label'));
    }

    function addSibling(li) {
      const nli = newLi('New idea');
      li.after(nli);
      enhanceLi(nli);
      const owner = ownerLi(li.parentElement);
      if (owner) updateToggle(owner);
      HA.changed(name);
      startEdit(nli.querySelector(':scope > .row > .label'));
    }

    function removeNode(li) {
      const parentUl = li.parentElement;
      undoSlot = { parentUl, li, next: li.nextSibling };
      parentUl.removeChild(li);
      const owner = ownerLi(parentUl);
      if (owner) updateToggle(owner);
      undoBtn.disabled = false;
      HA.changed(name);
    }

    function undoDelete() {
      if (!undoSlot) return;
      const { parentUl, li, next } = undoSlot;
      parentUl.insertBefore(li, next);
      const owner = ownerLi(parentUl);
      if (owner) updateToggle(owner);
      undoSlot = null;
      undoBtn.disabled = true;
      HA.changed(name);
    }

    function indent(li) {
      const prev = li.previousElementSibling;
      if (!prev) return;
      let childUl = prev.querySelector(':scope > ul');
      if (!childUl) { childUl = document.createElement('ul'); prev.append(childUl); }
      const oldOwner = ownerLi(li.parentElement);
      childUl.append(li);
      updateToggle(prev);
      if (oldOwner) updateToggle(oldOwner);
      HA.changed(name);
    }

    function outdent(li) {
      const parentUl = li.parentElement;
      const parentLi = ownerLi(parentUl);
      if (!parentLi) return;
      parentLi.after(li);
      updateToggle(parentLi);
      const grandOwner = ownerLi(parentLi.parentElement);
      if (grandOwner) updateToggle(grandOwner);
      HA.changed(name);
    }

    function move(li, dir) {
      const sib = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
      if (!sib) return;
      dir < 0 ? sib.before(li) : sib.after(li);
      HA.changed(name);
    }

    [...root.children].forEach(enhanceLi);

    const tools = el('div', 'mindmap-tools');
    const undoBtn = el('button', '', 'Undo delete');
    undoBtn.type = 'button';
    undoBtn.disabled = true;
    undoBtn.addEventListener('click', undoDelete);
    tools.append(undoBtn);
    root.before(tools);

    root.addEventListener('dblclick', e => {
      const label = e.target.closest('.label');
      if (label) startEdit(label);
    });
    root.addEventListener('focusout', e => {
      const label = e.target.closest?.('.label');
      if (label) commitEdit(label);
    });
    root.addEventListener('keydown', e => {
      const label = e.target.closest('.label');
      if (!label) return;
      const li = label.closest('li');
      if (e.key === 'Enter') {
        e.preventDefault();
        if (label.contentEditable === 'true') label.blur();
        else startEdit(label);
      } else if (e.key === 'Escape' && label.contentEditable === 'true') {
        e.preventDefault();
        cancelEdit(label);
        label.blur();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) outdent(li); else indent(li);
        label.focus();
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        move(li, e.key === 'ArrowUp' ? -1 : 1);
        label.focus();
      }
    });

    function serializeLi(li) {
      const label = li.querySelector(':scope > .row > .label');
      const childUl = li.querySelector(':scope > ul');
      return {
        text: label.textContent.trim(),
        mark: li.dataset.tone || null,
        children: childUl ? [...childUl.children].map(serializeLi) : [],
      };
    }
    const countNodes = list => list.reduce((n, c) => n + 1 + countNodes(c.children), 0);
    const countDropped = list => list.reduce((n, c) => n + (c.mark === 'drop' ? 1 : 0) + countDropped(c.children), 0);

    function buildLi(node) {
      const li = newLi(node.text || '');
      if (node.mark) li.dataset.tone = node.mark;
      if (node.children && node.children.length) {
        const childUl = document.createElement('ul');
        node.children.forEach(c => childUl.append(buildLi(c)));
        li.append(childUl);
      }
      return li;
    }

    HA.register(name, {
      state: () => [...root.children].map(serializeLi),
      restore: tree => {
        root.replaceChildren(...tree.map(buildLi));
        [...root.children].forEach(enhanceLi);
      },
      summary: () => {
        const tree = [...root.children].map(serializeLi);
        return `${countNodes(tree)} nodes · ${countDropped(tree)} dropped`;
      },
    });
  });
})();
