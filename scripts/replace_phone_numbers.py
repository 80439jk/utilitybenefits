#!/usr/bin/env python3
"""Replace placeholder phone numbers across the site with live numbers.

Region mapping (by file path):
  - qualify/thank-you/**           -> 1-813-820-4158  (post-conversion warm transfer)
  - qualify/** (excluding above)   -> 1-813-820-4157  (funnel CTA)
  - everything else                -> 1-800-780-9218  (main site)

Placeholders replaced:
  - tel:18335550143, tel:9999999999, tel:18005551234
  - 1-833-555-0143, 833-555-0143
  - (999) 999-9999, (800) 555-1234

Display format is normalized to (AAA) PPP-LLLL everywhere. Any existing
dashed-form live numbers (e.g. 1-813-820-4157) are converted to the
paren form (e.g. (813) 820-4157).

Idempotent: re-running after new pages are added is safe.

Usage:
    python3 scripts/replace_phone_numbers.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", ".vercel", ".next", "out", "dist"}

PLACEHOLDER_TELS = ("18335550143", "9999999999", "18005551234")

DASHED_RE = re.compile(r"\b1-833-555-0143\b")
DASHED_NO_LEAD_RE = re.compile(r"(?<!\d)833-555-0143\b")
PAREN_999_RE = re.compile(r"\(999\)\s*999-9999")
PAREN_800_RE = re.compile(r"\(800\)\s*555-1234")


def region_for(rel: Path) -> str:
    parts = rel.parts
    if len(parts) >= 2 and parts[0] == "qualify" and parts[1] == "thank-you":
        return "thank_you"
    if parts and parts[0] == "qualify":
        return "funnel"
    return "main"


TARGETS = {
    "thank_you": {
        "tel": "18138204158",
        "paren": "(813) 820-4158",
    },
    "funnel": {
        "tel": "18138204157",
        "paren": "(813) 820-4157",
    },
    "main": {
        "tel": "18007809218",
        "paren": "(800) 780-9218",
    },
}

LIVE_DASHED_LEAD_RES = [
    (re.compile(r"\b1-813-820-4158\b"), "(813) 820-4158"),
    (re.compile(r"\b1-813-820-4157\b"), "(813) 820-4157"),
    (re.compile(r"\b1-800-780-9218\b"), "(800) 780-9218"),
]


def replace_in_text(text: str, region: str) -> tuple[str, int]:
    t = TARGETS[region]
    changes = 0

    for ph in PLACEHOLDER_TELS:
        new_src, n = re.subn(rf"tel:{ph}\b", f"tel:{t['tel']}", text)
        text = new_src
        changes += n

    new_src, n = DASHED_RE.subn(t["paren"], text)
    text = new_src
    changes += n

    new_src, n = DASHED_NO_LEAD_RE.subn(t["paren"], text)
    text = new_src
    changes += n

    new_src, n = PAREN_999_RE.subn(t["paren"], text)
    text = new_src
    changes += n

    new_src, n = PAREN_800_RE.subn(t["paren"], text)
    text = new_src
    changes += n

    for rx, repl in LIVE_DASHED_LEAD_RES:
        new_src, n = rx.subn(repl, text)
        text = new_src
        changes += n

    return text, changes


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    by_region = {"thank_you": 0, "funnel": 0, "main": 0}
    files_changed = 0
    files_total = 0

    for path in sorted(repo_root.rglob("*.html")):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        files_total += 1
        rel = path.relative_to(repo_root)
        region = region_for(rel)

        src = path.read_text(encoding="utf-8")
        new_src, changes = replace_in_text(src, region)
        if changes:
            path.write_text(new_src, encoding="utf-8")
            files_changed += 1
            by_region[region] += changes

    print(f"Scanned: {files_total} HTML files")
    print(f"Modified: {files_changed} files")
    print(f"Replacements by region:")
    print(f"  thank-you  (-> 1-813-820-4158): {by_region['thank_you']}")
    print(f"  funnel     (-> 1-813-820-4157): {by_region['funnel']}")
    print(f"  main site  (-> 1-800-780-9218): {by_region['main']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
