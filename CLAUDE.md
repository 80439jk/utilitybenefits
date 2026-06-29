# CLAUDE.md — UtilityBenefits.com (UB)

UtilityBenefits.com is a content-led lead-generation site (utility assistance + savings across
electricity, gas, internet, cell phone, water, security) deployed on Vercel (project
`utilitybenefits`, domain utilitybenefits.com). Static HTML + a Vercel serverless lead endpoint
at `/api/lead/`. The conversion funnel lives under `/qualify/` as **flat step `.html` files** plus a
shared `_funnel.css` / `_attribution.js`. `/qualify/2/` and `/qualify/4/` are live A/B variants
(paid traffic is split by ad destination, so **both must stay reachable** — don't add a redirect
that retires one). GTM container: `GTM-WRGCMJLR`. Started-funnel phone: `(813) 820-4157`.

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
