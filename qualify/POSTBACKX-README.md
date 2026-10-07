# PostbackX form postbacks

Only the live paid `/qualify/2/` and `/qualify/5/` funnels send these events.
Existing GTM, dataLayer events, phone links, Sparrow DNI, and consent behavior
are unchanged. The comparison funnels under `/qualify/dni/` do not send them.

- **`form_start`**: first real field input/change, or a valid submit after browser
  autofill. Not a page view, focus, phone click, or intermediate-step conversion.
  `/qualify/_postbackx.js` uses `UBAttribution.clickId()`, which resolves the
  PostbackX ID from the funnel's saved attribution, URL, or Propel cookie/storage.
  If the direct-tracking ID arrives late, the event waits up to 30 seconds per
  page and resumes on the next step or when the page is shown again.
  A sessionStorage marker suppresses repeats for that click across both funnels.
  The GET uses `keepalive` to survive navigation. Cross-origin responses are
  opaque, so delivery is best-effort; network failures can retry on the next
  page, but successful/opaque responses are not retried.
- **`form_submit`**: `/api/lead/` sends a server-side GET only after a successful
  2xx CRM response containing a lead ID. The final form submits the resolved
  PostbackX ID in a separate `postbackx_click_id` hidden field. Intermediate
  submits, invalid leads, missing CRM configuration, CRM failures, and direct
  thank-you visits do not count. CRM retries within one request result in one
  postback. Independent accepted submissions can each count again.
  The postback has a two-second timeout and no retries; a tracking failure does
  not prevent the thank-you redirect.

Both use `https://postbacks.postbackx.com/postback` with URL-encoded `click_id`
and `event_name=form_start` or `event_name=form_submit`. No postback is sent
without a PostbackX ID. No form values or personal contact details are included.

## Checks

```sh
node --test scripts/test-postbackx.js
```

The tests mock all fetches. They do not create CRM leads or send real postbacks.
Static local previews cannot exercise the Vercel lead endpoint.
