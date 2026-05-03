# UtilityBenefits.com — Prototype

Clickable prototype for [UtilityBenefits.com](https://utilitybenefits.com), a content-led lead-generation site covering utility savings and assistance programs across electricity, natural gas, home internet, cell phone, home security, and water/sewer.

Built against Master Strategy & Build Specification v1.7 (May 2026).

## What's in this prototype

- **Homepage** (`/`) — 6-vertical grid, dual-track positioning, illustrative savings stack, calculator embed
- **Electricity vertical** wired through:
  - `/electricity/` — pillar page with quick-answer block, sub-pillar hub cards, FAQ
  - `/electricity/assistance/` — assistance hub (federal + state + demographic + crisis)
  - `/electricity/assistance/liheap/` — LIHEAP pillar (full 13-section structure)
  - `/electricity/assistance/liheap/texas/` — Texas (CEAP) state worked example
- **`/qualify/`** — interactive 7-step eligibility calculator with real LIHEAP rules, state config for 10 states, all 4 result paths (qualified / possibly / alternative / crisis)
- **`/stack-recommendations.html`** — defensible picks for every Section 22 open item (Vercel + Next.js + Sanity + HubSpot/Twilio Flex + CallRail + Statsig + Heap + Ahrefs)
- **`/_tour.html`** — index page describing each piece

## Tech

Pure static HTML + CSS + vanilla JS. No build step. Inter + Source Serif 4 fonts via Google Fonts CDN. Shared design tokens in `assets/styles.css`.

Deploys cleanly to Vercel as a static site (zero config).

## Local preview

```bash
# Any static server works:
python3 -m http.server 8000
# then open http://localhost:8000/_tour.html
```

## Deployment

Configured for Vercel via `vercel.json`. Pushing to the connected GitHub repo triggers an automatic deploy. Manual deploy:

```bash
npx vercel --prod
```

## Status

This is a **prototype**, not production code. Real implementation should follow the recommendations in `stack-recommendations.html` (Next.js + Sanity CMS + HubSpot CRM + CallRail DNI). The static prototype exists to validate the design, IA, and calculator UX before building on a real stack.

## License

Private — all rights reserved.
