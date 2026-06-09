# Cleanup Notes — orphaned / superseded files

Compiled while working on the `qualify2-trust-content` branch (qualify/2 landing-page
trust-content work). **Nothing here has been changed or deleted.** This is a reference
list so you can clean up safely later. Verify each item against live ad destinations and
Vercel analytics before removing — some may still be used as fallbacks or in active tests.

## Likely orphaned (no inbound links found in the repo)

| Path | Why it looks orphaned | Suggested action before removing |
|---|---|---|
| `qualify/3/` (full 3-step funnel) | Only references itself; not linked from the homepage, content pages, or `qualify/2`. Looks like an abandoned A/B variant of the funnel. | Confirm no Google Ads campaign points to `/qualify/3/`. If none, archive or delete. |
| `qualify/thank-you-v2/` | No inbound references found anywhere in the repo. | Confirm it isn't set as a conversion/thank-you destination in GTM or an ad. Then archive/delete. |
| `qualify/thank-you-v3/` | Same as above — no inbound references. | Same as above. |
| `qualify/index.html` (old 7-step single-page calculator) | Content pages and the homepage now link to `/qualify/2/`. This older standalone calculator appears superseded. | **Check carefully** — confirm no ad/email/bookmark still sends traffic to `/qualify/` before removing. If retained, consider a redirect to `/qualify/2/`. |

## One-off migration scripts (safe to keep, not runtime code)

These live in `scripts/` and were one-time codemods, not part of the served site. They don't
affect production but can be removed once you're confident they won't be re-run:

- `scripts/redirect_cta_to_qualify2.py`
- `scripts/replace_phone_numbers.py`
- `scripts/install_trustedform.py`
- `scripts/install_gtm.py`
- `scripts/install_inactivity_popup.py`

## Notes / things to double-check (not orphans, just worth a look)

- The five `/lp/*` paid landing pages submit their forms to `/qualify/thank-you/`, while the
  live `/qualify/2/` funnel posts to `/api/lead/`. Two different submission paths coexist —
  worth confirming both still match your current lead-capture setup. (Out of scope for this branch.)
- `vercel.json` has temporary (302) redirects `/qualify/submit` → `/qualify/thank-you/`. Confirm
  whether `/qualify/submit` is still referenced anywhere.

_Last updated while building the qualify/2 trust-content sections._
