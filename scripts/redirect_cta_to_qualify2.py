#!/usr/bin/env python3
"""Redirect all main-site CTAs from /qualify/ (inactive v1 funnel) to /qualify/2/.

Scope: HTML files OUTSIDE the /qualify/ tree. Pages inside /qualify/ are
left alone -- they contain the funnels' own internal navigation,
breadcrumbs, and self-references.

Replacements:
  - href="/qualify/"          -> href="/qualify/2/"
  - href="/qualify/?<query>"  -> href="/qualify/2/?<query>"

Idempotent: re-running is safe (no /qualify/ links remain after first run).

Usage:
    python3 scripts/redirect_cta_to_qualify2.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", ".vercel", ".next", "out", "dist"}
EXCLUDED_TREE = "qualify"  # files under this top-level dir are skipped

PLAIN_RE = re.compile(r'href="/qualify/"')
QUERY_RE = re.compile(r'href="/qualify/\?')


def update_file(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    new_src, n_plain = PLAIN_RE.subn('href="/qualify/2/"', src)
    new_src, n_query = QUERY_RE.subn('href="/qualify/2/?', new_src)
    total = n_plain + n_query
    if total:
        path.write_text(new_src, encoding="utf-8")
    return total


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    files_changed = 0
    total_changes = 0

    for path in sorted(repo_root.rglob("*.html")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        rel = path.relative_to(repo_root)
        if rel.parts and rel.parts[0] == EXCLUDED_TREE:
            continue
        n = update_file(path)
        if n:
            files_changed += 1
            total_changes += n

    print(f"Files modified: {files_changed}")
    print(f"Total href rewrites: {total_changes}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
