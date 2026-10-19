"""Render the research notes and test plans as linked HTML pages in research/view/.

    python3 research/render.py

Each Markdown doc goes through pandoc, then build.mjs wraps it in the shell
component, so the pages share the artifact look and dark mode. The test-plan
page is generated from the test files, eval cases and bench graders on disk.
"""

import re
import subprocess
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIEW = ROOT / "research" / "view"
BUILD = ROOT / "plugins/html-artifact/skills/html-artifact/scripts/build.mjs"

PAGES = [
    ("competitors", "Competitor survey", ROOT / "research/competitors.md"),
    ("feature-list", "Feature list", ROOT / "research/feature-list.md"),
    ("plan", "Implementation plan", ROOT / "research/plan-v2.md"),
    ("bench", "Bench: the test set", ROOT / "bench/README.md"),
    ("tests", "Test plans", None),
]

NAV = " · ".join(
    [f'<a href="../proposal_html-artifact-v2.html">Pick features</a>']
    + [f'<a href="{slug}.html">{escape(title)}</a>' for slug, title, _ in PAGES]
    + ['<a href="../../bench/runs/out/index.html">Bench comparison</a>']
)


def tests_markdown() -> str:
    """List every unit test, skill eval case and bench grader, linking to its source."""
    out = ["# Test plans", ""]
    out += ["## Component unit tests", "",
            "These run with `node --test plugins/html-artifact/tests/*.test.mjs`. They build fixture pages and check them in headless Chrome.", ""]
    for f in sorted((ROOT / "plugins/html-artifact/tests").glob("*.test.mjs")):
        names = re.findall(r"^test\('([^']+)'", f.read_text(), re.M)
        out += [f"### [{f.name}](../../plugins/html-artifact/tests/{f.name})", ""] + [f"- {n}" for n in names] + [""]
    out += ["## Skill trigger evals", "",
            "These run with `claude plugin eval plugins/html-artifact`. They are drafted but not yet run.", ""]
    for case in sorted((ROOT / "plugins/html-artifact/evals").glob("*/*/prompt.md")):
        desc = re.search(r"^description: (.+)$", case.read_text(), re.M)
        graders = sorted(g.stem for g in (case.parent / "graders").glob("*.md"))
        rel = case.relative_to(ROOT)
        out += [f"### [{case.parent.parent.name} / {case.parent.name}](../../{rel})", "",
                desc.group(1) if desc else "", "", f"Graders: {', '.join(graders)}.", ""]
    out += ["## Bench quality graders", "",
            "Every bench case uses these four graders. The case list and briefs stay local because they quote internal data.", ""]
    for g in sorted((ROOT / "bench/graders").glob("*.md")):
        kind = re.search(r"^type: (\w+)", g.read_text(), re.M)
        out += [f"- [{g.stem}](../../bench/graders/{g.name}) ({kind.group(1) if kind else '?'})"]
    out += ["", "The bench also measures each page in headless Chrome with [bench/render.mjs](../../bench/render.mjs).", ""]
    return "\n".join(out)


def render(slug: str, title: str, md: str) -> None:
    md = re.sub(r"^# .*\n", "", md, count=1)
    body = subprocess.run(["pandoc", "-f", "gfm", "-t", "html", "--section-divs"],
                          input=md, capture_output=True, text=True, check=True).stdout
    src = VIEW / f"{slug}.src.html"
    src.write_text(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="components" content="content"><title>{escape(title)}</title></head><body>
<header class="masthead"><p class="eyebrow">html-artifact v2</p><h1>{escape(title)}</h1>
<p class="links">{NAV}</p></header>
<div class="page"><nav class="toc"></nav><main>
{body}
</main></div></body></html>
""")
    subprocess.run(["node", str(BUILD), str(src)], check=True, capture_output=True)
    src.unlink()


if __name__ == "__main__":
    VIEW.mkdir(exist_ok=True)
    for slug, title, path in PAGES:
        render(slug, title, path.read_text() if path else tests_markdown())
        print(VIEW / f"{slug}.html")
