/* /api/lead — Caliber Leads ingest proxy for the /qualify/2/ funnel.
 *
 * Receives an application/x-www-form-urlencoded POST from
 * /qualify/2/step-4-contact, builds the Caliber payload
 * (consent / contact / attribution / extended), HMAC-signs it, posts it,
 * then 302s to /qualify/thank-you/ with the case# for hydration.
 *
 * Secrets read from env vars — never hardcode:
 *   CALIBER_HMAC_SECRET   HMAC signing secret (from Caliber Partner Guide)
 *   CALIBER_ANON_KEY      Supabase anon key   (sent as `apikey` header)
 *   CALIBER_ENDPOINT      (optional) override the default ingest URL
 *
 * On any failure the user still gets redirected to the thank-you page so
 * the call-back experience isn't broken; the failure is logged for ops.
 */

const crypto = require('crypto');

const DEFAULT_ENDPOINT = 'https://dblgxzhlxcviknamnskj.supabase.co/functions/v1/ingest/utility-benefits';

// ------------------------------- Mappers ------------------------------- //
function mapIncome(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.indexOf('under $20') !== -1 || s.indexOf('under $25') !== -1 || s.indexOf('under $30') !== -1) return 'lt_25k';
  if (s.indexOf('$20') !== -1 && s.indexOf('35') !== -1) return '25_50k';
  if (s.indexOf('$25') !== -1 && s.indexOf('50') !== -1) return '25_50k';
  if (s.indexOf('$35') !== -1 && s.indexOf('55') !== -1) return '50_75k';
  if (s.indexOf('$50') !== -1 && s.indexOf('75') !== -1) return '50_75k';
  if (s.indexOf('$55') !== -1 && s.indexOf('80') !== -1) return '75_100k';
  if (s.indexOf('$75') !== -1 && s.indexOf('100') !== -1) return '75_100k';
  if (s.indexOf('$80') !== -1 || s.indexOf('over $80') !== -1) return 'gt_150k';
  if (s.indexOf('$100') !== -1 && s.indexOf('150') !== -1) return '100_150k';
  if (s.indexOf('over $100') !== -1 || s.indexOf('over $150') !== -1) return 'gt_150k';
  return null;
}

function mapEmployment(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.indexOf('full') !== -1) return 'full_time';
  if (s.indexOf('part') !== -1) return 'part_time';
  if (s.indexOf('self') !== -1) return 'self_employed';
  if (s.indexOf('unemploy') !== -1) return 'unemployed';
  if (s.indexOf('retired') !== -1) return 'retired';
  if (s.indexOf('disab') !== -1) return 'unemployed';
  if (s.indexOf('student') !== -1) return 'unemployed';
  return null;
}

function mapCitizenship(v) {
  if (!v) return null;
  const s = String(v).toLowerCase();
  if (s.indexOf('u.s. citizen') !== -1 || s.indexOf('us citizen') !== -1 || s.indexOf('u.s. national') !== -1) return 'us_citizen';
  if (s.indexOf('lawful') !== -1 || s.indexOf('qualifying') !== -1 || s.indexOf('immigrant') !== -1 || s.indexOf('other') !== -1) return 'non_us_citizen';
  return null;
}

function mapIntentToUtilities(v) {
  if (!v) return [];
  const arr = String(v).split(',').map(function (s) { return s.trim(); });
  const out = [];
  arr.forEach(function (i) {
    if (i === 'electric') out.push('electric');
    else if (i === 'gas') out.push('gas');
    else if (i === 'internet_phone') out.push('internet');
  });
  return out;
}

function mapIntentToPrimaryInterest(v) {
  if (!v) return [];
  const arr = String(v).split(',').map(function (s) { return s.trim(); });
  // The Caliber primary_interest enum doesn't have utility-specific values,
  // so any utility intent maps to "other"; gas/electric also fits "financial_help"
  // when paired with the household-income data.
  const out = [];
  let hasUtility = false;
  arr.forEach(function (i) {
    if (i === 'electric' || i === 'gas' || i === 'internet_phone') hasUtility = true;
    if (i === 'other') out.push('other');
  });
  if (hasUtility) out.unshift('financial_help');
  return Array.from(new Set(out));
}

function normalizeDob(v) {
  if (!v) return null;
  const d = String(v).replace(/[^0-9]/g, '');
  if (d.length !== 8) return null;
  const mm = d.substring(0, 2), dd = d.substring(2, 4), yyyy = d.substring(4, 8);
  return yyyy + '-' + mm + '-' + dd;
}

function normalizePhone(v) {
  if (!v) return null;
  const d = String(v).replace(/[^0-9]/g, '');
  if (d.length !== 10) return null;
  return '+1' + d;
}

function genCaseNumber() {
  const seed = Date.now() % 1000000;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  const n = String(seed).padStart(4, '0') + String(rand).slice(-3);
  return 'UB-2026-' + n.slice(-7);
}

function bool(v) {
  if (v === true || v === 'true' || v === '1' || v === 1 || v === 'on') return true;
  if (v === false || v === 'false' || v === '0' || v === 0) return false;
  if (v === '' || v == null) return null;
  return null;
}

function nullable(v) {
  return v === undefined || v === null || v === '' ? null : v;
}

function maskCaseHash(s) {
  if (!s) return '';
  return String(s).slice(0, 4) + '…';
}

// ------------------------------- Handler ------------------------------- //
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const b = req.body || {};
  const HMAC_SECRET = process.env.CALIBER_HMAC_SECRET || '';
  const ANON_KEY    = process.env.CALIBER_ANON_KEY    || '';
  const ENDPOINT    = process.env.CALIBER_ENDPOINT    || DEFAULT_ENDPOINT;

  // ---- Build the Caliber payload ----
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress) || '';
  const ua = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';
  const consentTs = b.consent_timestamp || new Date().toISOString();

  const payload = {
    consent: {
      given: bool(b.tcpa) === true,
      text: nullable(b.consent_text)
        || 'By submitting, I agree to be contacted by UtilityBenefits and partners at the phone number and email provided, including via autodialed calls and SMS. Consent is not a condition of any service.',
      timestamp: consentTs,
      ip: ip || null,
      user_agent: ua || null,
      url: nullable(b.landing_page) || referer || null,
      trustedform_cert_url: nullable(b.xxTrustedFormCertUrl),
      jornaya_leadid: nullable(b.leadid_token)
    },
    contact: {
      first_name: nullable(b.first),
      last_name:  nullable(b.last),
      email:      nullable(b.email),
      phone:      normalizePhone(b.phone),
      state:      nullable(b.state),
      zip:        nullable(b.zip)
    },
    attribution: {
      utm_source:   nullable(b.utm_source),
      utm_medium:   nullable(b.utm_medium),
      utm_campaign: nullable(b.utm_campaign),
      utm_term:     nullable(b.utm_term),
      utm_content:  nullable(b.utm_content),
      gclid:        nullable(b.gclid),
      gbraid:       nullable(b.gbraid),
      wbraid:       nullable(b.wbraid),
      fbclid:       nullable(b.fbclid),
      ttclid:       nullable(b.ttclid),
      msclkid:      nullable(b.msclkid),
      li_fat_id:    nullable(b.li_fat_id),
      twclid:       nullable(b.twclid),
      epik:         nullable(b.epik),
      click_timestamp:           nullable(b.click_timestamp),
      consent_ad_storage:         bool(b.consent_ad_storage),
      consent_ad_user_data:       bool(b.consent_ad_user_data),
      consent_ad_personalization: bool(b.consent_ad_personalization),
      referrer:     nullable(b.referrer),
      landing_page: nullable(b.landing_page)
    },
    extended: {
      // Demographics
      date_of_birth: normalizeDob(b.dob),
      citizenship:   mapCitizenship(b.citizen),

      // Income / employment
      annual_household_income_range: mapIncome(b.income),
      employment_status:             mapEmployment(b.employ),

      // Utilities / intent
      utility_behind_types:               mapIntentToUtilities(b.intent),
      interested_in_assistance_programs:  true,

      // Intent (high-level)
      primary_interest: mapIntentToPrimaryInterest(b.intent),

      // Address detail (above what fits in contact.*)
      address_line_1: nullable(b.addr),
      city:           nullable(b.city),

      // Raw audit passthrough — what they actually selected
      raw_intent:     nullable(b.intent),
      raw_income:     nullable(b.income),
      raw_employment: nullable(b.employ),
      raw_citizen:    nullable(b.citizen),

      // Funnel identifiers
      lp:         nullable(b.lp) || 'qualify2',
      lp_variant: nullable(b.v)  || 'A'
    }
  };

  const caseNum = genCaseNumber();
  const reqId = (typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : (Date.now() + '-' + Math.random().toString(36).slice(2, 10));

  // Build redirect URL first — we always redirect, even on Caliber failure
  function thankYou(extra) {
    let url = '/qualify/thank-you/?case=' + encodeURIComponent(caseNum)
      + '&zip=' + encodeURIComponent(b.zip || '')
      + '&lp='  + encodeURIComponent(b.lp || 'qualify2')
      + '&v='   + encodeURIComponent(b.v  || 'A');
    if (extra && extra.lead_id) url += '&lead_id=' + encodeURIComponent(extra.lead_id);
    return url;
  }

  // Bail out early if env vars not configured — still redirect to thank-you
  if (!HMAC_SECRET || !ANON_KEY) {
    console.warn('caliber-skip', {
      reason: 'env vars not configured',
      has_secret: !!HMAC_SECRET,
      has_anon: !!ANON_KEY,
      case: caseNum,
      x_request_id: reqId
    });
    return res.redirect(302, thankYou());
  }

  // Sign + POST
  const body = JSON.stringify(payload);
  const ts = new Date().toISOString();
  const sig = 'sha256=' + crypto.createHmac('sha256', HMAC_SECRET).update(ts + '.' + body).digest('hex');

  async function post(attempt) {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'x-timestamp': ts,
        'x-signature': sig,
        'x-request-id': reqId
      },
      body: body
    });
    return r;
  }

  let leadId = null;
  let statusCode = 0;
  let rawBody = '';
  let errMsg = null;
  try {
    let resp = await post(1);
    statusCode = resp.status;
    if (resp.status >= 500 && resp.status < 600) {
      resp = await post(2);
      statusCode = resp.status;
    }
    rawBody = await resp.text();
    let parsed = {};
    try { parsed = JSON.parse(rawBody); } catch (e) { /* non-JSON body */ }
    if (parsed && parsed.lead_id) leadId = parsed.lead_id;

    console.log('caliber-response', {
      status: statusCode,
      lead_id: leadId,
      x_request_id: reqId,
      case: caseNum,
      body_preview: rawBody.slice(0, 400)
    });
  } catch (err) {
    errMsg = err && err.message;
    console.error('caliber-error', { error: errMsg, x_request_id: reqId, case: caseNum });
  }

  // Debug mode: return JSON instead of redirecting (for smoke tests).
  // Trigger by setting ?debug=1 on the request URL or x-debug: 1 header.
  const isDebug = (req.query && req.query.debug === '1') || req.headers['x-debug'] === '1';
  if (isDebug) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(JSON.stringify({
      case: caseNum,
      caliber_status: statusCode,
      caliber_lead_id: leadId,
      caliber_body: rawBody,
      caliber_error: errMsg,
      x_request_id: reqId,
      thank_you_url: thankYou({ lead_id: leadId }),
      payload_preview: {
        consent_given: payload.consent.given,
        contact: payload.contact,
        attribution_keys_set: Object.keys(payload.attribution).filter(function(k){ return payload.attribution[k] != null; }),
        extended_keys_set: Object.keys(payload.extended).filter(function(k){ return payload.extended[k] != null && !(Array.isArray(payload.extended[k]) && payload.extended[k].length === 0); })
      }
    }, null, 2));
  }

  return res.redirect(302, thankYou({ lead_id: leadId }));
};

// Vercel function config
module.exports.config = {
  maxDuration: 10
};
