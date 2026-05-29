#!/usr/bin/env python3
"""
install_inactivity_popup.py

Two idempotent edits applied to the LIVE /qualify/ funnel + thank-you pages:

  1. Inject  <script src="/qualify/popup.js"></script>  immediately before the
     closing </body> tag (the "Before you go..." inactivity popup).
  2. Convert the funnel/landing/thank-you tel: links to E.164 (add the +1):
        tel:18138204157  ->  tel:+18138204157   (funnel + landing)
        tel:18138204158  ->  tel:+18138204158   (thank-you)
     Display text — e.g. "(813) 820-4157" — is left untouched; only the
     href value changes.

Scope is an explicit 6-file list: the live /qualify/2/ funnel (landing + 4
steps) and /qualify/thank-you/. The legacy /qualify/ root, the /qualify/3/
variant, and /qualify/_archive/ are intentionally NOT touched (mirrors the
NBA funnel, which excludes its redirected legacy funnel from the popup).

Idempotent: re-running is a no-op. The popup tag is only added when absent,
and the tel replacement does not match an href that already carries the '+'.

Follows the existing scripts/install_gtm.py / replace_phone_numbers.py pattern.
Run from the repo root:  python3 scripts/install_inactivity_popup.py
"""

import os

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LIVE_PAGES = [
    "qualify/2/index.html",
    "qualify/2/step-1-dob-citizen.html",
    "qualify/2/step-2-address.html",
    "qualify/2/step-3-income-employ.html",
    "qualify/2/step-4-contact.html",
    "qualify/thank-you/index.html",
]

POPUP_TAG = (
    '<!-- Inactivity popup ("Before you go...") — dedicated call line -->\n'
    '<script src="/qualify/popup.js"></script>\n'
)

# tel: hrefs to upgrade to E.164. Order matters only for reporting; the two
# values never overlap. Replacing the no-+ form is safe because the +form
# ("tel:+1...") does not contain the no-+ substring ("tel:1...").
TEL_FIXES = [
    ("tel:18138204157", "tel:+18138204157"),
    ("tel:18138204158", "tel:+18138204158"),
]


def process(path):
    full = os.path.join(REPO_ROOT, path)
    with open(full, "r", encoding="utf-8") as fh:
        text = fh.read()
    original = text
    notes = []

    # 1. Inject the popup script tag before the last </body>, if not present.
    if "/qualify/popup.js" in text:
        notes.append("popup: already present")
    else:
        idx = text.rfind("</body>")
        if idx == -1:
            notes.append("popup: SKIPPED (no </body> found)")
        else:
            text = text[:idx] + POPUP_TAG + text[idx:]
            notes.append("popup: injected")

    # 2. Add +1 to tel: hrefs.
    for old, new in TEL_FIXES:
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            notes.append("tel: {} -> {} ({}x)".format(old, new, n))

    if text != original:
        with open(full, "w", encoding="utf-8") as fh:
            fh.write(text)
        changed = True
    else:
        changed = False

    return changed, notes


def main():
    changed_count = 0
    for path in LIVE_PAGES:
        changed, notes = process(path)
        changed_count += 1 if changed else 0
        flag = "CHANGED" if changed else "no-op  "
        print("[{}] {}".format(flag, path))
        for note in notes:
            print("          - {}".format(note))
    print("\n{} of {} files changed.".format(changed_count, len(LIVE_PAGES)))


if __name__ == "__main__":
    main()
