# Inactivity popup ("Before you go...") — UtilityBenefits funnel

Originally built on branch `pop-up`; now live on `main`. `qualify/popup.js` is a
single shared file loaded by **both live funnels** (`qualify/2/` and `qualify/4/`)
plus the shared thank-you page, so every funnel behaves identically.

Mirrors the NBA funnel's 30-second inactivity popup (`apply/popup.js`), restyled
to the UtilityBenefits visual identity (DM Sans + emerald / dark-green).

## What it does

After **30 seconds** of no mouse/touch activity, a modal slides in inviting the
visitor to call. Shows **once per session** (`sessionStorage` key
`ub_popup_shown`). Dismissed by the close button or clicking the backdrop.

Once it fires (or is dismissed), `teardown()` clears the timer and removes the
mouse/touch listeners, so it **never re-pops on the same page**. (Before this fix
the inactivity timer kept re-arming on mouse movement and re-showed every 30s.)

On the **thank-you page** the overlay gets a `ub-popup--ty` modifier: it docks to
the bottom of the screen with a lighter backdrop so the case number stays visible,
and clears the mobile sticky call bar. The `tel:` anchor is unchanged.

- Headline: **Before you go...**
- Body: *Call now and speak with a case manager who can help you find what options may be available to you.*
- Call button: **(813) 820-4146** → `tel:+18138204146` (a **dedicated popup line**)

The popup overlay is pre-rendered hidden on page load so the `tel:` anchor is in
the DOM for Google Forwarding Number / GTM scans. The link is a plain `tel:`
anchor — no `onclick`/`preventDefault` — so call tracking fires natively.

## Files

| File | Role |
|---|---|
| `qualify/popup.js` | The popup (self-contained IIFE, ~150 lines). All styles injected inline under a `ub-popup-` class prefix. |
| `scripts/install_inactivity_popup.py` | Idempotent installer — injects the `<script>` tag and applies the `tel:` E.164 fix below. Re-running is a no-op. |

### Pages the popup runs on (both live funnels + the shared thank-you)
**Funnel 2 (`qualify/2/`):**
- `index.html` (landing)
- `step-1-dob-citizen.html`
- `step-2-address.html`
- `step-3-income-employ.html`
- `step-4-contact.html`

**Funnel 4 (`qualify/4/`, reduced 3-step):**
- `index.html` (landing)
- `step-1-dob.html`
- `step-2-name-email.html`
- `step-3-phone-tcpa.html`

**Shared:**
- `qualify/thank-you/index.html`

The funnel/landing/step pages **lazy-load** it (via `requestIdleCallback` / a
short post-`load` timeout) so it stays off the critical render path. The thank-you
page loads it with a plain `<script src="/qualify/popup.js"></script>` just before
`</body>`, placed **after** the existing `tel:` click tracker so the dedicated
popup number is not swept into the `lp_thank_you_call` dataLayer event (keeps its
attribution separate).

> Funnel 4's rollback-only orphan step files (`step-1-dob-citizen.html`,
> `step-2-address.html`, `step-3-income-employ.html`, `step-4-contact.html`) also
> still contain the loader but are **not linked** by the live reduced funnel.

### Why `qualify/popup.js` (not a `_`-prefixed file inside `qualify/2/`)
The repo convention is `_`-prefixed shared files *inside* the funnel folder
(`qualify/2/_attribution.js`, `_funnel.css`). The thank-you page lives **outside**
`/qualify/2/` (at `/qualify/thank-you/`), so a single shared file at the
`/qualify/` root is reachable by all 6 pages via one absolute path.

## Also done in this change: `tel:` links upgraded to E.164 (+1)

Per request, the call links on the same 6 pages were converted to E.164 format
(visible display text like `(813) 820-4157` is unchanged — only the `href`):

- `tel:18138204157` → `tel:+18138204157` (landing + 4 steps, 15 links)
- `tel:18138204158` → `tel:+18138204158` (thank-you, 5 links)

### ⚠️ Before deploying — verify call-conversion tracking
The `+1` changes the exact `tel:` href value. Your **Google Ads Call Conversion
actions / GTM call-click triggers** are configured in the GTM/Ads dashboard (not
in this repo, not verifiable from code). This is expected to be safe **if** those
triggers match on the **digits** (`18138204157`) rather than the exact glued
string `tel:18138204157`. Confirm in GTM Preview before merging to `main`.

### ⚠️ The dedicated popup number needs its own conversion setup
**(813) 820-4146** is a new line that does not appear anywhere else on the site
(by design, for clean attribution — same model as NBA's popup-only number). For
popup-driven calls to be attributed, the owner must create the matching **Google
Ads Call Conversion action + GTM tag** for `tel:+18138204146` in the GTM/Ads UI.
Code alone does not register the conversion.

## Orphaned / cleanup candidates noticed during this work (verify before removing)

Not touched by this change — flagged for future maintenance:

- **`qualify/thank-you-v2/`** and **`qualify/thank-you-v3/`** — only
  `qualify/thank-you/` is wired up (`vercel.json` redirects `/qualify/submit` →
  `/qualify/thank-you/`). v2/v3 look like unused experiments. They still use the
  un-prefixed `tel:` format and do **not** have the popup.
- **`qualify/index.html`** (legacy v1 landing) — `main`-site CTAs were redirected
  to `/qualify/2/` (commit v1.32); this page is effectively dead but still served.
- **`qualify/3/`** — a 3-step funnel variant. Not currently the live funnel, so it
  was excluded from the popup. **If `/qualify/3/` is ever promoted to live, add
  `qualify/3/` pages to `LIVE_PAGES` in the installer and re-run it.**
- **`qualify/_archive/qualify-2-2026-05-29/`** — intentional pre-CRO snapshot;
  leave as-is.

## Re-running / reverting

```bash
# Re-apply (idempotent — safe anytime, e.g. after pages are regenerated):
python3 scripts/install_inactivity_popup.py

# Revert everything on this branch (since nothing is committed):
git checkout -- qualify/   # discards the HTML edits
rm qualify/popup.js qualify/INACTIVITY_POPUP_README.md scripts/install_inactivity_popup.py
```

To tune the timing, edit `DELAY` (ms) at the top of `qualify/popup.js`.
