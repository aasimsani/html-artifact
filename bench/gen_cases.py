"""Generate `claude plugin eval` cases from the corpus.

Each corpus entry holds `brief.md` (facts extracted from an existing artifact)
and an entry in `corpus/cases.json` (the request and its key facts). The brief
is inlined into the prompt, so no fixture files are needed. The cases land in
`runs/evals/`, which stays out of git because the briefs quote internal data.
"""

import json
import shutil
from pathlib import Path

BENCH = Path(__file__).parent
CORPUS = BENCH / "corpus"
OUT = BENCH / "runs" / "evals"

PROMPT = """---
description: Rebuild the {slug} artifact from its content brief.
tags: [bench, {kind}]
max_turns: 30
timeout_seconds: 900
runs: 1
allowed_tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]
---

{ask} Save it as {out} in the current directory. Every fact you need is in the brief below; do not research anything else.

<brief>
{brief}
</brief>
"""


def main() -> None:
    cases = json.loads((CORPUS / "cases.json").read_text())
    shutil.rmtree(OUT, ignore_errors=True)
    for slug, case in cases.items():
        out = f"{slug}.html"
        case_dir = OUT / slug
        (case_dir / "graders").mkdir(parents=True)
        brief = (CORPUS / slug / "brief.md").read_text()
        (case_dir / "prompt.md").write_text(
            PROMPT.format(slug=slug, kind=slug.split("_")[0], ask=case["ask"], out=out, brief=brief)
        )
        facts = "\n".join(f"- {f}" for f in case["facts"])
        # Shared graders apply to every case, minus any the case skips. Case-specific graders come from corpus/<slug>/graders/.
        graders = [g for g in (BENCH / "graders").glob("*.md") if g.stem not in case.get("skip_graders", [])]
        graders += list((CORPUS / slug / "graders").glob("*.md"))
        for grader in graders:
            text = grader.read_text().replace("{{OUT}}", out).replace("{{FACTS}}", facts)
            (case_dir / "graders" / grader.name).write_text(text)
        print(case_dir.relative_to(BENCH))


if __name__ == "__main__":
    main()
