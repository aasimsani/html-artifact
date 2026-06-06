// =============================================================================
// Persistence — slug-prefixed localStorage with reset/export/import hatch.
// Three keys: checkboxes, comments (shared by per-section + annotations),
// queue. Replace SLUG with your artifact slug (e.g. "rfc-auth-service").
// =============================================================================

const SLUG = "ARTIFACT-SLUG";            // workflow command sets this
const KEY_CHECK    = SLUG + "-checkboxes.v1";
const KEY_COMMENTS = SLUG + "-comments.v1";
const KEY_QUEUE    = SLUG + "-queue.v1";

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota — silently drop */ }
}

let checks   = loadJSON(KEY_CHECK, {});
let comments = loadJSON(KEY_COMMENTS, {});
let queue    = loadJSON(KEY_QUEUE, {});
window.__commentStore = comments;  // single source of truth for comments + annotations

// Comment id generator — stable enough for a session, unique across reloads
function newCommentId() {
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

// ---- DevTools reset/export/import hatch -----------------------------------
// Access via window.__<slug-as-js-ident> in the console. Useful for clearing
// state during authoring, snapshotting state between machines, and importing
// fixtures for screenshot/demo runs.
const HATCH_KEY = "__" + SLUG.replace(/[^a-zA-Z0-9_$]/g, "_");
window[HATCH_KEY] = {
  clearAll() {
    localStorage.removeItem(KEY_CHECK);
    localStorage.removeItem(KEY_COMMENTS);
    localStorage.removeItem(KEY_QUEUE);
    location.reload();
  },
  exportState() {
    return JSON.stringify({ checks, comments: window.__commentStore, queue }, null, 2);
  },
  importState(j) {
    const o = typeof j === "string" ? JSON.parse(j) : j;
    if (o.checks)   saveJSON(KEY_CHECK,    o.checks);
    if (o.comments) saveJSON(KEY_COMMENTS, o.comments);
    if (o.queue)    saveJSON(KEY_QUEUE,    o.queue);
    location.reload();
  }
};
