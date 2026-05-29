# Archived: /qualify/2/ — classic version (pre-CRO)

**Retired:** 2026-05-29
**Replaced by:** the CRO-overhauled `/qualify/2/` (cro-audit branch merge)
**Git tag of byte-identical pre-merge HEAD:** `funnel/qualify-2-classic`

## What this is

A snapshot of the production `/qualify/2/` funnel as it stood on 2026-05-29, just before the CRO overhaul merge. Kept here as a browsable reference and a quick-revert path.

## How it differs from byte-identical

The HTML files have their internal paths rewritten so the archive functions as a self-contained funnel:

| Original path | Rewritten to |
|---|---|
| `/qualify/2/_funnel.css` | `/qualify/_archive/qualify-2-2026-05-29/_funnel.css` |
| `/qualify/2/_attribution.js` | `/qualify/_archive/qualify-2-2026-05-29/_attribution.js` |
| `/qualify/2/step-*/` | `/qualify/_archive/qualify-2-2026-05-29/step-*/` |
| `/qualify/2/` (back links) | `/qualify/_archive/qualify-2-2026-05-29/` |

The step 4 form action (`/api/lead/`) is **unchanged** — submitting the archived form posts a real lead. The archive is `noindex,nofollow` and only reachable by direct URL, so this is internal-only behavior.

For a truly byte-identical copy, check out the Git tag:
```
git checkout funnel/qualify-2-classic -- qualify/2/
```

## Reverting to this version

Two options:

**Fast (no git):**
```
cp -r qualify/_archive/qualify-2-2026-05-29/* qualify/2/
# then run a sed to reverse the path rewrites:
sed -i '' 's|/qualify/_archive/qualify-2-2026-05-29/|/qualify/2/|g' qualify/2/*.html
git commit -am "revert: restore qualify-2-classic from archive"
```

**Cleanest (git):**
```
git revert <cro-overhaul-merge-sha>
```

## Why it was retired

CRO baseline applied (see `outputs/UtilityBenefits_CRO-Implementation-Spec.md` + the cro-audit branch commits). Headline changes:
- Landing CTA button replaced by self-advancing state dropdown
- Categories renamed to Energy / Internet & Phone / Food & Rent / Other Help
- Typeface switched from Source Serif 4 / Inter to DM Sans
- Card treatment: 18px radius + soft single-layer shadow
- Progress bar: continuous fill → 4 segmented stepping stones
- Numbered section badges dropped
- "Live — agents available now" green dot now pulses
- Trust copy bumped to navy + larger; step 4 heading changed to "Contact Information", submit relabeled "Submit"
- Step 4 spacing tightened so Submit sits above the fold on 1366×768 and 390×844
