// =============================================================================
// Export renderers — Markdown, Bullets, gh CLI.
// Used by decision-queue.html's drawer. Workflow commands extend by exposing
// `window.__renderFormat(fmtId, queuedComments)` for additional dropdown entries.
//
// All renderers receive an array of "queued" comment entries from __commentStore.
// Each entry has shape:
//   { id, sectionId, sev, title, body, queued, addressed, ts,
//     anchor?: { aid, start, end, text } }   // anchor present iff annotation
// =============================================================================

const SEV_LABEL = (window.SEVERITIES || []).reduce((m, s) => (m[s.id] = s.label, m), {
  gap: "Gap", risk: "Risk", q: "Question", dec: "Decision", nit: "Nit",
  crit: "Concern", high: "High", med: "Medium", low: "Low", good: "Praise", test: "Test"
});

// ---- htmlToMd ---------------------------------------------------------------
// Converts annotation body HTML to Markdown safe for GitHub / Notion paste.
// The paragraph-normalisation pass is the critical step — without it, GitHub
// treats 4-space-indented soft-wrap lines as code blocks and the paste breaks.
function htmlToMd(html) {
  let s = html || "";
  s = s.replace(/<sup class="cite"[^>]*>[\s\S]*?<\/sup>/g, "");
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, (_, c) => {
    const inner = c.replace(/<[^>]+>/g, "")
      .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
      .replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    return "\n```\n" + inner.trim() + "\n```\n";
  });
  s = s.replace(/<div class="suggest">/g, "\n\n> ").replace(/<\/div>/g, "");
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, "`$1`");
  s = s.replace(/<b>([\s\S]*?)<\/b>/g, "**$1**");
  s = s.replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**");
  s = s.replace(/<em>([\s\S]*?)<\/em>/g, "*$1*");
  s = s.replace(/<i>([\s\S]*?)<\/i>/g, "*$1*");
  s = s.replace(/<br\s*\/?>/g, "\n");
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)");
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, "- $1\n");
  s = s.replace(/<\/?(ul|ol)[^>]*>/g, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")
       .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ")
       .replace(/&ldquo;/g,"“").replace(/&rdquo;/g,"”");
  s = s.replace(/\n{3,}/g, "\n\n");
  return paragraphNormalize(s);
}

// Standalone — usable on any HTML-sourced body text bound for Markdown.
function paragraphNormalize(s) {
  const paragraphs = s.split(/\n[ \t]*\n/);
  return paragraphs.map(p => {
    if (/^\s*```/.test(p)) return p.trim();
    if (/^\s*>/.test(p)) {
      const inner = p.replace(/^\s*>\s?/, "").replace(/\n\s*>\s?/g, " ").replace(/\s+/g, " ").trim();
      return "> " + inner;
    }
    if (/^\s*-\s/.test(p)) {
      // list paragraph — preserve line breaks, collapse intra-item whitespace
      return p.split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
    }
    return p.replace(/\s+/g, " ").trim();
  }).filter(p => p.length > 0).join("\n\n").trim();
}

// ---- group helpers ----------------------------------------------------------
function groupBySection(qs) {
  const groups = {}, keys = [];
  qs.sort((a, b) => a.ts - b.ts).forEach(c => {
    const k = c.sectionId || "_unknown";
    if (!(k in groups)) { groups[k] = []; keys.push(k); }
    groups[k].push(c);
  });
  return { groups, keys };
}

function sectionTitle(sectionId) {
  const sec = document.getElementById(sectionId);
  if (!sec) return sectionId;
  const h = sec.querySelector("h2, h3, h1");
  return h ? h.textContent.replace(/\.$/, "").trim() : sectionId;
}

function sectionNum(sectionId) {
  const sec = document.getElementById(sectionId);
  if (!sec) return "";
  const sn = sec.querySelector(".sectnum");
  if (!sn) return "";
  // Pull just the leading number — strip any reviewed label injected later.
  const m = sn.textContent.trim().match(/Section\s+(\S+)/i);
  return m ? m[1] : "";
}

// ---- Markdown — `## Title — review notes` per-section -----------------------
function renderMarkdown(qs) {
  if (!qs.length) return "";
  const { groups, keys } = groupBySection(qs);
  const docTitle = (document.querySelector("h1") || {}).textContent || "Review notes";
  const out = ["## " + docTitle.trim() + " — review notes", ""];
  keys.forEach(secId => {
    const num = sectionNum(secId), title = sectionTitle(secId);
    out.push("### Section " + (num || secId) + " · " + title);
    out.push("");
    groups[secId].forEach(c => {
      const label = (SEV_LABEL[c.sev] || c.sev).toUpperCase();
      const header = c.anchor
        ? "**[" + label + "]** _Annotation_"
        : "**[" + label + "]** " + (c.title || "(no title)");
      out.push(header);
      if (c.anchor && c.anchor.text) out.push("> " + c.anchor.text.replace(/\s+/g, " ").trim());
      if (c.body) out.push("", htmlToMd(c.body));
      out.push("");
    });
  });
  return out.join("\n").trimEnd();
}

// ---- Bullets — Slack-friendly flat list ------------------------------------
function renderBullets(qs) {
  if (!qs.length) return "";
  const { groups, keys } = groupBySection(qs);
  const out = [];
  keys.forEach(secId => {
    const num = sectionNum(secId);
    out.push("*Section " + (num || secId) + "* — " + groups[secId].length + " item" + (groups[secId].length === 1 ? "" : "s"));
    groups[secId].forEach(c => {
      const label = SEV_LABEL[c.sev] || c.sev;
      if (c.anchor && c.anchor.text) {
        const snip = c.anchor.text.length > 70 ? c.anchor.text.slice(0, 67).trim() + "…" : c.anchor.text;
        out.push("  • [" + label + "] \"" + snip + "\"");
      } else {
        out.push("  • [" + label + "] " + (c.title || "(no title)"));
      }
      if (c.body) {
        const oneLine = c.body.replace(/\s+/g, " ").trim();
        if (oneLine) out.push("    ↳ " + (oneLine.length > 120 ? oneLine.slice(0, 117) + "…" : oneLine));
      }
    });
    out.push("");
  });
  return out.join("\n").trim();
}

// ---- gh CLI — ready-to-run shell commands ----------------------------------
// Single-quoted EOF prevents `$`/backtick expansion. Set PR_NUMBER before running.
function renderGhCli(qs) {
  if (!qs.length) return "";
  const out = ["# gh CLI — set PR_NUMBER first:", "# export PR_NUMBER=123", ""];
  qs.forEach(c => {
    const label = (SEV_LABEL[c.sev] || c.sev).toUpperCase();
    const title = c.anchor ? "Annotation" : (c.title || "(no title)");
    const body = [
      "**[" + label + "]** " + title,
      c.anchor ? "\n> " + (c.anchor.text || "").replace(/\s+/g, " ").trim() : "",
      c.body ? "\n" + htmlToMd(c.body) : ""
    ].filter(Boolean).join("\n");
    out.push("gh pr comment $PR_NUMBER --body \"$(cat <<'EOF'");
    out.push(body);
    out.push("EOF");
    out.push(")\"");
    out.push("");
  });
  return out.join("\n").trim();
}
