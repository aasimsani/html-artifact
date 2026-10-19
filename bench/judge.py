"""Judge each case's pages from screenshots, blind, with Claude.

    python3 judge.py [--arms baseline,ours,v2,dogum,flabs] [--runs 2]

For every case, the arms' desktop first-screen and phone screenshots are shuffled under
letters and shown to `claude -p`. It scores each page 1-10 on how fast a reader gets the
point, visual quality, and phone layout. Results go to runs/out/judge.json, and a per-arm
summary prints at the end. Screenshots come from render.mjs (runs/out/shots/).
"""

import argparse
import json
import random
import string
import subprocess
from pathlib import Path

OUT = Path(__file__).parent / "runs" / "out"
SHOTS = OUT / "shots"

PROMPT = """You are judging review documents rendered as web pages. Each letter below is one page about the same subject, made by a different tool. Use the Read tool to look at every image before you score.

{listing}

Score every letter from 1 to 10 on three criteria:
- understand: within ten seconds of the first screen, how well does a reader grasp the key point and what to do?
- visual: hierarchy, restraint, and whether the layout fits the content (tables, timelines and diagrams where they help; no decoration).
- phone: is the phone screenshot readable and well laid out?

Be strict and use the whole scale. Reply with only a JSON object, no prose, in this shape:
{{"A": {{"understand": 7, "visual": 6, "phone": 8, "note": "one short reason"}}, ...}}"""


def judge_case(case: str, arms: list[str], seed: int) -> dict:
    present = [a for a in arms if (SHOTS / f"{case}__{a}-desktop.png").exists()]
    rng = random.Random(seed)
    order = present[:]
    rng.shuffle(order)
    letters = dict(zip(string.ascii_uppercase, order))
    listing = "\n".join(
        f"{L}: first screen {SHOTS / f'{case}__{a}-desktop.png'} ; phone {SHOTS / f'{case}__{a}-phone.png'}"
        for L, a in letters.items()
    )
    res = subprocess.run(
        ["claude", "-p", PROMPT.format(listing=listing), "--allowedTools", "Read", "--output-format", "json"],
        capture_output=True, text=True, timeout=900,
    )
    text = json.loads(res.stdout)["result"]
    scores = json.loads(text[text.index("{"): text.rindex("}") + 1])
    return {letters[L]: v for L, v in scores.items() if L in letters}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arms", default="baseline,ours,v2,v21,dogum,flabs")
    ap.add_argument("--runs", type=int, default=2)
    args = ap.parse_args()
    arms = args.arms.split(",")
    meta = json.loads((OUT / "meta.json").read_text())
    results = {}
    for case in sorted(meta):
        results[case] = [judge_case(case, arms, seed) for seed in range(args.runs)]
        print(case, json.dumps({a: [r.get(a, {}).get("understand") for r in results[case]] for a in arms}))
    (OUT / "judge.json").write_text(json.dumps(results, indent=2))

    print("\narm        understand  visual  phone   (mean over cases and judge runs)")
    for a in arms:
        vals = [r[a] for runs in results.values() for r in runs if a in r]
        if not vals:
            continue
        m = lambda k: sum(v[k] for v in vals) / len(vals)
        print(f"{a:10} {m('understand'):10.1f} {m('visual'):7.1f} {m('phone'):6.1f}   n={len(vals)}")


if __name__ == "__main__":
    main()
