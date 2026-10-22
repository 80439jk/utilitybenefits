# Attribution fix plan — UtilityBenefits landing pages (2026-10-21)

Status (2026-10-21, branch `fix/attribution-ack-retry`): **UB-1, UB-2, UB-3,
UB-4, UB-6, UB-7, UB-8 implemented. UB-5 not done**, because it needs the
owner/Sparrow fallback-number decision and new numbers. **UB-9** needs no
change here until Sparrow EI-5 ships. See "Implementation notes" at the end.
Companion plans:
`~/sparrow/docs/UB-ATTRIBUTION-FIX-PLAN-2026-10-21.md` (Sparrow / DNI / Edge
Inject) and `~/postbackx/docs/UB_ATTRIBUTION_FIX_PLAN_20261021.md`.

## Why

On 2026-10-20, 20 CPN sales ($176) were not sent to PostbackX because the CPN
call had no PostbackX `click_id`. CPN calls inherit `click_id` only from the
visitor's earlier UB DNI session (`/qualify/2/`, `/5/`, thank-you pages) via
shared caller tags. Findings that involve this repo:

- **Lost hand-off on edge-injected landings.** 3 sales: Edge Inject created
  the Funnel session, PropelDirect created the PBX click 1–3 s later, but the
  session never received the `click_id` (no tags, no heartbeat). Day-wide,
  140 edge landing sessions with a gclid never reported to Sparrow; 43 of them
  had a real PBX click.
- **Static `(855) 617-2111` dials right after submit.** 5 sales: PBX logged
  `form_submit`, then the caller dialed the static 855 line within 24 s–2 min.
  The thank-you pool (6 numbers) was full at submit for 4 of the 5. 855 is the
  hard-coded fallback in every DNI page and both pools' `default_number`; a
  call to it carries no session and no `click_id`.
- **Empty `click_id`.** 1 sale: PropelDirect never created a click and the
  session stored `click_id = ""`.

Code defects found while tracing (confirmed in code; not each proven per call):

| File | Defect |
|---|---|
| `qualify/2/_attribution.js:88-95`, `qualify/5/_attribution.js` (same lines) | `sendClickId()` sets `clickIdSent = true` immediately after the async `Sparrow.enrich()`. If the server rejects or the beacon drops, the 30 s retry loop has already stopped. |
| `qualify/thank-you-2/index.html:463-512`, `qualify/thank-you-5/index.html` | Same pattern in `send()` / `sendClickId()`. |
| `qualify/2/step-4-contact.html:324`, `qualify/5/step-4-name-email.html:325` | `click_id: (UBAttribution.clickId()) \|\| ''` sends an empty string that can overwrite a stored click. |
| `qualify/2/index.html:304-305`, `qualify/5/index.html:278-279` | Comment says PropelDirect's POST "has returned" by submit; not guaranteed (auto-advance after 450 ms, `index.html:277-284`). |
| All DNI pages + both pools | Fallback `+18556172111` is live and routable, shared by both stages, so fallback calls connect but are unattributable and indistinguishable. `qualify/dni/README.md` still describes the fallback as unroutable in places. |

---

## Fixes

### UB-1 — Retry `click_id` until Sparrow acknowledges it
- **Files:** `qualify/2/_attribution.js`, `qualify/5/_attribution.js`.
- **What:** replace `sendClickId()` with an acknowledged send:
  ```js
  var clickIdSent = false, inFlight = false, attempt = 0;
  function sendClickId(){
    if (clickIdSent || inFlight) return clickIdSent;
    if (!(window.Sparrow && window.Sparrow.enrich)) return false;
    var cid = clickId();
    if (!cid) return false;
    inFlight = true;
    window.Sparrow.enrich({ click_id: cid }, function(err){
      inFlight = false;
      if (!err) { clickIdSent = true; return; }
      attempt++;
      setTimeout(sendClickId, Math.min(30000, 1000 * Math.pow(2, attempt)));
    });
    return false;
  }
  ```
  Keep the 250 ms watcher until `clickIdSent`, but extend its cap from 30 s to
  the whole page lifetime (stop after success). Keep the `pagehide` /
  `visibilitychange` re-checks.
- **Note:** `Sparrow.enrich` calls back `null` before `init` without sending
  ("init() sends them"); that path depends on Sparrow fix SN-1 to be reliable.
- **Cache-bust:** bump `_attribution.js?v=` on every page that loads it.

### UB-2 — Same acknowledged send on the thank-you pages
- **Files:** `qualify/thank-you-2/index.html` (`send()` 463-489,
  `sendClickId()` 504-512), `qualify/thank-you-5/index.html`.
- **What:** set `clickIdSent = true` only inside the `Sparrow.enrich(data, cb)`
  callback when `err` is null; retry with backoff otherwise. Keep the existing
  rule of deleting empty fields before sending.

### UB-3 — Never send an empty `click_id`
- **Files:** `qualify/2/step-4-contact.html:310-326`,
  `qualify/5/step-4-name-email.html:316-327`.
- **What:** build the object, then delete empty keys before `Sparrow.enrich`
  (same as thank-you-2 line 486):
  `Object.keys(d).forEach(function(k){ if (!d[k]) delete d[k]; });`

### UB-4 — Correct the click-id timing comments
- **Files:** `qualify/2/index.html:304-305`, `qualify/5/index.html:278-279`.
- **What:** state that the click may not exist yet and that
  `_attribution.js` keeps resending on later steps. No behaviour change.

### UB-5 — Separate, attributable fallback numbers
- **Why:** one shared, unattributable fallback hides which stage failed and
  loses the sale.
- **What (needs Sparrow/owner decision):** give each stage its own routable
  fallback number (Funnel vs Thank You) and set the matching pool
  `default_number` to it. Update every `tel:` anchor and visible text on:
  `qualify/2/index.html`, `qualify/2/step-*.html`, `qualify/5/index.html`,
  `qualify/5/step-*.html`, `qualify/thank-you-2/index.html`,
  `qualify/thank-you-5/index.html`. Keep `data-sparrow-phone` on each anchor.
  Bump `popup.js?v=` (it mirrors the page's first `tel:`).
- **Do not** pass the Funnel `click_id` to a fallback call by phone match
  without the corroboration rule in Sparrow CFG-4.

### UB-6 — Give PropelDirect time before auto-advance (optional)
- **Why:** `index.html` auto-submits 450 ms after the state select, while
  PropelDirect's click POST may still be in flight.
- **What:** before `requestSubmit()`, wait up to 1.5 s for
  `UBAttribution.clickId()` to return a value, then submit regardless.

### UB-7 — Documentation
- **File:** `qualify/dni/README.md`.
- **What:** fallback is now routable `(855) 617-2111` (or UB-5's numbers);
  current pool names/sizes (UB - Funnel 20 numbers, UB - Thank You 6, 180 s
  reservation); bot traffic note; link to this plan.

### UB-8 — Synthetic browser test
- **What:** a Playwright script (not run against production lead endpoint)
  that walks `/qualify/2/` → steps → `/qualify/thank-you-2/` on a preview
  deploy with: PropelDirect cookie delayed 3 s; first `/v2/session/validate`
  forced to 500; localStorage disabled. Assert the Sparrow session ends with
  the expected `click_id` and the thank-you page shows a pool number (not 855).
- Leads are real on `/api/lead/`; use a preview deploy with the CRM stubbed or
  obviously fake data per `qualify/dni/README.md` → "Leads are real".

---

### UB-9 — If Sparrow EI-5 (edge click creation) ships
- No markup change is required: PropelDirect reuses the edge-set
  `_propel_click_id` cookie, and `_attribution.js` already reads that cookie.
- Keep the PropelDirect snippet on `/qualify/2/` and `/5/` as the fallback.
- Verify on a preview deploy that only one PBX click is created per landing
  (edge), and that `UBAttribution.clickId()` returns the edge id on step 1.

## Not changing here

- `api/lead.js` 10DLC-only deposit (commit `e972988`) is intentional. It does
  not feed CPN or Funnel-line calls; any change belongs to an owner decision,
  not this fix list.
- No phone- or gclid-based revenue matching in the browser.

## Order
UB-3, UB-1, UB-2 first (small, independent). UB-4, UB-7 with them. UB-5 after
the Sparrow fallback decision. UB-6, UB-8 next.

## Checks
- `git diff --check`; open each changed page on a preview deploy, confirm GTM
  + `<noscript>`, TrustedForm and the Sparrow snippet are still present.
- Preview link per change (repo rule); final public link when done.

## Implementation notes (2026-10-21)

- **UB-1** `qualify/{2,5}/_attribution.js` (`?v=6` on all 10 pages). Same as
  the sketch above, plus two guards. (1) An acknowledged send is attempted only
  once `Sparrow.getSessionId()` is set. Before that, `enrich()` calls back
  `null` without sending, which the sketch would count as success. Until then
  the tag is only stored (once per value) so `init()` carries it. (2) The retry
  budget is 20 attempts, with backoff of 2 s, 4 s and so on, capped at 30 s.
  The watcher runs for the whole page lifetime.
- **UB-2** thank-you-2/5: one acknowledged sender for the form data plus
  `click_id`. A `click_id` that arrives after the form data was acknowledged
  triggers one more acknowledged send. Empty keys are still dropped.
- **UB-3** step-4 `enrich` drops empty keys.
- **UB-4** comments corrected on both landings.
- **UB-6** `/qualify/2/` only, because `/5/` has a manual Continue and no
  auto-advance. The 450 ms delay stays. After it, the page waits up to 1.5 s in
  total from the pick while PropelDirect is present and no click_id has
  resolved, then submits anyway. A `pageshow` generation guard stops a stale
  wait from submitting after a bfcache restore.
- **UB-7** `qualify/dni/README.md` updated.
- **UB-8** `scripts/test-attribution-e2e.js`. It runs headless Chromium against
  a local static server, with every external request stubbed and `/api/lead/`
  faked (no CRM lead). It uses the real Sparrow and PropelDirect snippet JS.
  Scenarios: `baseline`, and `hostile` (PropelDirect 3 s late, the first
  validate per pool → 500, localStorage throwing, and an Edge Inject preload on
  the landing). Both pass on this branch, and both fail on `main` (click_id
  never acknowledged on the Thank You or Funnel session).
- **Found while testing (Sparrow, not fixed here):** the live snippet throws
  `Cannot read properties of null (reading 'querySelectorAll')` in
  `swapNumbers(document.body)` → `handleSession` when the session resolves
  before `<body>` is parsed. That happens with a warm localStorage cache on
  every step page and with an edge preload. The snippet is loaded `async` in
  `<head>`, so `setupObserver`, click tracking, navigation tracking, unload
  handlers and the heartbeat after that line never run on those page views.
  On an edge preload, `init()` also never reaches `syncAttribution()`, the only
  path that sends edge-session tags. That could explain the "no tags / no
  heartbeat" edge sessions. `state.session` is set before the throw, so the
  acknowledged `enrich()` from UB-1 still lands the `click_id` (the `hostile`
  scenario proves this).
  A second effect: on a fresh fetch the snippet's own `.catch` swallows the
  same throw, so the page keeps showing `(855) 617-2111` even though the
  session holds a pool number. Reproduced on the Vercel preview of this branch
  **and of `main`**: the thank-you page still shows 855 while
  `Sparrow.getFormattedNumber()` returns the pool number. On production the
  edge writes the number server-side, so this only matters when the edge falls
  back (Thank You pool full, DO timeout). In that case the client snippet is
  the only swap, and it fails. That would make some of the "855 dial right
  after submit" calls a snippet bug, not just pool size. The e2e test warns on
  this and fails on it under `STRICT_SNIPPET=1`. Fix in
  `apps/dni/src/routes/snippet.ts` `handleSession`: defer to `DOMContentLoaded`
  when `document.body` is null. The e2e test reports it as a warning; run it
  with `STRICT_SNIPPET=1` to fail on it.
- **Versioned Sparrow snippet (release gate):** the fix above is in Sparrow
  `b323eee1` (combined PR #429). The snippet is cached
  `max-age=86400, s-maxage=604800` and the Worker ignores the query string, so
  all 12 DNI pages (`/qualify/2/` + 4 steps, `/qualify/5/` + 4 steps,
  `/qualify/thank-you-2/`, `/qualify/thank-you-5/`) load
  `sparrow-dni.min.js?v=ub-attribution-b323eee1`. A shared-cache purge cannot
  replace a visitor's browser copy; the new URL does. Bump `v` on the next
  snippet change that must reach visitors at once. Ship this only after
  `sparrow-dni` serves the corrected bytes on that URL.
  Checked 2026-10-22: with the `b323eee1` snippet bytes
  (`SPARROW_SNIPPET=<file>`), `STRICT_SNIPPET=1` passes all four e2e
  scenarios; with the currently served snippet `hostile` still fails on the
  `swapNumbers` throw.
