// requires: shell
// Playground: live sliders, selects and checkboxes that tune CSS variables on a preview target.
(() => {
  const HA = window.HA;
  document.querySelectorAll('form.playground').forEach(form => {
    const id = form.dataset.id || 'playground';
    const name = `playground:${id}`;
    const target = (form.dataset.target && document.querySelector(form.dataset.target)) || form;
    const inputs = [...form.querySelectorAll('input[name], select[name]')];
    const isCheckbox = input => input.type === 'checkbox';

    const defaultOf = input => {
      if (isCheckbox(input)) return input.defaultChecked;
      if (input.tagName === 'SELECT') return [...input.options].find(o => o.defaultSelected)?.value ?? input.options[0]?.value ?? '';
      return input.defaultValue + (input.dataset.unit || '');
    };
    const currentOf = input => {
      if (isCheckbox(input)) return input.checked;
      return input.value + (input.tagName === 'SELECT' ? '' : (input.dataset.unit || ''));
    };

    const defaults = Object.fromEntries(inputs.map(i => [i.name, defaultOf(i)]));
    const readouts = new Map(inputs.map(input => {
      const readout = document.createElement('span');
      readout.className = 'readout';
      readout.dataset.ui = '';
      input.after(readout);
      return [input.name, readout];
    }));

    const values = () => Object.fromEntries(inputs.map(i => [i.name, currentOf(i)]));

    const apply = () => {
      inputs.forEach(input => {
        const value = currentOf(input);
        target.style.setProperty(`--${input.name}`, isCheckbox(input) ? (value ? '1' : '0') : value);
        readouts.get(input.name).textContent = isCheckbox(input) ? (value ? 'on' : 'off') : String(value);
        input.closest('label')?.classList.toggle('changed', value !== defaults[input.name]);
      });
    };

    const summary = () => {
      const changed = inputs.filter(input => currentOf(input) !== defaults[input.name]);
      if (!changed.length) return 'defaults';
      return changed.map(input => `${input.name} ${defaults[input.name]} → ${currentOf(input)}`).join(', ');
    };

    const changed = () => { apply(); HA.changed(name); };

    HA.register(name, {
      state: () => ({ values: values() }),
      restore: s => {
        const saved = s.values || {};
        inputs.forEach(input => {
          if (!(input.name in saved)) return;
          if (isCheckbox(input)) input.checked = !!saved[input.name];
          else if (input.tagName === 'SELECT') input.value = saved[input.name];
          else input.value = parseFloat(saved[input.name]);
        });
        apply();
      },
      summary,
    });

    form.addEventListener('input', changed);
    form.addEventListener('reset', () => setTimeout(changed));

    form.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = JSON.parse(btn.dataset.preset);
        Object.entries(preset).forEach(([key, value]) => {
          const input = form.elements.namedItem(key);
          if (!input) return;
          if (isCheckbox(input)) input.checked = !!value; else input.value = value;
        });
        changed();
      });
    });

    const copyBtn = form.querySelector('[data-action="copy"]');
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      const v = values();
      const css = ['{', ...Object.entries(v).map(([k, val]) => `  --${k}: ${typeof val === 'boolean' ? (val ? 1 : 0) : val};`), '}'].join('\n');
      const text = `${JSON.stringify(v, null, 2)}\n\n${css}`;
      try { await navigator.clipboard.writeText(text); copyBtn.textContent = 'Copied'; } catch { copyBtn.textContent = 'Copy failed'; }
      setTimeout(() => { copyBtn.textContent = 'Copy values'; }, 1200);
    });

    apply();
  });
})();
