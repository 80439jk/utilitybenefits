# Form-submit caller enrichment

Both live paid funnels (`/qualify/2/` and `/qualify/5/`) submit to `/api/lead/`.
After a successful 2xx Caliber response containing a lead ID, that handler
deposits the captured form data into each configured PostbackCalls campaign,
alongside the existing PostbackX `form_submit` postback. It awaits all requests
before redirecting to thank-you. Requests run concurrently with two-second
timeouts and no automatic retries; failures do not prevent the redirect.

This is a **pre-call deposit**, not an update to an existing call. The incoming
call must present the lead's submitted E.164 caller number and reach the
campaign whose key received the deposit. A call from another phone, a completed
call, or a call arriving after expiry will not match. Existing browser
`Sparrow.enrich()` calls remain unchanged as complementary DNI tracking.

## Server-only configuration required

Save and enable a dedicated enrichment key in each campaign's Enrichment tab.
Then set the corresponding Vercel environment variable:

| Variable | Campaign | Pages whose calls it covers |
| --- | --- | --- |
| `POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY` | UB Funnel | Landing and steps of both live funnels |
| `POSTBACKCALLS_THANK_YOU_ENRICHMENT_KEY` | UB Thank You Page | Both live thank-you pages |

Do not commit these keys, expose them in client scripts, or put credential URLs
in logs. Missing/malformed keys are skipped with a credential-free warning.
Identical keys are sent only once, but using one campaign's key twice does not
cover two different campaigns. Each configured scope is attempted independently.
Keep preview environment variables unset until a controlled test is approved.
After setting production variables, redeploy so Vercel loads them.

The code posts JSON to `https://api.postbackcalls.com/api/enrich/<key>` with
`Content-Type: application/json`, no query-string lead data, and redirects
disabled. It checks both HTTP success and JSON `ok: true`. Only scope,
HTTP status, and fixed reason codes are logged by this integration, never
credentials, caller numbers, form fields, or arbitrary response/error text.

## Data contract

`callerid` is the normalized lead phone and `source` is `utilitybenefits_form`.
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
buyer tag allowlist. Configure these credentials only for campaigns authorized
to receive and disclose these fields. Deposits use the campaign's saved TTL,
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
Code merge/deployment alone does not enable enrichment: campaign keys/settings
and Vercel environment variables are separate release gates.

For an explicitly approved live acceptance test, first verify the matching
campaign and TTL, then submit one controlled lead and use the campaign's
`enrich-check` diagnostic to confirm tag keys and liveness. Verify the incoming
call claims the deposit and retains its `click_id` and actual consent boolean.
