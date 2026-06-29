# `/qualify/4/` — utility-bills landing variant (Task 1)

A new funnel variant cloned from `/qualify/2/` (the live funnel). Built on branch
**`qualify4-utility-bills-hero`** — not merged to `main`.

**Scope of Task 1:** the **landing page only** (`/qualify/4/index.html`). The four step
pages were copied **verbatim** from `qualify/2` (only their internal `/qualify/2/` paths
were rewritten to `/qualify/4/`) so the funnel runs end-to-end. No step content changed.

## What changed on the landing (`index.html`)

Above-the-fold hero rewritten with new copy:
- New H1: "Get Free Help Lowering Electric, Internet & Phone Bills" + micro-line + subhead.
- The 4 **intent tiles** ("What do you need help with?") were **replaced** with three
  value-prop bullets (one-call check / no cost-no SSN / $40–$130 a month).
- The state-selector block heading is now the CTA **"Start Free 2‑Minute Check"**; the
  **"State" label was removed**. The green state `<select>` (`.state-select-wrap`) is reused
  unchanged and remains the **only** conversion trigger (auto-advances on select — no submit button).
- Added a tiny reassurance line under the dropdown and a secondary tap-to-call line in the hero.
- "Reviewed by…" strip kept as-is.
- Mobile sticky bar copy updated to "Need help with a bill? Tap to call: (813) 820-4157".

New hero CSS lives at the bottom of `qualify/4/_funnel.css` (this is the cloned copy —
`qualify/2/_funnel.css` is untouched).

### Below-the-tile content (replaced qualify/2's trust-bar / programs / "what to expect")

Eight new sections with deliberately varied layouts (so it doesn't read as one long list):
1. **You're not alone** — centered intro band
2. **What is the Two-Track Check?** — two side-by-side track cards (Assistance / Savings)
3. **How it works** — three-across numbered step tiles
4. **Real-world impact** — two big savings-stat tiles on an emerald band ($480 / $1,560 a year)
5. **Works even if…** — two-column item grid
6. **Free, safe, no obligation** — four-up trust grid
7. **Common questions** — native `<details>`/`<summary>` FAQ accordion (11 Q&As, no JS)
8. **Final CTA** — navy band with primary CTA + tap-to-call

All section CTA buttons scroll back to the hero state selector (single conversion path,
matching qualify/2's pattern); every call link reuses **(813) 820-4157**. Styles are scoped
`.ub4-*` classes appended to `qualify/4/_funnel.css`.

The footer and mobile sticky call bar are unchanged from qualify/2.

## Shared resources (intentionally NOT duplicated)

qualify/4 points at the same shared assets as qualify/2 — changing these affects both funnels:
- `/api/lead/` — lead submission endpoint (step-4)
- `/qualify/thank-you/` — post-submit thank-you page
- `/qualify/popup.js` — inactivity popup
- `/lp/_shared.css` — base design tokens

## Things to know / flag for later

- **Phone reused:** qualify/4 uses the same started-funnel line **(813) 820-4157** as qualify/2.
  Calls from the two variants therefore **blend at the number level** in Google Ads call-conversion
  reporting. To A/B them on call rate, split by landing-page URL in GTM, or provision a dedicated
  number + Call Conversion action for qualify/4.
- **`intent` no longer captured:** the landing dropped the intent tiles, so qualify/4 leads carry
  no `intent` value to the CRM (step-1 never used it; only step-4 forwarded it). Expected, not a bug.
- **Shared sessionStorage keys:** the cloned steps still use the `ub2_*` keys (e.g. `ub2_state`,
  `ub2_attr`). Harmless because a user goes through one funnel per session, but if qualify/4 ever
  needs isolated analytics, rename these to `ub4_*` in the step files + `_attribution.js`.
- **No `vercel.json` change needed:** static files under `/qualify/4/` are served automatically;
  qualify/2 stays live and untouched.

## Pre-existing orphans (from repo root `CLEANUP-NOTES.md`, not created here)

Still worth cleaning up separately — unrelated to this branch:
`qualify/3/`, `qualify/thank-you-v2/`, `qualify/thank-you-v3/`, and the old single-page
`qualify/index.html` are all flagged as having no inbound links. Verify against live ad
destinations / GTM before removing.
