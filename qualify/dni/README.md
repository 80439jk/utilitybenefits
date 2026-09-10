# `/qualify/dni/` — DNI test clones

Isolated copies of the two **live paid** funnels, built so PostbackCalls DNI
(dynamic number insertion + Edge Inject) can be tested end-to-end without
touching live paid traffic.

> **This is a test surface. Never point an ad, a main-site CTA, or a shared link
> at any URL under `/qualify/dni/`.** Paid traffic belongs on `/qualify/2/` and
> `/qualify/5/`; organic CTAs belong on `/qualify/0/`.

Source docs live in the sibling `sparrow` repo:

- `docs/UTILITYBENEFITS-LANDING-PAGE-DEV-INSTRUCTIONS.md` — the markup contract
- `docs/UTILITYBENEFITS-DNI-IMPLEMENTATION-NEXT-STEPS.md` — pools, numbers, sizing
- `docs/UTILITYBENEFITS-EDGE-INJECT-MIGRATION.md` — Cloudflare DNS + Worker routes

## Why a shared `/qualify/dni/` parent

Edge Inject picks a DNI pool by **URL path prefix** (`DNI_POOL_MAP`) and binds to
a Cloudflare **zone route**. Putting both clones under one parent means a single
narrow Worker route and a single pool map cover the whole test surface, and live
`/qualify/2/` and `/qualify/5/` are provably outside it.

The thank-you clones nest as a real path **segment** (`/qualify/dni/thank-you/2/`,
not `thank-you-2`). `resolvePoolFromMap` matches on segment boundaries and longest
prefix wins, so `/qualify/dni/thank-you` resolves to the thank-you pool and never
falls back into the funnel pool.

## Path map

| Clone | Source | `lp` value |
|---|---|---|
| `/qualify/dni/2/` (+ 4 steps) | `/qualify/2/` | `qualify2dni` |
| `/qualify/dni/5/` (+ 4 steps) | `/qualify/5/` | `qualify5dni` |
| `/qualify/dni/thank-you/2/` | `/qualify/thank-you/` | — |
| `/qualify/dni/thank-you/5/` | `/qualify/thank-you-5/` | — |

`api/lead.js` routes `qualify2dni` → `/qualify/dni/thank-you/2/` and `qualify5dni`
→ `/qualify/dni/thank-you/5/`.

## sessionStorage is isolated

The clones must not share funnel state with the live funnels in the same browser,
or a tester who runs the live funnel first carries values into the clone.

| | Live | Clone |
|---|---|---|
| `/2/` step values | `ub2_*` | `ub2d_*` |
| `/5/` step values | `ub5_*` | `ub5d_*` |
| Attribution blob | `ub2_attr` (both) | `ub2d_attr` / `ub5d_attr` |

## Leads are real

The clone forms POST to the **live** `/api/lead/`, which creates a **real Caliber
CRM lead**. Use obviously fake data. Test leads are identified by
`extended.lp = qualify2dni | qualify5dni` — confirm the CRM suppression filter on
that field before the first test submit.

## Intentional differences from the source funnels

Everything else is a verbatim copy. These three are deliberate; do not "fix" them.

1. **No Propel/PostbackX snippet.** `/qualify/2/` and `/qualify/5/` load
   `PropelDirect.init()` on their landing pages with live `offerId`s. Cloning it
   would inject synthetic clicks into live Propel offer reporting. Omitted from
   both clone landings, with a comment in place of the block.
2. **`_funnel.css` cache-bust restarts at `?v=1`.** Each clone has its own CSS
   copy; the versions are independent of the source funnels'.
3. **`robots.txt` carries `Disallow: /qualify/dni/`** on top of the per-page
   `noindex,nofollow` the clones inherit.

## Preserved on purpose

- **Consent copy is per-source and stays that way.** These clones carry the
  lead-gen consent wording (names service providers and marketing partners,
  permits sharing). Never sync it with `/qualify/0/`'s 10DLC text in either
  direction — see `qualify/0/README.md`.
- **`required` differs between the two.** `dni/2/step-4-contact.html` has
  `#tcpa … required`; `dni/5/step-4-name-email.html` does not. That mirrors the
  live funnels exactly.
- **GTM (`GTM-WRGCMJLR`) + `<noscript>`, TrustedForm, and `noindex,nofollow`** on
  every page.
- **The inactivity popup is untouched.** Every clone page loads
  `/qualify/popup.js?v=5` exactly as its source does (lazy on funnel pages,
  synchronous on thank-you), 30s inactivity.

## `popup.js` must NOT be marked for DNI

`popup.js` uses its own dedicated line (`+18138204146`) so popup calls are
attributable separately from page calls. It is deliberately **not** given
`data-sparrow-phone`.

Server-side pool selection is per-page-path, but the popup appears on funnel
*and* thank-you pages, so it cannot get its own pool that way. Marking it would
swap it to whichever pool the page belongs to and silently destroy the
popup/page attribution split. This is parked pending a decision (leave static,
give it an explicit `data-sparrow-pool`, or fold it into the page pool).

## Live test resources (provisioned 2026-09-10)

Tenant **Intercom Media LLC** `99f90502-f0ce-4d03-aa41-2e138d453731`.

| Resource | Id |
|---|---|
| Publisher `UtilityBenefits Web` | `4fd6df4d-bb5c-4d02-9292-1bebdf09413b` |
| Campaign `UB - Web DNI Test` | `65c7199a-1d44-4052-be2b-585e7b5f540d` |
| Pool `UB - DNI Test Funnel` | `c7a9acee-ab84-41ea-9b55-2e387dc2a943` |
| Pool `UB - DNI Test Thank You` | `26e71048-a73c-45c2-bc9f-9b05f824dd39` |

| Pool | Number | `reservation_seconds` | `default_number` |
|---|---|---|---|
| Funnel | `+18336130264` | 900 | `+18138204157` |
| Thank You | `+18339370155` | 600 | `+18138204158` |

Both pools: `exhausted_behavior = show_default`, `allowed_domains =
utilitybenefits.com, www.utilitybenefits.com, *.utilitybenefits.com`.

### Two deliberate choices

**The test campaign has no routing plan.** A stray test call has nowhere to go,
which is intentional — it must never reach a live Benefits CTV buyer.

**The two pooled numbers were repointed off Benefits CTV.** A tracking number's
own `campaign_id` outranks the pool's in `call-lifecycle.ts`:

```js
if (dniPool?.campaign_id && !trackingNumber?.campaign_id) { … }  // pool is only a FALLBACK
```

Left as-is, test calls would have been attributed to Benefits CTV regardless of
the pool's campaign.

### Borrowed numbers — temporary

These two numbers are **dormant Benefits CTV toll-free numbers** (last calls
2026-08-19), borrowed to start testing at zero spend. `+18556172111` is the
**active** CTV line (374 calls, last 2026-09-04) and was deliberately left alone.

Consequences to keep in mind:

- **One number per pool.** Fine for one tester at a time; two concurrent visitors
  will share a number and produce `matched_via=ambiguous_lru`. Expected at this
  size, not a bug.
- **Toll-free, not local 813.** Caller NPA-to-state corroboration works better
  with geographic numbers, so match quality is slightly below what production
  would see.
- **If Benefits CTV restarts, these numbers are still in its creative.** Real CTV
  callers would land in the test campaign. Buy dedicated local numbers before any
  sustained use.

Rollback: set both numbers back to `campaign_id =
e3e3d658-b472-4e75-b332-ee6ff1309e7a`, `is_dni_number = false`, `dni_pool_id =
NULL`, and mark their `dni_pool_numbers` rows `removed`.

## Swap-path defect (fixed upstream, awaiting deploy)

Both swap paths used to destroy this markup. Found on 2026-09-10 by testing the
shipped worker rather than reading its docs, and fixed in Sparrow PR #156.

**Edge Inject** called `element.setInnerContent(...)` unconditionally: no pattern
check, no child preservation, every marked anchor replaced wholesale.

**The client snippet** tried to preserve children, but its separator class
`[-.]` excluded a space, so `(813) 820-4158` never matched and
`replacePhoneText` fell through to `el.textContent = formatted` — "the only case
where children get wiped". `formatPhone()` emits `(833) 613-0264`, a string the
snippet's own regex rejected.

**28 of the 42 marked anchors here contain child elements** (inline `<svg>`
icons, `.ub-callbtn` lead/number spans) and would have lost them. Damage was
visual only; `href` was always rewritten correctly, so calls still routed.

The reference integration (`familyownedcontractors.com`) uses a single text-only
anchor (`1-800-555-0000`), which has no space and no icon to lose — which is why
the bug never surfaced there.

The fix replaced the rewriter with a fragment-buffering implementation that
matches on decoded text and edits only the matching text nodes. The four pages
here were replayed through the real Cloudflare runtime as a regression check:
icons survive (21 `<svg>` in, 21 out), every number and `href` swaps, and no
line outside a phone anchor changes.

**Still gated on that PR shipping.** Until `sparrow-dni` and then
`sparrow-edge-inject` are deployed, the number swap is not safe to exercise.

## DNI wiring (applied)

`data-sparrow-phone` is on all 42 phone anchors, and each page carries its
stage's pool UUID. For reference, the rules that were followed:

1. Add bare `data-sparrow-phone` to every visible phone `<a>` (never an inner
   `<span>` — the anchor is what gets its `href` rewritten). Instances per page:
   4 on each landing (utility bar, header, `.ub-callbtn`, sticky), 3 on each
   step, 5 on each thank-you.

   > The upstream dev instructions claim tagging the `<a>` preserves an inline
   > `<svg>` because the replacer targets the phone-number *text node*. That was
   > not true of either swap path until Sparrow PR #156; see the section above.
2. Keep the hardcoded `(813) 820-4157` / `4158` text and `href` as the fallback —
   it is what renders with JS off, when the pool is exhausted, and what crawlers
   see. Do not hand-edit the `href`; the swapper rewrites it.
3. Add one snippet per page in `<head>` after GTM, with the pool UUID for that
   stage:

   ```html
   <script src="https://sparrow-dni.propelsys.workers.dev/dni/sparrow-dni.min.js"
           data-sparrow-pool="TEST_FUNNEL_POOL_UUID" async></script>
   ```

   The snippet ships **alongside** Edge Inject, not instead of it. Edge Inject
   injects the number server-side for speed, but click capture, heartbeats, and
   number release are all snippet-side — and the snippet is the only source of
   `click_page_url`. Without it the number is released while the visitor is still
   dialing.

`data-sparrow-*` attribute names and the `sparrow-dni` script URL are a hard
contract with the backend. The `sparrow-` prefix is legacy internal naming;
renaming it silently disables number swapping.

Do **not** use `data-sparrow-auto-detect` — it regex-scans the page and will
mangle the `UB-2026-…` case number on the thank-you pages.

Use `data-sparrow-debug="true"` while testing and **remove it before sign-off**.

### Cloudflare side

```toml
DNI_POOL_MAP = '''{
  "/qualify/dni/thank-you": "26e71048-a73c-45c2-bc9f-9b05f824dd39",
  "/qualify/dni":           "c7a9acee-ab84-41ea-9b55-2e387dc2a943"
}'''
```

Committed in Sparrow PR #156 (`apps/edge-inject/wrangler.toml`), applied when
that worker is deployed.

Worker route, `www.`-prefixed and narrow: `www.utilitybenefits.com/qualify/dni/*`.
The apex 307s to `www` from the Vercel origin, so a non-`www` pattern never fires
on real traffic. Deploy `sparrow-dni` **first** (it owns `PoolStateDO`), then
`edge-inject`.

## Follow-ups

- **Fallback numbers are the live ones for now** (`+18138204157` funnel,
  `+18138204158` thank-you). Swap to dedicated static test numbers once purchased,
  so a fallback-path test call is distinguishable from live traffic.
- **Google Forwarding Number is live and container-wide, but number-targeted.**
  Confirmed by reading the published `GTM-WRGCMJLR` container on 2026-09-10.
  Three call-conversion (`__awcc`) tags fire on **every** page (trigger is
  `gtm.init` with no URL condition), including these clones:

  | Tag | `phone_conversion_number` | Stage |
  |-----|---------------------------|-------|
  | 6   | `(813) 820-4158`          | thank-you |
  | 10  | `(813) 820-4157`          | funnel |
  | 14  | `(813) 820-4146`          | popup |

  `__awcc` only rewrites anchors whose text matches its configured number, so it
  cannot touch a pool number such as `(833) 613-0264`. **The order of the two
  swaps is what matters.** Edge Inject rewrites at the CDN before the HTML
  reaches the browser, so GTM sees the pool number and finds nothing to swap.

  Two cases still collide, both worth watching on the first call test:
  1. **Pool exhausted / worker bypassed.** The page then renders its fallback,
     which is exactly `(813) 820-4157` / `4158` — a GFN target. GFN swaps it and
     the call is attributed to Google, not the pool.
  2. **Popup (`(813) 820-4146`).** All 12 clone pages load `popup.js`, and tag 14
     targets that number. The popup is not DNI-tagged, so GFN owns it as before.
     Expected, but it means a popup call is not a DNI test call.

  Removing GFN entirely is the documented end state (see the migration guide);
  until then, verify the swap landed before trusting any test call.

## Rollback

Delete `qualify/dni/`, revert the two `thankYou()` lines in `api/lead.js` and the
`robots.txt` block. No live funnel file is modified by this work at any point.
