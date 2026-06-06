// =============================================================================
// Sticky side-nav with scroll-spy + optional per-section progress bars.
// Pairs with this side-nav markup (one <a> per section, href=#section-id):
//
//   <nav class="sidenav">
//     <a href="#intro"><span class="num">01</span> Intro</a>
//     <a href="#scope"><span class="num">02</span> Scope</a>
//     ...
//   </nav>
//
// CSS (place in design-system.css extension block):
//
//   .sidenav { position: sticky; top: 72px; align-self: start;
//     max-height: calc(100vh - 96px); overflow-y: auto;
//     font-family: var(--mono); font-size: 11.5px; padding-right: 8px; }
//   .sidenav a { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; color: var(--ink-2); text-decoration: none; }
//   .sidenav a .num { color: var(--ink-4); width: 24px; flex: none; }
//   .sidenav a:hover { color: var(--ink); }
//   .sidenav a.active { color: var(--accent); }
//   .sidenav a .check    { color: var(--sev-good); margin-left: 4px; }
//   .sidenav a .progress { display: inline-block; width: 30px; height: 4px;
//     background: var(--rule); border-radius: 2px; margin-left: 6px;
//     vertical-align: middle; overflow: hidden; }
//   .sidenav a .progress > span { display: block; height: 100%;
//     background: var(--accent); width: 0%; transition: width .25s; }
// =============================================================================

(function () {
  // ---- scroll-spy ----------------------------------------------------------
  function watchScroll() {
    const links = Array.from(document.querySelectorAll(".sidenav a"));
    const map = {};
    links.forEach(a => {
      const id = (a.getAttribute("href") || "").slice(1);
      const el = id && document.getElementById(id);
      if (el) map[id] = { link: a, el };
    });
    function onScroll() {
      const y = window.scrollY + 140;  // offset for sticky topbar + breathing room
      let active = null;
      Object.values(map).forEach(m => { if (m.el.offsetTop <= y) active = m; });
      Object.values(map).forEach(m => m.link.classList.remove("active"));
      if (active) active.link.classList.add("active");
    }
    document.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---- smooth-scroll anchor links + history.replaceState -------------------
  function wireAnchorLinks() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener("click", e => {
        const id = (a.getAttribute("href") || "").slice(1);
        const el = id && document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        history.replaceState(null, "", "#" + id);
      });
    });
  }

  // ---- (optional) progress bars per sidenav link --------------------------
  // Counts checked .section-reviewed inputs inside the linked section.
  function wireProgressBars() {
    document.querySelectorAll(".sidenav a").forEach(a => {
      if (a.querySelector(".progress")) return;
      const id = (a.getAttribute("href") || "").slice(1);
      const sec = id && document.getElementById(id);
      if (!sec) return;
      // Only wire progress if the section has trackable children — e.g. nested file blocks.
      if (!sec.querySelector(".file-checkbox, .annot-done-checkbox")) return;
      const bar  = document.createElement("span"); bar.className = "progress";
      const fill = document.createElement("span"); bar.appendChild(fill);
      a.appendChild(bar);
    });
    updateProgress();
  }
  function updateProgress() {
    document.querySelectorAll(".sidenav a").forEach(a => {
      const id = (a.getAttribute("href") || "").slice(1);
      const sec = id && document.getElementById(id);
      const fill = a.querySelector(".progress > span");
      if (!sec || !fill) return;
      const items = sec.querySelectorAll(".file-checkbox, .annot-done-checkbox");
      if (!items.length) return;
      const done = Array.from(items).filter(cb => cb.checked).length;
      const pct = Math.round(100 * done / items.length);
      fill.style.width = pct + "%";
      a.title = done + " / " + items.length + " items done";
    });
  }
  // Expose for callers that flip checkboxes programmatically.
  window.__updateSidenavProgress = updateProgress;

  // ---- (optional) date stamp injection ------------------------------------
  // <span id="date"></span> in topbar will be populated with today's ISO date.
  function injectDateStamp() {
    const el = document.getElementById("date");
    if (el) el.textContent = new Date().toISOString().slice(0, 10);
  }

  function boot() {
    injectDateStamp();
    wireAnchorLinks();
    wireProgressBars();
    watchScroll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
