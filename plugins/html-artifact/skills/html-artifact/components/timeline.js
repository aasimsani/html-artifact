// requires: shell
// Roadmap layout: month axis, bars placed by date, and a today marker. Rail and stepper are CSS only.
(() => {
  const day = s => Date.parse(`${s}T00:00:00Z`);
  document.querySelectorAll('.roadmap').forEach(road => {
    const start = day(road.dataset.start), end = day(road.dataset.end);
    const pct = t => `${Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100))}%`;
    const inner = document.createElement('div');
    inner.className = 'inner';
    inner.append(...road.children);
    road.append(inner);

    const axis = document.createElement('div');
    axis.className = 'axis';
    axis.dataset.ui = '';
    const months = [];
    for (let d = new Date(start); d.getTime() <= end; d.setUTCMonth(d.getUTCMonth() + 1, 1)) months.push(new Date(d));
    axis.style.gridTemplateColumns = months.map(m => {
      const next = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1);
      return `${(Math.min(next, end) - Math.max(m.getTime(), start)) / 864e5}fr`;
    }).join(' ');
    axis.append(...months.map(m => Object.assign(document.createElement('span'), {
      textContent: m.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) + (m.getUTCMonth() === 0 ? ` ${m.getUTCFullYear()}` : ''),
    })));
    inner.prepend(axis);

    inner.querySelectorAll('.lane > span').forEach(bar => {
      const a = day(bar.dataset.start), b = day(bar.dataset.end);
      bar.style.left = pct(a);
      bar.style.width = `calc(${pct(b)} - ${pct(a)})`;
      bar.title = `${bar.textContent.trim()}: ${bar.dataset.start} → ${bar.dataset.end}`;
    });

    if (road.dataset.today) {
      const today = document.createElement('div');
      today.className = 'today';
      today.dataset.ui = '';
      today.style.left = `calc(110px + (100% - 110px) * ${parseFloat(pct(day(road.dataset.today))) / 100})`;
      inner.append(today);
    }
  });
})();
