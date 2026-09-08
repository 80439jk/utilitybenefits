# `/qualify/0/` — SMS / 10DLC Compliance Funnel

This funnel is a copy of the `/qualify/4/` chain. We made it to give a **compliant
SMS opt-in flow** for **10DLC registration**. It is on branch
**`ub-10dlc-compliance-funnel`**.

The main site sends all organic CTA traffic to this funnel. **Paid traffic goes to
`/qualify/2/` and `/qualify/5/`.** Those two funnels do not change.

A carrier agent who reviews the 10DLC campaign starts at utilitybenefits.com. The
agent follows a CTA to the form that collects the telephone number. That form must
show the consent text with a real checkbox. `/qualify/0/` does this.

## Flow

| Page | URL |
|---|---|
| Landing | `/qualify/0/` |
| Step 1 — date of birth | `/qualify/0/step-1-dob/` |
| Step 2 — name + email | `/qualify/0/step-2-name-email/` |
| Step 3 — telephone + consent (sends the lead) | `/qualify/0/step-3-phone-tcpa/` |
| Thank-you | `/qualify/thank-you-4/` (shared) |

The funnel uses the same lead endpoint (`/api/lead/`), the same payload, the same
GTM container (`GTM-WRGCMJLR`), and the same TrustedForm as `/qualify/4/`. Each page
has the GTM script and the `<noscript>` fallback. Each page loads the inactivity
popup (`/qualify/popup.js?v=5`). Each page has `noindex, nofollow`.

The funnel sends `lp=qualify0`. This value keeps the funnel separate in the CRM and
in GTM. The thank-you page sends the value to the dataLayer as `lp_slug`.

## The one difference from `/qualify/4/`

`step-3-phone-tcpa.html` has a **real consent checkbox** (`#tcpa`). Before, the page
had a hidden field with the value `1`. That field always told the server that the
user agreed. The user could not disagree.

**Before**
```html
<div class="tcpa-box">
  <p id="tcpa-text">By clicking the button below, you confirm…</p>
</div>
<!-- Consent is given by submitting (no checkbox). -->
<input type="hidden" name="tcpa" id="tcpa" value="1" />
```

**After**
```html
<div class="tcpa-box">
  <label for="tcpa">
    <input type="checkbox" id="tcpa" name="tcpa" value="1" />
    <span id="tcpa-text">By checking this box and clicking the button below, you confirm…</span>
  </label>
</div>
```

The consent text now starts with "By checking this box and clicking the button
below". This sentence agrees with the action that the user does.

## Consent language — different from the other funnels

`/qualify/0/` does **not** use the consent text from `/qualify/2/`, `/qualify/4/`
or `/qualify/5/`. Those funnels are lead generation. They ask the user to agree
that UtilityBenefits, **its service providers and its marketing partners** can
call, and that the telephone number **can be given to those partners**.

A carrier does not accept that text for 10DLC. SMS consent must name **one
sender**, and it must not permit the sale or transfer of the number.

The text on this page is the same as NBA `/apply/0/`, with the UB brand name:

- Consent is to be contacted by **UtilityBenefits only**. The text does not name
  service providers or marketing partners, and the number is not shared.
- The text does not say that the messages can include marketing messages.
- It says **express written consent**, not "express consent".
- It gives the message frequency: **up to 10 messages per month**.
- It gives both keywords: **STOP** to stop, and **HELP** for help.

The last two sentences are about **email** marketing. They are permitted to name
partners, because they are not part of the SMS consent.

**Do not copy the text from another funnel to this page.** Do not copy this text
to another funnel — the other funnels need their broader permission.

## Consent behavior (by design)

The checkbox is **clear by default**. The checkbox is **not `required`**. The
checkbox **does not disable the button**. The button gate reads the telephone
number only (`cta.disabled = !!prob`). Lead volume does not change.

- Box **selected** → the browser sends `tcpa=1` → the lead records
  `consent.given: true`. It is permitted to send an SMS to this lead.
- Box **clear** → the browser sends **no** `tcpa` field → `api/lead.js` reads
  `bool(b.tcpa) === true` as `false` → the lead records `consent.given: false`.
  The lead goes to the CRM, but do **not** send an SMS to this lead.

This is the same rule as NBA `/apply/0/`.

## The consent audit still operates

`api/lead.js` records the exact consent text with each lead. The page JavaScript
reads `$('tcpa-text').textContent`. The `id="tcpa-text"` stays on the `<span>`.
Thus the audit does not change.

## No new CSS

`_funnel.css` already has `.tcpa-box label` and `.tcpa-box input[type=checkbox]`.
`/qualify/4/` already draws the bordered box. The checkbox goes into the box that
the page already shows. No page gets a new border.

## Files that we did not copy

`/qualify/4/` contains four pages from the older full funnel:
`step-1-dob-citizen.html`, `step-2-address.html`, `step-3-income-employ.html`, and
`step-4-contact.html`. The landing page does not link to them. We did not copy them
to `/qualify/0/`. Refer to `/ORPHANS-10DLC.md`.

## Related

- NBA model funnel: `apply/0/` in the `nba3` repository.
- Routing change: `api/lead.js`, the `thankYou()` function.
- CTA repoint script: `scripts/redirect_cta_to_qualify0.py`.
