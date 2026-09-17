# Propel / PostbackX Direct-Link Tracking — TEST INTEGRATION

**Status:** experimental A/B tracking test. Added on branch `propel-tracking-test`.

## What it is
A third-party direct-link click tracker. A snippet loads `direct-snippet.js` from
`propel-lander-api.propelsys.workers.dev` and calls `PropelDirect.init({...})` on page load.
It captures the inbound click and (via the platform's postback) attributes a downstream conversion.

## Where it lives
Injected into `<head>`, immediately after the GTM block, on **landing pages only**
(never the step pages):

| Page | offerId |
|------|---------|
| `qualify/2/index.html` | `394159cb-34ac-4044-868e-37c846855f08` |
| `qualify/5/index.html` | `cfe090d3-0159-402d-a346-dc29412f6aaa` |
| `qualify/dni/2/index.html` (test clone) | `394159cb-34ac-4044-868e-37c846855f08` — **same live offer** |
| `qualify/dni/5/index.html` (test clone) | `cfe090d3-0159-402d-a346-dc29412f6aaa` — **same live offer** |

> **The DNI test clones reuse the live offer IDs by decision (2026-09-17).** Their
> clicks are real rows on the live offers. Exclude them in reporting with
> `landing_page_url NOT LIKE '%/qualify/dni/%'` — the path survives the API's
> `sanitizeLandingUrl()`, and it is the only thing that distinguishes them.
> See `qualify/dni/README.md`.

Shared across both: `trackingId: 21e14abbc56d45469deb8a`, `apiUrl: https://propel-lander-api.propelsys.workers.dev`.

Marked in-page with `<!-- PostbackX / Propel Direct Link Tracking (test integration) -->` … `<!-- End PostbackX / Propel -->`.

## External dependency to track (cleanup / maintenance)
- New runtime dependency on `propelsys.workers.dev` on top-of-funnel pages. If that host goes
  down or is retired, remove the two snippet blocks.
- This is **separate from GTM and TrustedForm** — it does not replace either.
- Step pages (`step-1..4`) intentionally do NOT carry the snippet.

## To remove
Delete the `<!-- PostbackX / Propel … -->` … `<!-- End PostbackX / Propel -->` block from both
`index.html` files and delete this README.
