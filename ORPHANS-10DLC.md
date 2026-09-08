# Orphaned files and code — found during the 10DLC compliance work

Branch: `ub-10dlc-compliance-funnel`. Date: 2026-09-08.

This file is a reference for later cleanup. **The 10DLC branch does not change any
item below.** Each item needs your decision first.

---

## 1. Four unreachable pages in `/qualify/4/`

`/qualify/4/` holds two different funnel chains. Only one chain operates.

**The chain that operates** (3 steps). `/qualify/4/index.html` sends the user to it:

`index.html` → `step-1-dob.html` → `step-2-name-email.html` → `step-3-phone-tcpa.html`

**The chain that does not operate** (4 steps). It is a copy of the older `/qualify/2/`
full funnel. No page links to its first step:

| File | Status |
|---|---|
| `qualify/4/step-1-dob-citizen.html` | No inbound link. Unreachable. |
| `qualify/4/step-2-address.html` | Reachable only from the page above. |
| `qualify/4/step-3-income-employ.html` | Reachable only from the page above. |
| `qualify/4/step-4-contact.html` | Reachable only from the page above. |

These four pages are live URLs. A user cannot get to them from the site. They are
`noindex, nofollow`, thus search engines do not show them.

**We did not copy these four pages to `/qualify/0/`.** `/qualify/0/` has the 3-step
chain only.

**Recommendation:** delete the four pages. Test `/qualify/2/` first. `/qualify/2/`
holds the true full funnel, and the file names are the same.

---

## 2. `/qualify/4/` is now a candidate for retirement

You confirmed on 2026-09-08 that paid traffic goes to **`/qualify/2/`** and
**`/qualify/5/`**. `/qualify/4/` gets no paid traffic.

This branch moves all 342 main-site CTA links from `/qualify/4/` to `/qualify/0/`.
After the merge, `/qualify/4/` has no inbound traffic.

We keep `/qualify/4/` live, and we add the consent checkbox to it. This is a safety
net. If an advertisement still points at `/qualify/4/`, that traffic stays compliant.

**Recommendation:** watch `lp=qualify4` in the CRM for 30 days. If no lead arrives,
retire the funnel. Do not add a redirect before you check the advertisement
destinations.

---

## 3. The five `/lp/` pages discard the data that they collect

| Page | Form method and target |
|---|---|
| `/lp/cell-phone-discount/` | `method="get" action="/qualify/thank-you/"` |
| `/lp/free-government-phone/` | `method="get" action="/qualify/thank-you/"` |
| `/lp/heating-assistance/` | `method="get" action="/qualify/thank-you/"` |
| `/lp/medical-alert-medicaid/` | `method="get" action="/qualify/thank-you/"` |
| `/lp/save-on-electric-bill/` | `method="get" action="/qualify/thank-you/"` |

Each form collects a ZIP code and an email address. Each form then does a **GET to
the thank-you page**. No form sends data to `/api/lead/`. Thus:

- **No lead goes to the CRM.** The data goes into the URL, and then it is lost.
- The user sees the thank-you page. The user thinks that the application succeeded.

**This is not a 10DLC problem.** These pages collect **no telephone number**, and
they are all `noindex, nofollow`.

**But there is a second defect.** The consent text on each page says that the user
consents to contact *"at the phone number and email provided"*. The form has no
telephone field. The text does not agree with the form.

**Recommendation:** decide if these pages are live. If they are live, connect the
forms to `/api/lead/` and correct the consent text. If they are not live, delete
them.

---

## 4. Unused thank-you pages — check before you delete

| Page | Used by |
|---|---|
| `/qualify/thank-you/` | `/qualify/2/`, and the five `/lp/` forms |
| `/qualify/thank-you-4/` | `/qualify/4/` and **now `/qualify/0/`** |
| `/qualify/thank-you-5/` | `/qualify/5/` |
| `/qualify/thank-you-v2/` | No caller found in the repository. |
| `/qualify/thank-you-v3/` | No caller found in the repository. |

**Recommendation:** `thank-you-v2` and `thank-you-v3` have no caller in the code.
GTM or an advertisement could still use them. Check GTM before you delete them.
