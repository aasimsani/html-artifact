# Companion file — disk-backed state for agent monitoring

When the user clicks **Link .json** in the drawer, the artifact picks a path next to the HTML file (via `showSaveFilePicker`) and starts writing all annotations, comments, and queue state to that JSON file. The artifact also polls the file every 3 seconds (and on tab focus) — so anything an external process writes back appears in the UI within seconds.

This turns the HTML artifact into a two-way channel between a human reviewer and a watcher process such as a Claude agent.

## File format

```json
{
  "slug": "rfc-auth-service",
  "version": 1,
  "savedAt": "2026-05-14T18:30:12.345Z",
  "artifact": {
    "htmlPath": "/Users/jamie/code/foo/rfc_auth-service.html",
    "title": "Auth service redesign",
    "generatedAt": "2026-05-14T18:00:00Z"
  },
  "checks": {
    "section-intro": true
  },
  "comments": {
    "c_lmx9z8h_a3k2p": {
      "id": "c_lmx9z8h_a3k2p",
      "sectionId": "intro",
      "sectionHeading": "Why we're doing this",
      "sectionLine": 412,
      "sev": "q",
      "title": "",
      "body": "Is the migration safe under concurrent writes?",
      "queued": true,
      "addressed": false,
      "ts": 1747268403119,
      "author": "user",
      "anchor": {
        "aid": "a3",
        "start": 124,
        "end": 187,
        "text": "exact quoted text from the document",
        "selector": "#intro > div:nth-child(4) > p:nth-child(2)",
        "tag": "p",
        "sectionHeading": "Why we're doing this",
        "sourceLine": 438
      }
    }
  },
  "queue": {
    "c_lmx9z8h_a3k2p": { "queued": true, "ts": 1747268403119 }
  }
}
```

For a multi-element selection (`anchor.aids[]` instead of `anchor.aid`), each sub-anchor carries its own `selector`, `tag`, and `sourceLine`, and the anchor gets a `sourceLines: [firstLine, lastLine]` range:

```json
"anchor": {
  "text": "first paragraph text...\n\nsecond paragraph text...",
  "aids": [
    { "aid": "a3", "start": 0,  "end": 24, "selector": "#intro > p:nth-child(1)", "tag": "p", "sourceLine": 438 },
    { "aid": "a4", "start": 10, "end": 55, "selector": "#scope > p:nth-child(2)", "tag": "p", "sourceLine": 472 }
  ],
  "sectionHeading": "Intro",
  "sourceLines": [438, 472]
}
```

Fields:

| Field | Notes |
|---|---|
| `slug` | Must match the artifact's `SLUG` constant — the artifact ignores files with a different slug to prevent cross-talk. |
| `version` | Currently `1`. Bump on incompatible schema changes. |
| `savedAt` | ISO timestamp of the last write. Informational only. |
| `artifact.htmlPath` | Path the artifact was loaded from. **Use this to know which HTML file to open / edit.** Absolute when loaded via `file://`; URL path otherwise. |
| `artifact.title` | The `<h1>` text, for logging / dashboards. |
| `checks` | Map of `section-<id>` → `true` for sections the human marked reviewed. |
| `comments[id]` | The full comment object — same shape as in `window.__commentStore`. |
| `comments[id].sectionHeading` | Plain text of the section's `<h1>`/`<h2>`/`<h3>` — human-readable section title. |
| `comments[id].sectionLine` | 1-indexed line in `artifact.htmlPath` where the section's `<section id="...">` opens. Use to jump straight to the section. |
| `comments[id].author` | `"user"` (human) or any other string. Non-`user` authors render with a distinct badge + card tint. Convention: `"claude"`, `"reviewer-bot"`, `"<github-username>"`. |
| `comments[id].anchor` | Optional. Annotation anchor; see below for shape + locator fields. Per-section comments have no anchor. |
| `comments[id].replyTo` | Optional. Comment id this is a reply to. The artifact currently renders replies flat (chronological by `ts`); future versions may indent. |
| `queue[id]` | Mirrors `comments[id].queued` for export ordering. Watchers can leave this untouched and let the artifact reconcile. |

### Anchor locators

Anchors include source-locator metadata so an external agent can find the exact span in the raw HTML without re-rendering. For each anchor (or sub-anchor in the multi-aid case):

| Field | Notes |
|---|---|
| `text` | The verbatim quoted text the human selected. Always present. |
| `aid` / `start` / `end` | Browser-level handle: `data-aid` is assigned at load time; `start`/`end` are character offsets into the element's `textContent`. Use these for in-page navigation only — they are **not** stable across rerenders of the source HTML. |
| `selector` | CSS path of the form `#<sectionId> > <tag>:nth-child(N) > ...` rooted at the section. Stable as long as the section layout doesn't change. Safe to use with `document.querySelector` in any tool that has a DOM. |
| `tag` | Lowercased element tag (`p`, `li`, `h2`, etc.) — useful for quick disambiguation. |
| `sourceLine` | 1-indexed line in `artifact.htmlPath` where the anchor text first appears. Computed by substring lookup against the cached source, so it's best-effort: returns `null` if the text was modified inline (e.g. `<code>` tags split the rendered text). |
| `sourceLines` | Multi-aid only: `[firstLine, lastLine]` range across all sub-anchors. |

## Merge semantics

The artifact reconciles on every poll. Rules:

1. **By id.** Entries are matched by `comments[id]`.
2. **Newer `ts` wins.** When both sides have the same id, the entry with the larger `ts` is kept.
3. **New entries merge in.** A new id in the file appears in the UI on the next poll.
4. **Deletes propagate.** If the file omits a previously-present id and the file's `lastModified` is newer than the artifact's last write, the artifact removes the local copy. Authors-other-than-`user` should generally *not* delete user comments — append only.

To avoid the `ts` race when an external process appends, set `ts` to `Date.now()` at write time.

## Finding the anchored text in the HTML

The locator fields are designed for three navigation modes:

1. **Jump-to-line in an editor.** Open `artifact.htmlPath`, jump to `anchor.sourceLine`. The quoted text is on that line (or within a few lines if the source is soft-wrapped).
2. **Grep.** `grep -nF "<anchor.text>" "<artifact.htmlPath>"` — works for any short prose snippet. If `anchor.text` contains newlines (multi-aid selection), split on `\n\n` and grep each paragraph independently.
3. **CSS-selector lookup at runtime.** If the agent has a headless browser or a DOM parser, `document.querySelector(anchor.selector)` returns the exact node. From there, `.textContent.slice(anchor.start, anchor.end)` is the quoted span.

For editing the source HTML to address the comment (e.g. rewriting an ambiguous paragraph), the agent should:

1. Read `artifact.htmlPath`, locate the section's opening tag at `sectionLine`.
2. Within that section, find the element matching `anchor.selector` by walking the structure, OR grep `anchor.text` directly.
3. Replace / annotate the matched span.
4. Append a `"claude"`-authored comment to the JSON describing what was changed (so the human sees the trail in the artifact's UI).

## Watcher template — Python

```python
#!/usr/bin/env python3
"""Watcher that adds Claude replies to a companion JSON file."""

import json, time, uuid, sys, pathlib

PATH = pathlib.Path(sys.argv[1])  # e.g. ./rfc-auth-service.comments.json
last_mtime = 0.0
seen = set()

def reply_for(comment, html_path) -> str | None:
    """Return a reply body, or None to skip. Wire your model call here."""
    if comment.get("author") != "user": return None
    if comment.get("addressed"): return None
    if not comment.get("queued"): return None
    if comment["id"] in seen: return None
    seen.add(comment["id"])

    # Locate the anchored text in the source HTML if there's an anchor.
    anchor = comment.get("anchor") or {}
    quoted = anchor.get("text", "")
    line   = anchor.get("sourceLine")
    where  = f"line {line}" if line else f"section {comment.get('sectionHeading', '?')}"
    # ↓ replace with a real Claude API call:
    #    "Reviewer asked '{body}' about '{quoted}' at {where} in {html_path}."
    return f"(claude) Will address '{comment.get('body', '')[:80]}' at {where}."

while True:
    if PATH.exists():
        mtime = PATH.stat().st_mtime
        if mtime > last_mtime:
            last_mtime = mtime
            state = json.loads(PATH.read_text())
            html_path = pathlib.Path(state.get("artifact", {}).get("htmlPath", ""))
            mutated = False
            for c in list(state["comments"].values()):
                body = reply_for(c, html_path)
                if not body: continue
                new_id = f"c_{int(time.time()*1000):x}_{uuid.uuid4().hex[:5]}"
                state["comments"][new_id] = {
                    "id": new_id,
                    "sectionId": c["sectionId"],
                    "sev": "good",
                    "title": "",
                    "body": body,
                    "queued": False,
                    "addressed": False,
                    "ts": int(time.time() * 1000),
                    "author": "claude",
                    "replyTo": c["id"],
                }
                mutated = True
            if mutated:
                state["savedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                PATH.write_text(json.dumps(state, indent=2))
                # bump last_mtime so we don't immediately re-process our own write
                last_mtime = PATH.stat().st_mtime
    time.sleep(2)
```

## Watcher template — Claude Code (one-shot)

```bash
# Read every queued user comment, ask Claude for a reply, write back.
claude <<EOF
Read /path/to/<slug>.comments.json. For each comment where author=="user",
queued==true, and addressed==false, generate a one-paragraph reply.

Append each reply as a NEW entry in comments[] with:
  id: c_<unix-ms-hex>_<5-char-random>
  ts: current unix ms
  author: "claude"
  replyTo: <id of the comment you're replying to>
  sectionId: <copy from the source comment>
  sev: "good"
  body: <your reply>

Preserve all existing entries. Bump savedAt to the current ISO timestamp.
Write the file back.
EOF
```

## Browser support

| Capability | Chromium | Safari | Firefox |
|---|---|---|---|
| `showSaveFilePicker` + live sync | ✅ | ❌ | ❌ |
| One-shot save (Blob download) | ✅ | ✅ | ✅ |
| Persisting the file handle across reloads (IndexedDB) | ✅ | n/a | n/a |
| `showOpenFilePicker` import | ✅ | ❌ (uses `<input type="file">` fallback) | ❌ (fallback) |

For Safari/Firefox the **Link .json** button silently triggers a one-shot download, and **Load…** falls back to `<input type="file">`. Live agent monitoring requires a Chromium-based browser. Open the artifact in Chrome/Edge/Brave/Arc when the watcher loop matters.

## When to use this

- ✅ Long-running reviews where Claude periodically surfaces follow-ups.
- ✅ Pair-review sessions where one person is in the artifact and another is in a terminal.
- ✅ Persisting state on a machine you don't trust the browser to keep (cleared localStorage, profile switch).
- ❌ Quick artifacts that ship in a single sitting — `localStorage` alone is enough; no need to pick a file.

## Privacy note

The companion file is plain JSON on disk. If the artifact's annotations could contain sensitive content, treat the companion file with the same care as the source document — `.gitignore` it unless intentionally committing review state.
