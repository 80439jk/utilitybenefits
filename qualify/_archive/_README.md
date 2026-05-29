# /qualify/_archive/ — retired funnel snapshots

Browsable copies of every funnel iteration that has been replaced at the `/qualify/{N}/` URL. Kept so the team can:

1. **Compare** new funnels against the version they replaced (open both side-by-side).
2. **Revert** quickly if a new funnel regresses against the old one.
3. **Recover ideas** from past iterations that were dropped during a CRO overhaul.

## Naming convention

`/qualify/_archive/qualify-{N}-{YYYY-MM-DD}/` — where `N` is the funnel slot (`2`, `3`, …) and the date is the day the funnel was retired (replaced at its live URL).

Examples:
- `qualify-2-2026-05-29/` → version of `/qualify/2/` retired on 2026-05-29
- `qualify-3-2026-08-14/` → hypothetical future retirement of `/qualify/3/`

Each archived folder is a self-contained funnel: its internal links, CSS, and JS paths are rewritten to point inside the archive folder, so opening the archived landing page renders the original funnel and clicking "Continue" stays inside the archive.

## What each archive contains

```
qualify-{N}-{date}/
  _README.md            ← retirement date, replaced-by, revert instructions
  index.html            ← landing
  step-*.html           ← step pages
  _funnel.css           ← styles snapshot at time of retirement
  _attribution.js       ← attribution capture snapshot
  (any other funnel-local assets)
```

## Git tags pair with each archive

For each retirement, a tag is pushed on the **pre-merge `main` HEAD** that is byte-identical to the original live funnel (no path rewrites). Naming: `funnel/qualify-{N}-{slug}`.

Example: `funnel/qualify-2-classic` points to the exact commit where `/qualify/2/` was still the pre-CRO version. To resurrect byte-identical files:
```
git checkout funnel/qualify-2-classic -- qualify/2/
```

## Process for retiring a funnel and slotting in a new one

When a new funnel is ready to replace `/qualify/{N}/`:

1. **Snapshot the current live funnel** into `/qualify/_archive/qualify-{N}-{today}/` — copy files, rewrite internal paths to point inside the archive folder, write a `_README.md` documenting what's replacing it and why.
2. **Tag** the current `main` HEAD as `funnel/qualify-{N}-{slug}` (slug = short descriptive name, e.g. `classic`, `cro1`, `address-first`).
3. **Land the new funnel at `/qualify/{N}/`** via a PR from the working branch into `main`.
4. **Delete the working branch** — the tag + merge commit preserve everything needed.
5. **Confirm Vercel deployed** both: new funnel at `/qualify/{N}/` and archive at `/qualify/_archive/qualify-{N}-{date}/`.

## Indexing / SEO

Every archived HTML keeps `<meta name="robots" content="noindex,nofollow" />` from its original. Archives are not added to `sitemap.xml`. Search engines stay focused on the live funnel.

## Lead-capture behavior

Archived step-4 forms keep their original `action="/api/lead/"` — submitting from an archive creates a real lead. The archive is `noindex,nofollow` and reachable only by direct link, so this is internal-only. If a future archive needs to be truly read-only, change its step-4 form action to `#` before committing.
