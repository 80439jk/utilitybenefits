#!/usr/bin/env python3
"""Repoint all main-site CTAs from /qualify/4/ to /qualify/0/ (10DLC compliance).

Carriers reviewing a 10DLC campaign follow the public site to the form that
collects the phone number. That form must show the consent language behind a
real checkbox, so the main site points at /qualify/0/ -- a clone of the
/qualify/4/ chain with a genuine consent checkbox.

Scope: HTML files OUTSIDE the /qualify/ tree. Pages inside /qualify/ are
left alone -- they contain the funnels' own internal navigation and
self-references (a "Back" link on /qualify/4/step-1-dob/ must still return
to /qualify/4/, and each funnel loads its own _funnel.css).

Replacements:
  - href="/qualify/4/"          -> href="/qualify/0/"
  - href="/qualify/4/?<query>"  -> href="/qualify/0/?<query>"   (?vertical= hub CTAs)

Idempotent: re-running is safe (no /qualify/4/ links remain outside the tree
after the first run).

Usage:
    python3 scripts/redirect_cta_to_qualify0.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", ".vercel", ".next", "out", "dist"}
EXCLUDED_TREE = "qualify"  # files under this top-level dir are skipped

PLAIN_RE = re.compile(r'href="/qualify/4/"')
QUERY_RE = re.compile(r'href="/qualify/4/\?')


def update_file(path: Path) -> int:
    src = path.read_text(encoding="utf-8")
    new_src, n_plain = PLAIN_RE.subn('href="/qualify/0/"', src)
    new_src, n_query = QUERY_RE.subn('href="/qualify/0/?', new_src)
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
