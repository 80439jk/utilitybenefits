#!/usr/bin/env python3
"""Install Google Tag Manager container GTM-WRGCMJLR on every HTML page.

Idempotent: files that already contain the container ID are skipped, so the
script can be re-run safely after new pages are added.

Insertion points:
  - <script> snippet: immediately after the opening <head> tag (as high in
    <head> as possible, per GTM install instructions).
  - <noscript> snippet: immediately after the opening <body...> tag,
    preserving any attributes on <body>.

Usage:
    python3 scripts/install_gtm.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

CONTAINER_ID = "GTM-WRGCMJLR"

GTM_HEAD_SNIPPET = """<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WRGCMJLR');</script>
<!-- End Google Tag Manager -->
"""

GTM_BODY_SNIPPET = """<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WRGCMJLR"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
"""

HEAD_OPEN_RE = re.compile(r"(<head\b[^>]*>)", re.IGNORECASE)
BODY_OPEN_RE = re.compile(r"(<body\b[^>]*>)", re.IGNORECASE)

SKIP_DIRS = {".git", "node_modules", ".vercel", ".next", "out", "dist"}


def install_on_file(path: Path) -> str:
    src = path.read_text(encoding="utf-8")

    if CONTAINER_ID in src:
        return "skip"

    head_match = HEAD_OPEN_RE.search(src)
    body_match = BODY_OPEN_RE.search(src)
    if not head_match:
        return "no-head"
    if not body_match:
        return "no-body"

    src = HEAD_OPEN_RE.sub(
        lambda m: m.group(1) + "\n" + GTM_HEAD_SNIPPET, src, count=1
    )
    src = BODY_OPEN_RE.sub(
        lambda m: m.group(1) + "\n" + GTM_BODY_SNIPPET, src, count=1
    )
    path.write_text(src, encoding="utf-8")
    return "ok"


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    counts = {"ok": 0, "skip": 0, "no-head": 0, "no-body": 0}
    problems: list[tuple[str, Path]] = []

    for path in sorted(repo_root.rglob("*.html")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        result = install_on_file(path)
        counts[result] += 1
        if result in ("no-head", "no-body"):
            problems.append((result, path.relative_to(repo_root)))

    print(f"Container: {CONTAINER_ID}")
    print(f"  installed:           {counts['ok']}")
    print(f"  skipped (had GTM):   {counts['skip']}")
    print(f"  missing <head>:      {counts['no-head']}")
    print(f"  missing <body>:      {counts['no-body']}")
    if problems:
        print("\nFiles that need manual review:")
        for kind, rel in problems:
            print(f"  [{kind}] {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
