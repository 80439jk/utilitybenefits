# Form-submit caller enrichment

Both live paid funnels (`/qualify/2/` and `/qualify/5/`) submit to `/api/lead/`.
After a successful 2xx Caliber response containing a lead ID, that handler
deposits the captured form data only into the configured **10DLC campaign**,
alongside the existing PostbackX `form_submit` postback. It awaits all requests
before redirecting to thank-you. Requests run concurrently with two-second
timeouts and no automatic retries; failures do not prevent the redirect.

This is a **pre-call deposit**, not an update to an existing call. The incoming
call must present the lead's submitted E.164 caller number and reach the
10DLC campaign whose key received the deposit. A call from another phone,
a completed call, or a call arriving after expiry will not match. Existing browser
`Sparrow.enrich()` calls remain unchanged as complementary DNI tracking.

## Server-only configuration required

Save and enable a dedicated enrichment key in the **10DLC campaign's**
Enrichment tab. Store that key in the single server-only Vercel variable
`POSTBACKCALLS_ENRICHMENT_KEY`, then redeploy so Vercel loads it.

Both `/qualify/2/` and `/qualify/5/` send one deposit to this same campaign on
each accepted final submit. The page's DNI pool does not select an enrichment
destination. This does not add submit tracking to the `/qualify/0/` compliance
funnel or change any CTA destination.

Do not commit the key, expose it in client scripts, or put credential URLs in
logs. Missing/malformed configuration is skipped with a credential-free warning.
The old funnel/thank-you environment variables are not read; they cannot cause
additional campaign deposits. Keep the preview variable unset until a controlled
test is approved.

The code posts JSON to `https://api.postbackcalls.com/api/enrich/<key>` with
`Content-Type: application/json`, no query-string lead data, and redirects
disabled. It checks both HTTP success and JSON `ok: true`. Only
HTTP status and fixed reason codes are logged by this integration, never
credentials, caller numbers, form fields, or arbitrary response/error text.

## Data contract

`callerid` is the normalized lead phone. `source` is omitted so the enrichment
API uses its supported default, `api`; it is not a custom form-origin label.
Neither consumes a tag slot. These are the only allowed tags (maximum 20):

```text
click_id, first_name, last_name, email, phone, zip, state, dob, citizen,
addr, city, income, employ, intent, lp, tcpa_consent, consent_timestamp,
trusted_form, jornaya_lead_id, case_number
```

- `click_id` comes only from the final form's resolved `postbackx_click_id`.
  No Google/Meta/DNI-session identifier is substituted. If unavailable, the
  rest of the enrichment still sends; the PostbackX postback remains skipped.
- State, phone, and DOB use the validated/normalized Caliber payload.
- ZIP remains a string so leading zeroes survive.
- Optional fields are omitted when blank, non-scalar, or longer than 255
  characters. Overlong IDs/certificate URLs are omitted, never truncated.
- `tcpa_consent` is the actual checkbox boolean, including `false` on an
  unchecked optional box in funnel 5. This is not permission to SMS that lead.
- The form body, consent copy, CRM response, and marketing attribution blob
  are never forwarded wholesale.

Caller-enrichment tags may reach buyer macros independently of the DNI pool's
buyer tag allowlist. Configure this credential only for the 10DLC campaign
authorized to receive and disclose these fields. Deposits use the campaign's saved TTL,
30 minutes by default. For a delayed callback, the CRM/dialer should deposit
again immediately before calling rather than treating a form-time deposit as
permanent enrichment.

Comparison funnels, `/qualify/0/`, other funnels, intermediate step submits,
invalid leads, failed CRM requests, and direct thank-you visits do not deposit.
The PostbackX ID is still not added to the Caliber payload by this change.

## Validation and release

```sh
node --test scripts/test-postbackx.js
node --check api/lead.js
git diff --check
```

All fetches are mocked in the regression suite. No real postbacks, deposits,
CRM leads, or calls are generated. Static previews cannot execute `/api/lead/`.
Code merge/deployment alone does not enable enrichment: the 10DLC campaign's
key/settings and the single Vercel environment variable are separate release gates.

For an explicitly approved live acceptance test, first verify the matching
campaign and TTL, then submit one controlled lead and use the campaign's
`enrich-check` diagnostic to confirm tag keys and liveness. Verify the incoming
call claims the deposit and retains its `click_id` and actual consent boolean.
