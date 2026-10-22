# Edge-created PostbackX click — landing page plan (UtilityBenefits)

Status: **no work in this repo until Sparrow Phase 3 ships** (which waits on
PostbackX's atomic click ledger). Companion to UB-9 in
[ATTRIBUTION-FIX-PLAN.md](ATTRIBUTION-FIX-PLAN.md). Built by:
- Sparrow: `~/sparrow/docs/UB-EDGE-POSTBACKX-CLICK-IMPLEMENTATION-PLAN.md`
- PostbackX: `~/postbackx/docs/EDGE_CLICK_TRACK_SERVER_IMPLEMENTATION_PLAN.md`

## What changes for these pages

Sparrow Edge Inject (already routed on `/qualify/2/*`, `/5/*`,
`/thank-you-2/*`, `/thank-you-5/*`) will:
1. On the landing page (`/qualify/2/`, `/qualify/5/`), create the PostbackX
   click server-side and — only after PostbackX confirms it is stored — set
   `_propel_click_id` (and `_propel_attribution_key=google:<gclid>`) in the
   HTML response. If PostbackX is slow or fails, no cookie is set and
   PropelDirect creates the click in the browser exactly as today.
2. On every routed page, copy `_propel_click_id` onto the Sparrow DNI session,
   unless the URL carries a new ad click (gclid/gbraid/wbraid differs from
   `_propel_attribution_key`) — then the old cookie is ignored until
   PropelDirect replaces it.

Result: the visitor's DNI session has `click_id` from the first HTML response,
without waiting for PropelDirect's POST or `_attribution.js` → `Sparrow.enrich`.

## Review 2026-10-21 (landing-page side): ready, one fix applied

I checked this plan against the code on branch `fix/attribution-ack-retry`.

**Confirmed:**
- The offer ids match `PropelDirect.init`: `/2/` is
  `394159cb-34ac-4044-868e-37c846855f08`, `/5/` is
  `cfe090d3-0159-402d-a346-dc29412f6aaa`, and the tracking id is
  `21e14abbc56d45469deb8a`. These are the same values as Sparrow's planned
  `PBX_EDGE_CLICK_MAP`.
- The PropelDirect reuse path is real: `direct-snippet.ts:68-80` checks the
  cookie first, then `shouldCreateNewClick` at `:458-463`. The live
  `direct-snippet.js` is identical.
- `utilitybenefits.com` 307-redirects to `www.`, so host-only cookies on
  `www.utilitybenefits.com` are readable on every funnel page.
- e2e scenario `edgeclick` (in `scripts/test-attribution-e2e.js`): with
  `_propel_click_id` plus a matching `_propel_attribution_key` set before the
  landing loads, PropelDirect makes **0** create calls. The same edge id
  reaches the Funnel session, the Thank You session and the lead
  (`postbackx_click_id`). No other id is ever sent.

**Fixed here:** "no markup change is required" was not quite true.
`_attribution.js` and the thank-you pages read `_propel_click_id` **without**
checking `_propel_attribution_key`. A returning visitor from a new ad
therefore sent the previous ad's click to Sparrow and to the lead, while
PropelDirect created a new one. This bug exists today, independent of edge
clicks, and edge clicks would make it common. Both readers now require a
matching attribution key (see `qualify/dni/README.md` → "How it is
resolved"), and they prefer `PropelDirect.clickId` on the landing.
e2e scenario `newad` covers it: it fails before this fix and passes after.

**Requirements this puts on Sparrow's cookie writer (EI-5):**
1. Write `_propel_attribution_key` **raw**, as PropelDirect does
   (`google:<gclid>`), or URL-encoded. The readers `decodeURIComponent` it.
   Any other encoding would make every edge cookie look stale.
2. Use `Path=/`, host-only, and **no `HttpOnly`**: PropelDirect and
   `_attribution.js` read the cookies from JS.
3. Always set both cookies together. A click cookie without the key is used
   only when the visit has no ad parameters.
4. The HTML-response Set-Cookie must not strip or duplicate the
   `sparrow_vid` cookie (already covered by `appendCookies` in the Sparrow
   plan).

**Not covered by edge clicks:** the localStorage backup
`_propel_click_id`. PropelDirect writes it only on its own create path, so an
edge click lives in the cookie alone. That is fine, because the readers use
localStorage only when there is no ad key.

## Why no markup change is required
- `PropelDirect.init` (`qualify/2/index.html:20-24`, `qualify/5/index.html`)
  reads `_propel_click_id` first and, when the attribution key matches, takes
  its "returning visitor" path and **does not create a second click**
  (`~/postbackx/workers/lander-api/src/direct-snippet.ts:68-80`). Form
  injection, link rewriting and `_fbp`/`_fbc` enrichment still run.
- `_attribution.js` `clickId()` already falls back to the
  `_propel_click_id` cookie (`qualify/2/_attribution.js:74-76`).
- Thank-you pages read the same cookie (`thank-you-2/index.html:454-458`).

Keep the PropelDirect snippet on both landing pages: it is the fallback when
the edge route is bypassed, PostbackX is slow (> 700 ms) or the worker errors.

## Must not change
- Cookie names `_propel_click_id`, `_propel_attribution_key` and their
  host-only scope on `www.utilitybenefits.com`.
- `trackingId: '21e14abbc56d45469deb8a'` and offer ids in `PropelDirect.init`
  — Sparrow's config must match them (`394159cb-…` for `/2/`,
  `cfe090d3-…` for `/5/`). If an offer id changes here, change Sparrow's
  `PBX_EDGE_CLICK_MAP` in the same release.
- Do not add `?click_id=` to ad URLs; the edge treats a URL `click_id` as the
  redirect flow and will not create a click.

## Optional cleanups once edge clicks are stable (7 days)
1. ~~Apply UB-1/UB-2/UB-3 from ATTRIBUTION-FIX-PLAN.md~~ Done 2026-10-21 on
   `fix/attribution-ack-retry`, together with the attribution-key check above.
2. Update `qualify/PROPEL-TRACKING-README.md`: click is now created by Edge
   Inject on routed pages; PropelDirect is the fallback.
3. Update `qualify/dni/README.md` "Live swap" with the new edge behaviour and
   the rollback (set Sparrow `PBX_EDGE_CLICK_MODE` to `capture`/`off`).

## Verification on production (after Sparrow `on`)
Private window, real browser:
1. Open `https://www.utilitybenefits.com/qualify/2/?gclid=TEST-<date>` .
2. DevTools → Application → Cookies: `_propel_click_id` present **on the first
   response** (check the document response's `Set-Cookie`).
3. Console: `PropelDirect: Returning visitor, click_id=<same id>` (not
   "Click created").
4. Continue to step 1: `UBAttribution.clickId()` returns the same id.
   Repeat with a **different** `?gclid=`: expect a new id. Never accept the
   old one.
5. PostbackX: exactly one `clicks` row for that gclid, `click_source = 'edge'`.
6. Sparrow: the step-1 `dni_sessions.attribution.customTags.click_id` equals
   the id.
7. Do not submit the form (leads are real; see `qualify/dni/README.md`).

## Rollback
Nothing to roll back in this repo. Sparrow sets `PBX_EDGE_CLICK_MODE` to
`capture` or `off`; PropelDirect resumes creating clicks on the next visit.
