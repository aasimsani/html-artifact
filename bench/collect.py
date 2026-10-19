"""Copy each eval run's HTML out of its kept temp dir and record its run stats.

    python3 collect.py runs/results/ours.json runs/results/dogum.json ...

The arm name is the result file's stem. A `without` arm (the no-plugin
ablation) is recorded as `baseline`. Outputs land in runs/out/<case>/<arm>.html,
next to a copy of the original artifact, and run stats go to runs/out/meta.json.
"""

import json
import re
import shutil
import sys
from pathlib import Path

BENCH = Path(__file__).parent
OUT = BENCH / "runs" / "out"


def main(result_files: list[str]) -> None:
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    for rf in map(Path, result_files):
        result = json.loads(rf.read_text())
        for case in result["cases"]:
            name = case["name"]
            dest = OUT / name
            dest.mkdir(parents=True, exist_ok=True)
            original = BENCH / "corpus" / name / "original.html"
            if original.exists():
                shutil.copy(original, dest / "original.html")
            for arm_key, runs in case["arms"].items():
                arm = rf.stem.removeprefix("cr-") if arm_key == "with" else "baseline"
                # Several runs per case are averaged; the first run that wrote a page supplies the HTML.
                found = False
                for run in runs:
                    trace = Path(run.get("tracePath") or "/nonexistent/out/trace.jsonl")
                    kept = trace.parent.parent
                    if (kept / "sealed").exists():
                        kept.chmod(0o700)
                        (kept / "sealed").chmod(0o700)
                    html = kept / "sealed" / "home" / "cwd" / f"{name}.html"
                    if html.exists() and not found:
                        shutil.copy(html, dest / f"{arm}.html")
                        found = True
                mean = lambda xs: round(sum(xs) / len(xs), 2) if xs else None
                tokens = lambda r: sum(map(int, re.findall(r'"output_tokens"\s*:\s*(\d+)', Path(r["tracePath"]).read_text()))) if r.get("tracePath") and Path(r["tracePath"]).exists() else 0
                names = sorted({g["name"] for r in runs for g in r.get("graders", [])})
                meta.setdefault(name, {})[arm] = {
                    "found": found,
                    "runs": len(runs),
                    "score": mean([r.get("score") or 0 for r in runs]),
                    "graders": {g: mean([float(next((x["passed"] for x in r.get("graders", []) if x["name"] == g), False)) for r in runs]) for g in names},
                    "costUsd": mean([r.get("costUsd") or 0 for r in runs]),
                    "seconds": mean([r.get("durationSeconds") or 0 for r in runs]),
                    "turns": mean([r.get("turns") or 0 for r in runs]),
                    "outTokens": mean([tokens(r) for r in runs]),
                    "error": next((r.get("error") for r in runs if r.get("error")), None),
                }
                run = runs[0]
                print(f"{name:40} {arm:9} found={found} score={run.get('score')}")
    meta_path.write_text(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
