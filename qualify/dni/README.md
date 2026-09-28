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

1. **The Propel/PostbackX snippet reuses the LIVE `offerId`s** — a deliberate
   call, see "Propel" below. Test clicks land in live Propel offer reporting and
   must be filtered out there.
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
- **Popup trigger behavior is untouched.** Every clone page loads
  `/qualify/popup.js` exactly as its source does (lazy on funnel pages,
  synchronous on thank-you), 30s inactivity. Only the *number* differs — see
  below.

## `popup.js` is DNI-marked on these clones only

`popup.js` is a **single shared file** loaded by the live funnels and these
clones. It carries a path gate so the live funnels are provably unaffected:

```js
var IS_DNI = window.location.pathname.indexOf('/qualify/dni/') === 0;
```

| | Live funnels | `/qualify/dni/` clones |
|---|---|---|
| Popup number | `(813) 820-4146` (static) | mirrors the page's number |
| `data-sparrow-phone` on the popup anchor | no | yes |
| Google Forwarding Number tag 14 | owns it | nothing to match |

**Why it mirrors the page instead of getting its own pool.** Server-side pool
selection is per-path, but the popup appears on funnel *and* thank-you pages, so
it cannot be given a pool of its own that way. On the clones it therefore folds
into whichever pool the page belongs to — a popup call is a DNI test call, not a
separately attributed one. On the live funnels the dedicated `4146` line still
keeps popup calls separate, which is the split that actually earns its keep.

**How the number gets there.** `readPageNumber()` reads the page's first `tel:`
anchor, which Edge Inject has already rewritten server-side, so the popup opens
on the pool number with no flash. The anchor is also tagged, so the snippet's
MutationObserver re-swaps it if the session is assigned or rotated after the
popup was built. Tagging the `<a>` (never the inner `<span>`) is what the href
rewrite needs, and the rewriter edits only the matching text node, so the phone
icon survives.

Two failure modes are handled: a malformed or missing `tel:` anchor returns
`null` and the popup keeps the static `4146` line rather than rendering a broken
link, and a pool-exhausted page yields the page's `555-01xx` fallback, which is
unroutable by design (see "Fallback numbers" below).

`readPageNumber()` must run **before** the overlay is appended, or it matches the
popup's own anchor instead of the page's.

**Cache-bust is per-surface.** The clones are on `popup.js?v=6`; the 25 live
pages stay on `?v=5`. Bump only the surface you changed.

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
| Funnel | `+18336130264` | 900 | `+18135550157` |
| Thank You | `+18339370155` | 600 | `+18135550158` |

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
2. Keep the hardcoded `(813) 555-0157` / `0158` text and `href` as the fallback —
   it is what renders with JS off, when the pool is exhausted, and what crawlers
   see. Do not hand-edit the `href`; the swapper rewrites it. These are
   deliberately unroutable; see "Fallback numbers" below.
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

## Session enrichment (form data on the call)

Added 2026-09-17. Form fields are attached to the **DNI call session**, so a
buyer taking the call sees who they are talking to — not just the CRM lead.

Two calls, both guarded with `if (window.Sparrow && Sparrow.…)` because the
snippet loads `async`: a slow or blocked load must never break a form submit.

**`Sparrow.enrich({...})` on step-4 submit** sends the complete set at once.
**`Sparrow.setTag(k, v)` as fields are filled** is the one that earns its keep:
a visitor who taps the sticky call button on step 2 never reaches step 4, and
without the per-step tags their data would be lost. Tags persist in a
pool-scoped `localStorage` key for 30 minutes and flush on `pagehide` and on
phone tap, so a mid-form call still arrives with the data attached.

| Page | Captured |
|---|---|
| `/2/` + `/5/` landing | `intent` (+ `state` on `/2/`) |
| `/2/` step 1 | `dob` (only once valid), `citizen` |
| `/2/` step 2 | `addr`, `city`, `zip` |
| `/2/` step 3 | `income`, `employ` |
| `/2/` step 4 | `first_name`, `last_name`, `email`, `phone` live; full `enrich()` on submit |
| `/5/` step 1 | `dob` (only once valid) |
| `/5/` step 2 | `zip` |
| `/5/` step 3 | `phone` |
| `/5/` step 4 | `first_name`, `last_name`, `email` live; full `enrich()` on submit |
| `thank-you/2/` + `thank-you/5/` | full `enrich()` on load — **see below** |

Both landings also tag `click_id` on submit, and it rides along in every
`enrich()` call (see the PostbackX section below).

A partial date of birth is never tagged — it is worse than none.

### The thank-you pages must enrich too — tags are per pool session

This is not redundant with the step-4 `enrich()`. **Tags are stored per pool
session, and the thank-you page runs on a different pool:**

| Page | Pool |
|---|---|
| `/qualify/dni/{2,5}/*` (all steps) | `c7a9acee…` (funnel) |
| `/qualify/dni/thank-you/{2,5}/` | `26e71048…` (thank-you) |

A visitor gets **two separate sessions** on two different numbers. Form data
tagged during the funnel lands on the funnel session. A call placed from the
thank-you page arrives on the thank-you number, matches the thank-you session,
and sees none of it.

Observed live on 2026-09-17 (visitor `v_mu6154a3_kcpkuqn`, 19 seconds apart):

- `21:16:36` funnel pool → `buyerTags: {dob, phone, intent, caller_zip}` ✅
- `21:16:55` thank-you pool → `buyerTags: null`, and the call came in here ❌

Since most calls come from the thank-you page, the fix is to enrich there as
well. Both pages now do, reading `sessionStorage` first (what the visitor
actually typed) and falling back to URL params for a direct hit.

Two details that matter:

**It polls for `window.Sparrow`.** Every other call site hangs off a form
event, by which time the async snippet has loaded. The thank-you page has no
form interaction, so it retries every 250 ms for 10 seconds. Calling `enrich()`
before init is safe — it persists and `init()` sends the tags.

**Empty values are dropped before sending**, so a missing field never overwrites
a good value already on the session. `lead_id` is deliberately not sent: it is a
reserved key and would be stripped anyway.

### PostbackX click_id — click-to-call attribution

`click_id` ties a Propel/PostbackX click to the call it produced. It was being
created but never reaching calls, for three compounding reasons, all now fixed:

1. **It only existed on the entry page.** `PropelDirect` runs on the two clone
   landings only, never on a step or thank-you page.
2. **`_attribution.js` didn't carry it.** `click_id` was missing from
   `CLICK_IDS`, so it was dropped as the visitor advanced.
3. **The call lands on a different session anyway** — the thank-you pool. Same
   root cause as the form data above.

**How it is resolved.** `UBAttribution.clickId()` checks, in order:

1. `sessionStorage` (`ub{2,5}d_attr`) — already resolved earlier in the funnel
2. `?click_id=` — the redirect flow, present on the entry page immediately
3. `_propel_click_id` cookie, then its `localStorage` backup — the direct flow

It is resolved **lazily, not at page load**. On the direct flow `PropelDirect`
creates the click with an async POST, so at the moment `_attribution.js` runs on
the entry page the cookie does not exist yet. Resolving on demand (at form
submit, and on the thank-you page) is what makes the direct flow work. Once
found it is written back to `sessionStorage`, so the rest of the funnel no
longer depends on the cookie.

The cookie is `path=/` with a 30-day expiry, which is why the thank-you page can
recover a `click_id` even on a direct hit. The thank-you pages deliberately do
**not** load `_attribution.js` (that would record a bogus first touch); they
resolve from the same sources inline.

`click_id` is tagged on the landing at submit, sent in the step-4 `enrich()`,
and sent again from the thank-you page. It is **not** a reserved key, and it has
been added to both pools' `buyer_tag_allowlist` (now 15 keys), so it reaches
buyer pings as well as webhooks and postbacks.

Note `lead_id` **is** reserved and is stripped server-side, which is worth
knowing since the thank-you URLs carry one. Do not rely on it as a tag.

### ZIP is coerced with `String()`

A ZIP reached `customTags` as the number `80209` while `urlParams` held the
string `"80209"`, which makes buyer macros inconsistent. Every ZIP is now passed
through `String()` at each call site.

### Buyer visibility is a separate, deliberate gate

Webhooks, postbacks and call flows see these tags immediately. **RTB buyer pings
do not**, until the key is named on the pool's `settings.buyer_tag_allowlist`.
That gate exists so an arbitrary landing-page param cannot leak into a buyer
payload. Both test pools were set on 2026-09-17 to all 14 captured keys:

```
first_name, last_name, email, phone, zip, state, dob, intent, lp,
citizen, addr, city, income, employ
```

Buyers then reference them as `{{first_name}}`, `{{email}}` and so on. To change
it, use the dashboard (DNI pool → Settings → buyer tag allowlist); keys are
lowercased on save.

The allowlist deliberately mirrors the capture list exactly — everything these
pages collect is offered to buyers. Narrow it if a buyer should not receive a
given field; the tag keeps flowing to first-party surfaces either way.

Worth knowing before this pattern is copied to a **live** funnel: these keys
carry PII (name, email, date of birth, street address). On the test clones that
is the point. On a live funnel, the allowlist is the only thing standing between
a form field and every bidding buyer, so it should be narrowed to what each
buyer actually needs.

### Constraints

**Reserved keys are silently dropped.** `RESERVED_TAG_KEYS`
(`packages/shared/src/attribution-tags.ts`) belongs to the call itself:
`caller`, `caller_id`, `caller_number`, `caller_raw`, `called`, `dialed_number`,
`call_id`, `timestamp`, `campaign_id`, `tracking_number`, `publisher_id`,
`ping_id`, `transaction_id`, `token`, `lead_id` and similar. They are stripped
even if allowlisted. `phone` is fine; `caller_number` is not. The 14 keys sent
here were checked against that set — no collisions.

**Cap is 50 tags per session.** These pages send 14.

### Verifying

Load a funnel, **type into a field**, then in the console:

```js
Sparrow.getTags()
```

`{}` on a freshly loaded page is correct — it returns what has been captured so
far, and nothing has been entered yet. On the landings, `intent`/`state` are
tagged on submit rather than on click, so they appear only after continuing.

Then place a test call and confirm the tags appear on the call in the dashboard.
Check the **thank-you** session as well, since that is where most calls land.

If `Sparrow.getTags is not a function`, the browser is holding a cached copy of
the snippet (`max-age=86400`). Hard-reload.

### `matched_via: deferred_last_owner` is the weakest match

It means no click and no caller-history match were found, so the matcher fell
back to "most recent session that owned this number". It can be correct, but on
a shared number under load it can attach the wrong visitor's data. A
`matched_via: click` result is the one to aim for, and it requires the snippet
(not just Edge Inject) to be live on the page the visitor calls from.

## Follow-ups

### Propel/PostbackX reuses the live offer IDs — filter test clicks in reporting

Added 2026-09-17 on the two clone **landings only** (never the step or thank-you
pages), in `<head>` immediately after GTM, mirroring the live layout.

| Page | `offerId` | Same as |
|---|---|---|
| `/qualify/dni/2/` | `394159cb-34ac-4044-868e-37c846855f08` | `/qualify/2/` |
| `/qualify/dni/5/` | `cfe090d3-0159-402d-a346-dc29412f6aaa` | `/qualify/5/` |

Shared: `trackingId: 21e14abbc56d45469deb8a`, `apiUrl:
https://propel-lander-api.propelsys.workers.dev`.

**These are the live offer IDs, chosen deliberately over creating test offers.**
`direct-snippet.js` is not a passive beacon: `PropelDirect.init()` POSTs to
`/api/direct/track`, which writes a real row to Propel's `clicks` table stamped
with that `offer_id` and the campaign's `organization_id`
(`workers/lander-api/src/direct-tracking.ts`). There is no test or sandbox flag
in the payload or the schema. Every pageview of a clone landing is therefore a
**real click on a live offer**, inflating its click count and depressing its CTR.

**Exclude test clicks by path:**

```sql
WHERE landing_page_url NOT LIKE '%/qualify/dni/%'
```

`sanitizeLandingUrl()` keeps `origin + pathname` and strips everything except a
known-safe param allowlist, so the `/qualify/dni/` path always survives into
`landing_page_url`. That is the only thing distinguishing a test click from a
real one — there is no flag to key on.

Two mechanics were checked and are harmless: link rewriting only touches
`a[data-propel-link]` (none on these pages, so internal step navigation is
untouched), and form injection only adds a hidden `click_id` input, which
`/api/lead/` ignores.

Verified in jsdom on both clone landings: exactly one `/api/direct/track` POST
per load with the correct `offer_id`, the tracked URL carrying `/qualify/dni/`,
`tel:` anchors and `data-sparrow-*` markup untouched, and no link rewritten.

If the pollution becomes a problem, swap in two new test `offerId`s from the same
Propel org — that is the only change needed. See
`qualify/PROPEL-TRACKING-README.md`.

### Fallback numbers are deliberately unroutable

The fallback text and `href` are `(813) 555-0157` (funnel) and `(813) 555-0158`
(thank-you), and both pools' `default_number` matches. They are **not** the live
`4157` / `4158` lines, for two reasons.

**They dodge Google Forwarding Number.** GFN is live and fires container-wide;
see below. Its tags key off the *exact displayed number*, so a fallback that is
not a GFN target cannot be hijacked.

**They cannot ring a stranger.** `555-0100` through `555-0199` is the NANP block
reserved for fictional use, so it is unassignable. A genuinely random number
would be someone's real line, and every one of these is inside a `tel:` anchor a
tester may tap.

Consequence worth knowing: a fallback-path call **does not connect**. That is the
intent — if the pool fails you want an obvious dead end, not a silent fallthrough
to a live sales line that logs as organic. Buy dedicated routable 813 numbers
before any test that needs the fallback to actually answer.

### Google Forwarding Number is live and container-wide, but number-targeted

Confirmed by reading the published `GTM-WRGCMJLR` container on 2026-09-10. Three
call-conversion (`__awcc`) tags fire on **every** page (trigger is `gtm.init`
with no URL condition), including these clones:

| Tag | `phone_conversion_number` | Stage | On these pages? |
|-----|---------------------------|-------|-----------------|
| 6   | `(813) 820-4158`          | thank-you | no target present |
| 10  | `(813) 820-4157`          | funnel    | no target present |
| 14  | `(813) 820-4146`          | popup     | no target present (since `?v=6`) |

`__awcc` only rewrites anchors whose text matches its configured number. Since
the fallbacks moved to `555-01xx`, tags 6 and 10 have nothing to match on these
pages — in either the swapped state or the pool-exhausted state. That closes the
attribution hole that existed while the fallbacks were the live numbers.

**Tag 14 stopped matching when the popup was DNI-marked.** The popup used to be
the one remaining GFN target here, because it hardcoded `(813) 820-4146`. Now it
mirrors the page number (a pool number, or the `555-01xx` fallback), so no tag
has a target on these pages in any state. GFN is inert across the whole clone
surface; a popup call is now a DNI test call like any other.

On the **live** funnels tag 14 still owns `4146` exactly as before — the path
gate means nothing there changed.

Removing GFN entirely is the documented end state (see the migration guide).

## Rollback

Delete `qualify/dni/`, revert the two `thankYou()` lines in `api/lead.js` and the
`robots.txt` block. No live funnel file is modified by this work at any point.
