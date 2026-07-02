# Cleanup Notes — orphaned / superseded files

Compiled while working on the `qualify2-trust-content` branch (qualify/2 landing-page
trust-content work). **Nothing here has been changed or deleted.** This is a reference
list so you can clean up safely later. Verify each item against live ad destinations and
Vercel analytics before removing — some may still be used as fallbacks or in active tests.

## Added by the `qualify4-reduced-funnel` branch (reduced 3-step funnel, went live 2026-07)

The reduced funnel replaced qualify/4's old 4-step flow. The old step files were **kept in
place, not deleted**, so we can roll back qualify/4 to the 4-step flow instantly if the
reduced funnel underperforms. They are now orphaned (no inbound links — the landing points
at `step-1-dob`). See `qualify/4/REDUCE-FUNNEL-README.md` for full context.

| Path | Status | Suggested action before removing |
|---|---|---|
| `qualify/4/step-1-dob-citizen.html` | Superseded by `qualify/4/step-1-dob.html` | Rollback-only. Keep until the reduced funnel is proven, then delete. |
| `qualify/4/step-2-address.html` | Dropped from the reduced funnel | Same — rollback-only. |
| `qualify/4/step-3-income-employ.html` | Dropped from the reduced funnel | Same — rollback-only. |
| `qualify/4/step-4-contact.html` | Superseded by `qualify/4/step-3-phone-tcpa.html` | Same — rollback-only. **Note:** still has the TCPA checkbox + full field set; the reduced funnel removed the checkbox. |
| `_perf_funnel_head.py` (repo root) | One-off idempotent codemod (mobile-perf head tweaks) | Local one-off, not committed / not runtime. Safe to delete anytime. |

**Also note (follow-ups, not orphans):**
- **DOB→age reconciliation (next task):** a prior *dirty* prod deploy `2af3c4bc`
  ("feat(api/lead): add extended.age computed from DOB", not in git) was reverted; current
  `api/lead.js` has no `extended.age`. If age is wanted in Caliber, add it fresh in the repo.
- The reduced-funnel steps still use the shared `ub2_*` sessionStorage keys — fine (one funnel
  per session), but rename to `ub4_*` if qualify/4 ever needs isolated analytics.

---

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
