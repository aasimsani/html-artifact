// =============================================================================
// Regex-based syntax highlighter — ~65 LoC, inline, no CDN.
// Tuned for Python; KEYWORDS/BUILTINS lists are easy to extend.
// Token precedence (top wins): comment → string → decorator → keyword → builtin → number → CamelCase type.
//
// CSS classes (.hl-k, .hl-s, etc.) live in design-system.css extension block.
// Add this <style> alongside the canonical palette:
//
//   .hl-k { color: #6d28d9; font-weight: 500; }     /* keyword */
//   .hl-s { color: #047857; }                       /* string */
//   .hl-c { color: #807c70; font-style: italic; }   /* comment */
//   .hl-b { color: #0e7490; }                       /* builtin */
//   .hl-n { color: #b45309; }                       /* number */
//   .hl-d { color: #be185d; font-weight: 500; }     /* decorator */
//   .hl-t { color: #1e40af; }                       /* CamelCase type */
//   /* mute on deletion rows so diff bg stays dominant */
//   .diff-line.del .hl-k, .diff-line.del .hl-s, .diff-line.del .hl-b,
//   .diff-line.del .hl-t, .diff-line.del .hl-n, .diff-line.del .hl-d { opacity: 0.85; }
// =============================================================================

(function () {
  const KEYWORDS = [
    "async","await","def","class","return","raise","if","elif","else","for","while",
    "try","except","finally","with","from","import","in","not","and","or","None",
    "True","False","lambda","yield","pass","break","continue","as","is","self","cls",
    "global","nonlocal","del","assert",
    // SQL — uppercase forms common in mixed-language artifacts
    "SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","GROUP","BY",
    "ORDER","HAVING","LIMIT","INSERT","UPDATE","DELETE","SET","VALUES","INTO","AS",
    "IS","NULL","COUNT"
  ];
  const BUILTINS = [
    "str","int","bool","list","dict","set","tuple","float","bytes","bytearray",
    "len","range","isinstance","sum","type","hasattr","getattr","setattr","repr",
    "print","object","Exception","ValueError","TypeError","RuntimeError",
    "AssertionError","KeyError","IndexError","AttributeError","NotImplementedError",
    "Optional","Literal","Annotated","ClassVar","Any","Callable","Awaitable","Protocol",
    "Decimal","datetime","timedelta","date","time"
  ];
  function escapeHTML(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  const MASTER = new RegExp(
      "(#[^\\n]*|--[^\\n]*|//[^\\n]*)"                                                // 1 comment (#, --, //)
    + "|([fFrRbB]{0,2}\"(?:[^\"\\\\]|\\\\.)*\"|[fFrRbB]{0,2}'(?:[^'\\\\]|\\\\.)*')"   // 2 string
    + "|(@[A-Za-z_][\\w.]*)"                                                          // 3 decorator
    + "|\\b(" + KEYWORDS.join("|") + ")\\b"                                           // 4 keyword
    + "|\\b(" + BUILTINS.join("|") + ")\\b"                                           // 5 builtin
    + "|(\\b\\d+(?:\\.\\d+)?\\b)"                                                     // 6 number
    + "|(\\b[A-Z][A-Za-z0-9_]*\\b)",                                                  // 7 CamelCase type
    "g"
  );
  function highlight(text) {
    let out = "", last = 0, m;
    MASTER.lastIndex = 0;
    while ((m = MASTER.exec(text)) !== null) {
      if (m.index > last) out += escapeHTML(text.slice(last, m.index));
      if      (m[1] !== undefined) out += '<span class="hl-c">' + escapeHTML(m[1]) + "</span>";
      else if (m[2] !== undefined) out += '<span class="hl-s">' + escapeHTML(m[2]) + "</span>";
      else if (m[3] !== undefined) out += '<span class="hl-d">' + escapeHTML(m[3]) + "</span>";
      else if (m[4] !== undefined) out += '<span class="hl-k">' + m[4] + "</span>";
      else if (m[5] !== undefined) out += '<span class="hl-b">' + m[5] + "</span>";
      else if (m[6] !== undefined) out += '<span class="hl-n">' + m[6] + "</span>";
      else if (m[7] !== undefined) out += '<span class="hl-t">' + m[7] + "</span>";
      last = m.index + m[0].length;
    }
    if (last < text.length) out += escapeHTML(text.slice(last));
    return out;
  }
  // Run on DOMContentLoaded against any `pre.code` block + diff bodies.
  // Read textContent (entities already decoded), write innerHTML.
  function apply() {
    document.querySelectorAll("pre.code, code.code").forEach(el => {
      el.innerHTML = highlight(el.textContent);
    });
    document.querySelectorAll(".diff-line:not(.hunk) .src").forEach(el => {
      el.innerHTML = highlight(el.textContent);
    });
    document.querySelectorAll(".fdiff-line:not(.hunk):not(.meta) .src").forEach(el => {
      el.innerHTML = highlight(el.textContent);
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  // Expose for re-runs after dynamic content (e.g. after annotation render).
  window.__highlight = highlight;
})();
