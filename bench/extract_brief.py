"""Turn an existing HTML artifact into a plain-markdown content brief.

The brief keeps the facts and drops the presentation, so every skill arm
rebuilds the same content from scratch. Review chrome (side nav, drawers,
annotation popovers) is removed, and each inline SVG becomes a one-line
"[Figure]" note that lists its text labels so the numbers survive.
"""

import re
import subprocess
import sys
from html import unescape
from pathlib import Path

CHROME = re.compile(
    r"<(nav|aside)\b.*?</\1>"
    r"|<div[^>]*class=\"[^\"]*(review-(drawer|tray|backdrop)|annot-(helper|popover)|copied-toast)[^\"]*\".*?</div>\s*</div>",
    re.S,
)


def svg_to_note(match: re.Match) -> str:
    svg = match.group(0)
    label = re.search(r'aria-label="([^"]*)"', svg)
    texts = [unescape(re.sub(r"<[^>]+>", "", t)).strip() for t in re.findall(r"<text\b[^>]*>(.*?)</text>", svg, re.S)]
    texts = [t for t in texts if t]
    head = f"[Figure: {label.group(1)}]" if label else "[Figure]"
    return f"<p>{head} Labels: {' | '.join(texts)}</p>" if texts else f"<p>{head}</p>"


def extract(html: str) -> str:
    html = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S)
    html = re.sub(r"<svg\b.*?</svg>", svg_to_note, html, flags=re.S)
    html = CHROME.sub("", html)
    md = subprocess.run(
        ["pandoc", "-f", "html", "-t", "gfm", "--wrap=none"],
        input=html, capture_output=True, text=True, check=True,
    ).stdout
    # Complex tables stay as HTML, so keep table tags and drop every other tag.
    md = re.sub(r"</?(?!(table|thead|tbody|tr|th|td)\b)[a-zA-Z][^>]*>", "", md)
    md = re.sub(r"Review queue\s*\d*|Copied to clipboard", "", md)
    return re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"


if __name__ == "__main__":
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.write_text(extract(src.read_text()))
    print(f"{dst}: {dst.stat().st_size} bytes")
