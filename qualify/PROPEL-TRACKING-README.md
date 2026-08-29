# Propel / PostbackX Direct-Link Tracking — TEST INTEGRATION

**Status:** experimental A/B tracking test. Added on branch `propel-tracking-test`.

## What it is
A third-party direct-link click tracker. A snippet loads `direct-snippet.js` from
`propel-lander-api.propelsys.workers.dev` and calls `PropelDirect.init({...})` on page load.
It captures the inbound click and (via the platform's postback) attributes a downstream conversion.

## Where it lives
Injected into `<head>`, immediately after the GTM block, on the two funnel **landing pages only**:

| Page | offerId |
|------|---------|
| `qualify/2/index.html` | `394159cb-34ac-4044-868e-37c846855f08` |
| `qualify/5/index.html` | `cfe090d3-0159-402d-a346-dc29412f6aaa` |

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
