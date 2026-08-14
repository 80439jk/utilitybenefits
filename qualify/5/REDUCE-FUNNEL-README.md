# `/qualify/5/` — Lean phone-first funnel variant

A conversion-rate A/B variant of `/qualify/2/`, modeled on NBA's `apply/4`.
**Fewer fields per step.** Branch: **`qualify5-lean-funnel-variant`** — do **not**
merge to `main` until the A/B test is decided.

**Purely additive** (one small exception, noted below): only new files under
`qualify/5/` and a new `qualify/thank-you-5/` were created. Funnels `/qualify/2/`
and `/qualify/4/` and their thank-you pages were **not touched**, so this variant
cannot break the live funnels.

## The flow (5 screens + thank-you)

| Page | URL | Collects |
|---|---|---|
| Landing | `/qualify/5/` | **Need type only** (tiles). Continue enabled once ≥1 tile picked. *State removed; spacing added between tiles and the button.* |
| Step 1 | `/qualify/5/step-1-dob/` | **Date of birth only** + "Some programs vary by age." *Citizenship removed.* |
| Step 2 | `/qualify/5/step-2-zip/` | **ZIP only** + "Programs vary by location — this is how we find yours." *Street + city removed.* |
| Step 3 | `/qualify/5/step-3-phone/` | **Phone only** + "We will never call you without your permission." Full NANP/area-code validation. |
| Step 4 | `/qualify/5/step-4-name-email/` | **First name, last name, email** + TCPA consent + TrustedForm → **submits the lead** to `/api/lead/`. Heading: "A few more details about yourself" / "We promise we won't email you without your permission." *Phone moved to Step 3.* |
| Thank-you | `/qualify/thank-you-5/` | Case number + "Call now" CTA (see edits below). |

## Lead submission (same backend as funnel 2)

- Native form **POST to `/api/lead/`** on Step 4 — same mechanism as funnel 2 (server 302-redirects to the thank-you page). The lead fires **once, on the final step**, exactly like NBA `apply/4`.
- Fields no longer collected are sent as **blank strings** (`citizen`, `addr`, `city`, `income`, `employ`) — `/api/lead.js`'s `pruneEmpty()` drops them, so they can't overwrite existing CRM values on a repeat contact.
- **DOB is still collected**, so the CRM derives age normally.
- **State is backfilled from ZIP** at submit via an embedded `zipToState()` map (reused from NBA `apply/4`). Approximate at a few prefix boundaries; state is not load-bearing for the CRM.
- `lp=qualify5` is posted so `/api/lead.js` routes to `/qualify/thank-you-5/`.

## The one shared-file change (approved)

`api/lead.js` — added a single additive branch in `thankYou()`:
`lp==='qualify5' → '/qualify/thank-you-5/'`. It's a new `else-if`; funnels 2 and 4
never send `lp=qualify5`, so their behavior is unchanged.

## Thank-you-5 edits (per owner request)

1. Removed "A benefits case manager has been assigned to your file."
2. Main call button label "Call your case manager" → **"Call now"**.
3. Removed the entire "What your case manager will help with" section.
4. "Tap to call" now shows the real number: **"Tap to call (813) 820-4158"** (tappable, for call-conversion tracking).
5. (Minor) sticky-bar `aria-label` "Call your case manager" → "Call now".

Phone number reused: **(813) 820-4158** (`tel:+18138204158`) — the existing
completed-funnel line, so existing call-conversion actions fire by `tel:` value.

## Phone numbers (reused from funnel 2 — one per page)

- Started-funnel pill `tel:+18138204157` — landing + all steps.
- Completed-funnel `tel:+18138204158` — thank-you-5 only.
- Popup line — shared `/qualify/popup.js` (its own `tel:` inside).

---

## Orphaned / cosmetic / clean-up-later items

1. **`qualify/5/_attribution.js`** is a copy of funnel 2's file. Its header comment
   still says `/qualify/2/` and it uses the localStorage key **`ub2_attr`** (shared
   with funnel 2). Sharing the key is harmless (first-touch attribution persists across
   funnels), but rename to `ub5_attr` + fix the comment if you want strict isolation.
2. **`qualify/5/_funnel.css`** header comments (lines ~2 and ~344) still reference
   `/qualify/2/`. Cosmetic only.
3. **`qualify/thank-you-5/index.html`** still contains the `.ty-helps` CSS rules
   (the "what your case manager will help with" section was removed from the HTML but
   its CSS block is left in `<head>`). Dead CSS — safe to delete whenever convenient.
   The `<meta name="description">` also still mentions "case manager" (not user-visible;
   page is `noindex`).
4. **Same step *count* as funnel 2 (landing + 4).** The friction reduction is per-screen
   (fewer fields), not fewer screens. If a shorter funnel is wanted later, the DOB step
   is the obvious drop.
5. **Deviation from NBA `apply/4`: no honeypot / time-trap.** NBA's `apply/4` adds a
   honeypot (`hp_website`) + time-trap (`form_duration_ms`) on the submit step, processed
   by NBA's Supabase edge function. **UB's `/api/lead.js` has no such handling** — UB's
   bot protection is the server-side NANP phone + email validation (already in
   `/api/lead.js`). Adding client-only honeypot/time-trap fields here would be dead code,
   so they were intentionally omitted to keep parity with UB funnels 2 and 4. If you want
   them, add both the client fields **and** server handling in `/api/lead.js`.

## Before pointing ads here (owner / GTM tasks code can't do)

1. **GTM "Completed funnel" trigger must fire on `/qualify/thank-you-5/`.** If it's
   pinned to `/qualify/thank-you/`, add thank-you-5 or loosen it to "URL contains
   `thank-you`". Code alone can't move a conversion.
2. **Run one real end-to-end test lead** on the deployed variant and confirm it lands in
   the CRM with the correct phone, email, DOB, and ZIP-derived state.
3. Main-site CTAs still point at the existing funnel — repoint only if/when this variant wins.
