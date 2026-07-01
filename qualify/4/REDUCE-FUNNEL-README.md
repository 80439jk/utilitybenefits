# `/qualify/4/` — Reduced funnel (branch `qualify4-reduced-funnel`)

Cuts funnel friction: **4 steps → 3**, and only asks for what's needed to route a
lead. Built on branch `qualify4-reduced-funnel` — **not merged to `main`, not live.**

## New flow

| Page | Collects | File |
|---|---|---|
| Landing `/qualify/4/` | **State** (auto-advances) | `index.html` (design unchanged; see "Landing changes") |
| Step 1 | **Date of birth** | `step-1-dob.html` |
| Step 2 | **First / Last / Email** | `step-2-name-email.html` |
| Step 3 (final) | **Phone + TCPA** → POSTs to `/api/lead/` | `step-3-phone-tcpa.html` |
| `/qualify/thank-you/` | — (shared, **unchanged**) | — |

**Dropped vs the old funnel:** citizenship, street address, city, ZIP, income, employment.

## What changed

### New step files (3)
`step-1-dob.html`, `step-2-name-email.html`, `step-3-phone-tcpa.html`. Cloned from the
old step styling; progress bars now read **"Step X of 3"** with 3 segments.

### Landing (`index.html`) — 2 functional edits, no visual/copy change
1. Form `action` now targets `/qualify/4/step-1-dob/` (was `step-1-dob-citizen`).
2. The existing `pageshow` handler now **resets the State dropdown + clears `ub2_state`**
   whenever the landing is shown (incl. Back / bfcache restore). This forces the user to
   re-select their state, which re-fires the auto-advance — fixing the "Back button strands
   the user with no way forward" issue.

### `/qualify/2/index.html` — same Back-button reset only
qualify/2 keeps its full 4-step funnel. The **only** change is the identical `pageshow`
state-reset (so its Back button behaves the same). Its steps are untouched.

### TCPA — checkbox removed (mirrors NBA `apply/3`)
The final step has **no consent checkbox**. Consent is given by clicking Submit; the
opening line reads *"By clicking the button below, I confirm…"*. The rest of UB's TCPA
wording is unchanged. A hidden `tcpa=1` field records consent; the full consent text is
still captured to `consent_text` for audit.

**TrustedForm:** unchanged (`use_tagged_consent=true`). The cert URL is still captured via
the `xxTrustedFormCertUrl` hidden field exactly as before. Removing the checkbox does not
affect cert capture — same pattern NBA uses on its checkbox-free step.
> If your TrustedForm/compliance setup specifically requires the consent block to be
> *tagged* a certain way, verify in the TrustedForm dashboard after the first test submit.

### `api/lead.js` — empty fields are pruned before the CRM call
New `pruneEmpty()` strips `null` / `''` / empty-array leaves from the payload **before**
signing + POSTing to Caliber. This guarantees the reduced funnel never sends a blank that
could **overwrite an existing value on a repeat contact** (Caliber merges on phone+email).
Full funnels (qualify2) populate every field, so nothing is stripped for them — behavior
is identical. Booleans (incl. `false`) and numbers (incl. `0`) are preserved.

### Lead tagging
The reduced funnel posts `lp=qualify4`, `v=reduced` (the old cloned step-4 mislabeled these
as `qualify2`/`A`). Use these to isolate reduced-funnel leads in Caliber reporting.

## sessionStorage keys
Kept the existing `ub2_*` keys (`ub2_state`, `ub2_dob`, `ub2_first`, `ub2_last`,
`ub2_email`, `ub2_phone`, `ub2_attr`) so the untouched landing's `ub2_state` write flows
straight through. Not renamed to `ub4_*` to avoid touching the landing's storage writes.

## Orphaned files — DO NOT DELETE YET (kept for rollback)
These old step files are **no longer linked** by the reduced funnel but are intentionally
left in place so we can revert qualify/4 to the current live 4-step funnel if needed:

- `qualify/4/step-1-dob-citizen.html`
- `qualify/4/step-2-address.html`
- `qualify/4/step-3-income-employ.html`
- `qualify/4/step-4-contact.html`

Once the reduced funnel is live and proven, these can be removed.

## Next step (separate task, per owner)
Switch **DOB → age**. That's deferred because it touches the CRM payload/back end:
- Step 1 would collect an age (single number) instead of a DOB.
- `api/lead.js` maps `dob → date_of_birth`; there is **no `age` field** today. Adding age
  means either sending a computed birth year via `dob`, or adding an `age` field to the
  payload **and** to the Caliber ingest mapping.
- Touch-points: `step-1-dob.html` (rename → `step-1-age`, change field + landing action),
  `step-3-phone-tcpa.html` (hidden `dob` → `age`), `api/lead.js` (payload mapping).

## Untouched
Thank-you page · `/qualify/2/` steps · `/api/lead/` core mapping logic · `/qualify/popup.js`
· `/lp/_shared.css` · all ~340 main-site CTA links (still point at `/qualify/4/`).
