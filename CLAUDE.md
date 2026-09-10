# CLAUDE.md — UtilityBenefits.com (UB)

UtilityBenefits.com is a content-led lead-generation site (utility assistance + savings across
electricity, gas, internet, cell phone, water, security) deployed on Vercel (project
`utilitybenefits`, domain utilitybenefits.com). Static HTML + a Vercel serverless lead endpoint
at `/api/lead/`. The conversion funnel lives under `/qualify/` as **flat step `.html` files** plus a
shared `_funnel.css` / `_attribution.js`.

**Funnel map (confirmed 2026-09-08):**
- `/qualify/2/` and `/qualify/5/` are the **live paid** A/B variants (paid traffic is split by ad
  destination, so **both must stay reachable** — don't add a redirect that retires one).
- `/qualify/0/` is the **10DLC / SMS compliance funnel**. Every main-site CTA points here. It is a
  clone of the `/qualify/4/` 3-step chain with a real consent checkbox. See `qualify/0/README.md`.
- `/qualify/4/` **no longer receives paid traffic** and no longer receives main-site CTAs. It stays
  live as a safety net for any ad that still points at it. Retirement candidate — see
  `ORPHANS-10DLC.md`.
- `/qualify/3/` is inactive.
- `/qualify/dni/2/` and `/qualify/dni/5/` (+ `/qualify/dni/thank-you/{2,5}/`) are **test clones** of
  the two live paid funnels, used to trial PostbackCalls DNI / Edge Inject. **Never point ads or
  main-site CTAs at them.** They submit real CRM leads tagged `lp=qualify2dni` / `qualify5dni`, and
  their sessionStorage keys (`ub2d_*` / `ub5d_*`) are isolated from the live funnels on purpose. See
  `qualify/dni/README.md`.

**Consent is a real checkbox on every live funnel.** `/qualify/0/`, `/qualify/2/`, `/qualify/4/` and
`/qualify/5/` each render the TCPA text as the label of an `#tcpa` checkbox. Never replace one with a
hidden `tcpa=1` field — that records consent the user never gave. Only `/qualify/2/` marks the box
`required`; on the others the box is optional and does **not** gate the submit button, so an
unchecked box still submits a lead with `consent.given: false` (do not SMS those leads).

**`/qualify/0/` carries different consent copy on purpose.** Its text grants consent to **UtilityBenefits alone** and never permits sharing the number — carriers reject the "service providers, and marketing partners … may be shared with" wording used by `qualify/2`, `/4` and `/5`, which is why those are not the 10DLC funnel. It also carries the message-frequency disclosure and the HELP keyword, which the other funnels lack. It mirrors NBA `apply/0`. Never sync consent copy between `qualify/0` and the lead-gen funnels in either direction — see `qualify/0/README.md`.

GTM container: `GTM-WRGCMJLR`. Started-funnel phone: `(813) 820-4157`.

## Working rules (always follow)

1. **GTM must be on every page.** The Google Tag Manager container script (`GTM-WRGCMJLR`) plus its
   `<noscript>` fallback must be present on **every** page. Always check this on any **new or updated
   page** before considering the work done — never ship a page without it.

2. **Preview link during iteration.** Provide a preview link **every time changes are made**
   throughout the iterative/build process, so each round can be reviewed as it happens.

3. **Final shareable link.** As a version reaches its final state, provide a **"final" public link**
   to share and test (publicly accessible — not login-gated).

4. **New variant → ask about main-site pointing.** When creating a new variant or funnel, **ask first**
   whether the main site's CTAs ("start", "check eligibility", etc.) should **stay pointed at the
   existing funnel** or **switch to the new variant** — before repointing any links.

## Other guardrails (carried over from sibling NBA project, apply here too)

- Never wrap/intercept `tel:` links or add `onclick`/`preventDefault` to them — GTM tracks them
  directly and Google Forwarding Number swaps the displayed number. Keep one phone number per page.
- Don't modify the GTM snippet or dataLayer pushes; don't remove TrustedForm.
- Don't show different content to crawlers vs users (no cloaking). Overlays/popups are fine if the
  underlying HTML is identical for everyone.
- The lead endpoint `/api/lead/` runs only on a Vercel deploy (not a static local preview); a real
  submit on a deploy creates a real CRM lead.

## Inactivity popup behavior (KEEP IN SYNC WITH NBA)

`qualify/popup.js` is the "Are you still there?" inactivity popup. It is a sibling of NBA's
`apply/popup.js` and the two must stay behaviorally identical — only brand skin (UB emerald/green
+ DM Sans vs NBA amber/navy + Poppins) and the phone number differ. When you change one, change the
other and update both CLAUDE.md files. Canonical behavior:

- **Trigger:** fires after **30s** of mouse/touch inactivity (`DELAY = 30000`). Never shorten this.
- **Once per session:** guarded by `sessionStorage` (`ub_popup_shown` / NBA `nba_popup_shown`).
- **Re-pops after close:** once shown per session, the popup **re-appears 30s after the visitor
  closes it** on that page (the inactivity timer re-arms on mouse/touch — there is intentionally no
  teardown). This matches the long-standing NBA behavior. Owner asked for this on 2026-07 after a
  brief experiment with a once-and-done teardown; do not re-add teardown without owner sign-off.
- **Runs on:** landing + every funnel step + thank-you — for **every** funnel (`qualify/0/`,
  `qualify/2/`, `qualify/4/`, `qualify/5/`). Funnel/landing pages lazy-load it
  (`requestIdleCallback`); thank-you loads it
  synchronously. Any new funnel must load it on every page.
- **Case number on thank-you:** the popup reads `#ty-case-number` and shows a "Your case number:"
  line inside the card (NBA reassurance pattern; NBA reads `#refNumber`). It intentionally overlaps
  the on-page number — the number is inside the popup, so the caller always has it.
- **Dedicated phone line:** popup uses its own `tel:` number (UB `+18138204146`) for clean call
  attribution — never reuse another stage's number here. Plain `tel:` anchor, no `onclick`.
- **Cache-busting:** `popup.js` is referenced with `?v=N`; bump `N` on every content change (CSS/JS
  are served `max-age=86400, stale-while-revalidate`, so a stale copy lingers ~1 day otherwise).
