"""Build runs/out/index.html, a side-by-side comparison of every arm on every case.

    node render.mjs score --shots runs/out/shots runs/out/*/*.html > runs/out/scores.jsonl
    python3 report.py

It reads runs/out/meta.json (from collect.py) and runs/out/scores.jsonl (from
render.mjs). The page links to the shots and HTML files beside it, so open it
from disk.
"""

import json
from html import escape
from pathlib import Path

OUT = Path(__file__).parent / "runs" / "out"
ARMS = ["original", "baseline", "ours", "v2", "dogum", "flabs"]
GRADERS = ["fidelity", "design", "reviewable", "offline", "grounded", "review-shape"]


def checks(s: dict) -> dict[str, bool]:
    r = s["review"]
    return {
        "no errors": not s["errors"],
        "dark mode": s["hasDarkMode"],
        "fits 400px": s["phoneOverflowPx"] == 0,
        "paints w/o JS": s["noJsTextRatio"] >= 0.9,
        "select→annotate": r["selectionHelper"],
        "section ✓": r["sectionCheckboxes"] > 0,
        "export": r["exportButton"],
        "agent round-trip": r["roundTrip"],
    }


def pct(xs: list) -> str:
    return f"{round(100 * sum(float(x) for x in xs) / len(xs))}%" if xs else "–"


def mean(xs: list[float]) -> str:
    return f"{sum(xs) / len(xs):.1f}" if xs else "–"


def main() -> None:
    meta = json.loads((OUT / "meta.json").read_text())
    scores = {}
    for line in (OUT / "scores.jsonl").read_text().splitlines():
        s = json.loads(line)
        case, arm = s["file"].split("/")
        scores[(case, arm)] = s

    # One summary row per arm, averaged over cases.
    summary = []
    for arm in ARMS:
        rows = [scores[(c, arm)] for c in meta if (c, arm) in scores]
        runs = [meta[c][arm] for c in meta if arm in meta[c]]
        cells = {k: pct([checks(s)[k] for s in rows]) for k in (checks(rows[0]) if rows else {})}
        grader_cells = {g: pct([r["graders"][g] for r in runs if g in r["graders"]]) for g in GRADERS} if runs else {}
        summary.append((arm, len(rows), grader_cells, cells,
                        mean([r["costUsd"] for r in runs]), mean([r["seconds"] for r in runs]),
                        mean([r["turns"] for r in runs]), mean([(r.get("outTokens") or 0) / 1000 for r in runs]), mean([s["bytes"] / 1024 for s in rows])))

    check_names = list(checks(next(iter(scores.values()))).keys())
    head = "".join(f"<th>{escape(h)}</th>" for h in
                   ["arm", "n", *GRADERS, *check_names, "$/run", "sec", "turns", "out k-tok", "KB"])
    body = ""
    for arm, n, g, c, cost, sec, turns, ktok, kb in summary:
        body += f"<tr><th>{arm}</th><td>{n}</td>" + "".join(f"<td>{g.get(x, '–')}</td>" for x in GRADERS)
        body += "".join(f"<td>{c.get(x, '–')}</td>" for x in check_names)
        body += f"<td>{cost}</td><td>{sec}</td><td>{turns}</td><td>{ktok}</td><td>{kb}</td></tr>"

    cases_html = ""
    for case in sorted(meta):
        cols = ""
        for arm in ARMS:
            s = scores.get((case, arm))
            if not s:
                cols += f'<div class="cell missing"><h4>{arm}</h4><p>no output</p></div>'
                continue
            m = meta[case].get(arm, {})
            stem = f"shots/{case}__{arm}"
            verdicts = "".join(
                f'<span class="v {"ok" if ok >= 0.5 else "bad"}">{g}{f" {round(ok * 100)}%" if 0 < ok < 1 else ""}</span>' for g, ok in sorted(m["graders"].items())
            ) if m else '<span class="v">reference</span>'
            flags = "".join(f'<span class="v {"ok" if v else "bad"}">{escape(k)}</span>' for k, v in checks(s).items())
            stats = f'{m["costUsd"]}$ · {m["seconds"]}s · {m["turns"]} turns · {(m.get("outTokens") or 0) // 1000}k out-tok · ' if m else ""
            page = f"{case}/{arm}.html"
            cols += f"""<div class="cell"><h4><a href="{page}" target="_blank">{arm}</a></h4>
<a href="{page}" target="_blank" title="Open the full {arm} page"><img loading="lazy" src="{stem}-desktop.png" alt="{arm} desktop"></a>
<div class="pair"><a href="{page}" target="_blank"><img loading="lazy" src="{stem}-dark.png" alt="{arm} dark"></a>
<a href="{page}" target="_blank"><img loading="lazy" src="{stem}-phone.png" alt="{arm} phone"></a></div>
<a class="open" href="{page}" target="_blank">Open full page ↗</a>
<p class="stats">{stats}{s["bytes"] // 1024} KB</p><div class="vs">{verdicts}</div><div class="vs">{flags}</div></div>"""
        quick = " · ".join(f'<a href="{case}/{a}.html" target="_blank">{a}</a>' for a in ARMS if (case, a) in scores)
        quick += f' · <a href="../../corpus/{case}/brief.md" target="_blank">brief</a>'
        cases_html += f'<section id="{case}"><h2>{escape(case)}</h2><p class="quick">Open: {quick}</p><div class="grid">{cols}</div></section>'

    (OUT / "index.html").write_text(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Artifact bench</title>
<style>
:root {{ --bg:#fafaf7; --ink:#1e1d1a; --ink-2:#6b675d; --rule:#e2e0d6; --ok:#166534; --ok-bg:#e3f1e6; --bad:#b91c1c; --bad-bg:#fbecec; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141412; --ink:#ecebe6; --ink-2:#a19d92; --rule:#2e2d29; --ok:#7bd88f; --ok-bg:#16301d; --bad:#f19999; --bad-bg:#3a1a1a; }} }}
body {{ background:var(--bg); color:var(--ink); font:14px/1.45 -apple-system, system-ui, sans-serif; margin:0 auto; padding:24px 16px; max-width:1600px; }}
h1 {{ font:500 30px/1.1 Georgia, serif; margin:0 0 6px; }} h2 {{ font:500 20px Georgia, serif; margin:36px 0 10px; }}
h4 {{ margin:0 0 6px; font-size:13px; }} a {{ color:inherit; }}
.wrap {{ overflow-x:auto; }} table {{ border-collapse:collapse; font-size:12.5px; }}
th, td {{ border-bottom:1px solid var(--rule); padding:5px 8px; text-align:left; white-space:nowrap; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; }}
.cell img {{ width:100%; border:1px solid var(--rule); display:block; }}
.pair {{ display:grid; grid-template-columns:2fr 1fr; gap:4px; margin-top:4px; }} .pair img {{ height:120px; object-fit:cover; object-position:top; }}
.stats {{ color:var(--ink-2); margin:6px 0; font-size:12px; }}
.vs {{ display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }}
.v {{ font:11px ui-monospace, monospace; padding:1px 5px; border-radius:3px; border:1px solid var(--rule); }}
.v.ok {{ color:var(--ok); background:var(--ok-bg); border-color:transparent; }} .v.bad {{ color:var(--bad); background:var(--bad-bg); border-color:transparent; }}
.missing {{ color:var(--ink-2); }}
.open {{ display:inline-block; margin-top:8px; font-weight:600; font-size:13px; color:#4338ca; }}
@media (prefers-color-scheme: dark) {{ .open {{ color:#a5b4fc; }} }}
.quick {{ margin:-4px 0 12px; font-size:13px; color:var(--ink-2); }} .quick a {{ font-weight:600; }}
.index {{ columns:2 280px; font-size:13px; margin:12px 0 0; padding-left:18px; }}
</style></head><body>
<h1>Artifact bench</h1>
<p>Each case rebuilds one existing Taxwire artifact from a facts-only brief. Graders are LLM judges (fidelity, design, reviewable) and a regex (offline). The remaining columns come from headless Chrome. "original" is the existing artifact, which went through no eval run.</p>
<p>Every screenshot opens the full page. Each case also has an "Open" row with direct links to every arm's page and to the brief it was built from.</p>
<ol class="index">{"".join(f'<li><a href="#{c}">{escape(c)}</a></li>' for c in sorted(meta))}</ol>
<div class="wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>
{cases_html}
</body></html>""")
    print(OUT / "index.html")


if __name__ == "__main__":
    main()
