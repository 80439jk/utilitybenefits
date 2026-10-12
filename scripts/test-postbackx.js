/* Offline regression tests. All CRM and PostbackX requests are mocked. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const tracking = fs.readFileSync(path.join(root, 'qualify/_postbackx.js'), 'utf8');

function browser(options = {}) {
  const storage = options.storage || new Map();
  const requests = [];
  const timers = new Map();
  const formListeners = {};
  const windowListeners = {};
  const documentListeners = {};
  let cid = options.clickId || '';
  let timerId = 0;
  const sessionStorage = {
    getItem(key) { if (options.blockStorage) throw new Error('blocked'); return storage.get(key) || null; },
    setItem(key, value) { if (options.blockStorage) throw new Error('blocked'); storage.set(key, value); }
  };
  const form = { addEventListener(type, fn) { formListeners[type] = fn; } };
  const document = {
    getElementById: () => options.noForm ? null : form,
    addEventListener(type, fn) { documentListeners[type] = fn; }
  };
  const window = {
    location: { pathname: options.pathname || '/qualify/2/', search: options.search || '' },
    UBAttribution: { clickId: () => cid },
    addEventListener(type, fn) { windowListeners[type] = fn; },
    fetch(url, init) {
      requests.push({ url, init });
      return options.rejectFetch ? Promise.reject(new Error('offline')) : Promise.resolve({});
    }
  };
  const context = vm.createContext({
    window, document, sessionStorage, URLSearchParams, navigator: {}, localStorage: { getItem: () => null },
    Date, setInterval(fn) { timers.set(++timerId, fn); return timerId; },
    clearInterval(id) { timers.delete(id); }
  });
  if (options.attribution) {
    document.cookie = options.cookie || '';
    document.referrer = '';
    window.location.href = 'https://example.test' + window.location.pathname + window.location.search;
    context.localStorage.getItem = () => options.localClickId || '';
    vm.runInContext(fs.readFileSync(path.join(root, `qualify/${options.attribution}/_attribution.js`), 'utf8'), context);
  }
  vm.runInContext(tracking, context);
  return {
    requests, storage, timers,
    setClickId(value) { cid = value; },
    tick() { for (const fn of [...timers.values()]) fn(); },
    event(type, overrides = {}) {
      if (formListeners[type]) formListeners[type]({
        isTrusted: true, defaultPrevented: false,
        target: { tagName: 'INPUT', type: 'checkbox' }, ...overrides
      });
    },
    page(type) { if (windowListeners[type]) windowListeners[type](); },
    visibility() { if (documentListeners.visibilitychange) documentListeners.visibilitychange(); }
  };
}

function checkRequest(request, event, id) {
  const url = new URL(request.url);
  assert.equal(url.origin + url.pathname, 'https://postbacks.postbackx.com/postback');
  assert.equal(url.searchParams.get('click_id'), id);
  assert.equal(url.searchParams.get('event_name'), event);
  assert.deepEqual([...url.searchParams.keys()], ['click_id', 'event_name']);
  assert.equal(request.init.method, 'GET');
}

for (const variant of ['2', '5']) {
  test(`funnel ${variant}: no passive starts; input sends one encoded ID`, () => {
    const page = browser({ pathname: `/qualify/${variant}/`, clickId: 'pbx+/&?=test' });
    page.page('pageshow');
    page.visibility();
    assert.equal(page.requests.length, 0);
    page.event('change');
    page.event('input');
    page.event('submit');
    page.page('pagehide');
    assert.equal(page.requests.length, 1);
    checkRequest(page.requests[0], 'form_start', 'pbx+/&?=test');
    assert.equal(page.requests[0].init.keepalive, true);
    assert.equal(page.requests[0].init.mode, 'no-cors');
    assert.equal(page.requests[0].init.referrerPolicy, 'no-referrer');
  });

  test(`funnel ${variant}: pending start survives navigation until the ID exists`, () => {
    const landing = browser({ pathname: `/qualify/${variant}/` });
    landing.event('input');
    landing.tick();
    assert.equal(landing.requests.length, 0);
    const next = browser({
      pathname: `/qualify/${variant}/step-1-dob/`, storage: landing.storage, clickId: 'late-id'
    });
    assert.equal(next.requests.length, 1);
    checkRequest(next.requests[0], 'form_start', 'late-id');
    const back = browser({ pathname: `/qualify/${variant}/`, storage: landing.storage, clickId: 'late-id' });
    back.event('change');
    assert.equal(back.requests.length, 0);
  });

  for (const source of ['url', 'cookie', 'localStorage', 'saved']) {
    test(`funnel ${variant}: resolves real PostbackX attribution from ${source}`, () => {
      const storage = new Map();
      const options = { pathname: `/qualify/${variant}/`, attribution: variant, storage };
      if (source === 'url') options.search = '?click_id=source-id&gclid=wrong-id';
      if (source === 'cookie') options.cookie = '_propel_click_id=source-id';
      if (source === 'localStorage') options.localClickId = 'source-id';
      if (source === 'saved') storage.set(`ub${variant}d_attr`, JSON.stringify({ click_id: 'source-id', click_timestamp: 'saved' }));
      const page = browser(options);
      page.event('change');
      checkRequest(page.requests[0], 'form_start', 'source-id');
    });
  }
}

test('waits for a late direct-flow ID without sending an empty ID', () => {
  const page = browser();
  page.event('input');
  assert.equal(page.requests.length, 0);
  page.setClickId('late-direct');
  page.tick();
  assert.equal(page.requests.length, 1);
  checkRequest(page.requests[0], 'form_start', 'late-direct');
});

test('never substitutes another provider click ID', () => {
  const page = browser({ attribution: '2', search: '?gclid=google&fbclid=meta' });
  page.event('input');
  page.tick();
  assert.equal(page.requests.length, 0);
});

test('ignores synthetic events, hidden fields, and invalid submits', () => {
  const page = browser({ clickId: 'ignored' });
  page.event('input', { isTrusted: false });
  page.event('change', { target: { tagName: 'INPUT', type: 'hidden' } });
  page.event('change', { target: { tagName: 'BUTTON', type: 'submit' } });
  page.event('submit', { defaultPrevented: true });
  assert.equal(page.requests.length, 0);
});

test('valid autofill submit counts as start, never as form_submit', () => {
  const page = browser({ clickId: 'autofill' });
  page.event('submit');
  assert.equal(page.requests.length, 1);
  checkRequest(page.requests[0], 'form_start', 'autofill');
});

test('deduplicates a click across both funnels but allows a new click after interaction', () => {
  const first = browser({ clickId: 'shared-click' });
  first.event('change');
  const second = browser({ pathname: '/qualify/5/', storage: first.storage, clickId: 'shared-click' });
  second.event('input');
  assert.equal(second.requests.length, 0);
  const newClick = browser({ storage: first.storage, clickId: 'new-click' });
  assert.equal(newClick.requests.length, 0);
  newClick.event('change');
  assert.equal(newClick.requests.length, 1);
});

test('storage restrictions do not break interaction and deduplication on the current page', () => {
  const page = browser({ clickId: 'blocked-storage', blockStorage: true });
  page.event('input');
  page.event('change');
  assert.equal(page.requests.length, 1);
});

test('network failure can retry on the next page without a same-page retry loop', async () => {
  const page = browser({ clickId: 'offline-id', rejectFetch: true });
  page.event('change');
  await Promise.resolve();
  page.event('input');
  page.page('pageshow');
  assert.equal(page.requests.length, 1);
  const next = browser({ storage: page.storage, clickId: 'offline-id' });
  assert.equal(next.requests.length, 1);
});

test('comparison funnels and pages without forms never track starts', () => {
  for (const pathname of ['/qualify/dni/2/', '/qualify/0/', '/qualify/thank-you-2/', '/qualify/20/']) {
    const page = browser({ pathname, clickId: 'unused' });
    page.event('change');
    assert.equal(page.requests.length, 0);
  }
  assert.equal(browser({ noForm: true, clickId: 'unused' }).requests.length, 0);
});

function apiSandbox(options = {}) {
  const requests = [];
  const warnings = [];
  const response = { statusCode: 200, headers: {} };
  const context = vm.createContext({
    module: { exports: {} },
    require,
    process: { env: options.noEnv ? {} : {
      CALIBER_HMAC_SECRET: 'mock-secret', CALIBER_ANON_KEY: 'mock-key', ...options.env
    } },
    console: { log() {}, warn(...args) { warnings.push(args); }, error() {} },
    AbortSignal,
    async fetch(url, init) {
      requests.push({ url, init });
      if (url.startsWith('https://api.postbackcalls.com/api/enrich/')) {
        if (options.onEnrichment) await options.onEnrichment(url, init);
        if (options.enrichmentTimeout) {
          await new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
          });
        }
        if (options.enrichmentThrows) throw new Error('private-error-with-key-and-lead-data');
        return {
          ok: !options.enrichmentStatus || options.enrichmentStatus < 400,
          status: options.enrichmentStatus || 200,
          async json() {
            if (options.enrichmentMalformed) throw new SyntaxError('private-response');
            return { ok: options.enrichmentOk === undefined ? true : options.enrichmentOk };
          }
        };
      }
      if (url.startsWith('https://postbacks.postbackx.com/')) {
        if (options.onPostback) await options.onPostback(url, init);
        if (options.postbackThrows) throw new Error('mock network failure');
        return { ok: options.postbackStatus ? options.postbackStatus < 400 : true, status: options.postbackStatus || 200 };
      }
      if (options.crmThrows) throw new Error('mock CRM failure');
      const status = options.crmRetry && requests.length === 1 ? 500 : options.crmStatus || 200;
      return { status, text: async () => JSON.stringify(options.noLeadId ? {} : { lead_id: 'mock-lead' }) };
    }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'api/lead.js'), 'utf8'), context);
  const res = {
    setHeader(key, value) { response.headers[key] = value; },
    status(code) { response.statusCode = code; return this; },
    send(value) { response.body = value; return this; },
    redirect(code, url) { response.statusCode = code; response.location = url; return this; }
  };
  return {
    requests, response, warnings,
    run(body = {}, method = 'POST') {
      return context.module.exports({
        method, headers: {}, body: {
          first: 'Test', last: 'Only', phone: '8138204157', email: 'test@example.com',
          lp: 'qualify2', dni: '1', postbackx_click_id: 'api+/&id', ...body
        }
      }, res);
    }
  };
}

for (const variant of ['2', '5']) {
  test(`funnel ${variant}: accepted CRM lead sends one server form_submit`, async () => {
    const api = apiSandbox();
    await api.run({ lp: `qualify${variant}`, tcpa: variant === '2' ? '1' : undefined });
    assert.equal(api.requests.length, 2);
    checkRequest(api.requests[1], 'form_submit', 'api+/&id');
    assert(api.requests[1].init.signal);
    assert(api.response.location.startsWith(`/qualify/thank-you-${variant}/`));
    assert.equal(api.response.statusCode, 302);
    const payload = JSON.parse(api.requests[0].init.body);
    assert.equal(payload.consent.given, variant === '2');
    assert(!api.requests[0].init.body.includes('postbackx_click_id'));
    assert(!api.response.location.includes('api+/&id'));
  });
}

for (const [label, options, body] of [
  ['invalid phone', {}, { phone: '123' }],
  ['invalid email', {}, { email: 'invalid' }],
  ['missing environment', { noEnv: true }, {}],
  ['CRM error', { crmStatus: 400 }, {}],
  ['CRM 500', { crmStatus: 500 }, {}],
  ['CRM network failure', { crmThrows: true }, {}],
  ['missing lead ID', { noLeadId: true }, {}],
  ['missing PostbackX ID', {}, { postbackx_click_id: '' }],
  ['non-string PostbackX ID', {}, { postbackx_click_id: ['wrong'] }],
  ['Google click ID only', {}, { postbackx_click_id: '', gclid: 'wrong', click_id: 'not-used' }],
  ['comparison funnel', {}, { dni: '0' }],
  ['compliance funnel', {}, { lp: 'qualify0' }],
  ['other funnel', {}, { lp: 'qualify4' }]
]) {
  test(`does not count form_submit for ${label}`, async () => {
    const api = apiSandbox(options);
    await api.run(body);
    assert.equal(api.requests.filter(r => r.url.startsWith('https://postbacks.postbackx.com/')).length, 0);
    assert.equal(api.response.statusCode, 302);
  });
}

test('CRM retry success produces just one form_submit postback', async () => {
  const api = apiSandbox({ crmRetry: true });
  await api.run();
  assert.equal(api.requests.length, 3);
  checkRequest(api.requests[2], 'form_submit', 'api+/&id');
});

const ENRICHMENT_ENV = {
  POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY: 'enr_' + 'a'.repeat(64),
  POSTBACKCALLS_THANK_YOU_ENRICHMENT_KEY: 'enr_' + 'b'.repeat(64)
};
function deposits(api) {
  return api.requests.filter(r => r.url.startsWith('https://api.postbackcalls.com/api/enrich/'));
}
function depositTags(request) {
  const payload = JSON.parse(request.init.body);
  const { callerid, source, ...tags } = payload;
  assert.equal(callerid, '+18138204157');
  assert.equal(source, 'utilitybenefits_form');
  return tags;
}

for (const variant of ['2', '5']) {
  test(`funnel ${variant}: submit deposits approved form fields and PBX ID in both campaigns`, async () => {
    const api = apiSandbox({ env: ENRICHMENT_ENV });
    await api.run({
      lp: `qualify${variant}`, first: ' Jane ', last: ' Doe ', phone: '(813) 820-4157',
      zip: '01234', state: 'Florida', dob: '12/25/1980', citizen: 'U.S. citizen',
      addr: '123 Example St', city: 'Example City', income: 'Under $20,000',
      employ: 'Employed', intent: 'energy,internet_phone', tcpa: variant === '2' ? '1' : undefined,
      consent_timestamp: '2026-10-12T12:00:00.000Z',
      xxTrustedFormCertUrl: 'https://cert.example.test/certificate',
      leadid_token: 'test-jornaya-id', postbackx_click_id: ' pbx+/&id ',
      gclid: 'do-not-forward', arbitrary_field: 'do-not-forward'
    });
    const requests = deposits(api);
    assert.equal(requests.length, 2);
    assert.equal(api.requests.length, 4);
    assert.deepEqual(requests.map(r => r.url), [
      'https://api.postbackcalls.com/api/enrich/' + ENRICHMENT_ENV.POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY,
      'https://api.postbackcalls.com/api/enrich/' + ENRICHMENT_ENV.POSTBACKCALLS_THANK_YOU_ENRICHMENT_KEY
    ]);
    for (const request of requests) {
      assert.equal(new URL(request.url).search, '');
      assert.equal(request.init.method, 'POST');
      assert.equal(request.init.headers['Content-Type'], 'application/json');
      assert.equal(request.init.redirect, 'error');
      assert.equal(request.init.cache, 'no-store');
      assert(request.init.signal);
      const tags = depositTags(request);
      assert.equal(Object.keys(tags).length, 20);
      assert.deepEqual(tags, {
        click_id: 'pbx+/&id', first_name: 'Jane', last_name: 'Doe', email: 'test@example.com',
        phone: '+18138204157', zip: '01234', state: 'FL', dob: '1980-12-25',
        citizen: 'U.S. citizen', addr: '123 Example St', city: 'Example City',
        income: 'Under $20,000', employ: 'Employed', intent: 'energy,internet_phone',
        lp: `qualify${variant}`, tcpa_consent: variant === '2',
        consent_timestamp: '2026-10-12T12:00:00.000Z',
        trusted_form: 'https://cert.example.test/certificate',
        jornaya_lead_id: 'test-jornaya-id', case_number: tags.case_number
      });
      assert(/^UB-2026-\d{7}$/.test(tags.case_number));
    }
    assert.equal(api.response.statusCode, 302);
    assert(api.response.location.startsWith(`/qualify/thank-you-${variant}/`));
    assert(!api.requests[0].init.body.includes('postbackx_click_id'));
  });
}

test('missing PBX ID does not discard enrichment or substitute another click ID', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV });
  await api.run({ postbackx_click_id: '', gclid: 'google-id', click_id: 'untrusted-other-id' });
  assert.equal(deposits(api).length, 2);
  assert.equal(api.requests.length, 3);
  assert(!('click_id' in depositTags(deposits(api)[0])));
});

test('omits blanks, non-scalar values, and overlong tags without truncating identifiers', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV });
  await api.run({
    citizen: ' ', zip: ['not-a-scalar'], addr: 'x'.repeat(256), city: { invalid: true },
    income: '', employ: null, dob: 'invalid', postbackx_click_id: 'c'.repeat(256),
    xxTrustedFormCertUrl: 'https://cert.example.test/' + 'x'.repeat(255),
    leadid_token: { invalid: true }, intent: 'x'.repeat(255), tcpa: '0'
  });
  const tags = depositTags(deposits(api)[0]);
  for (const key of ['citizen', 'zip', 'addr', 'city', 'income', 'employ', 'dob', 'click_id', 'trusted_form', 'jornaya_lead_id']) {
    assert(!(key in tags), key);
  }
  assert.equal(tags.intent.length, 255);
  assert.equal(tags.tcpa_consent, false);
});

test('accepts normalized E.164 phone input that already includes the country code', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV });
  await api.run({ phone: '+1 (813) 820-4157' });
  assert.equal(deposits(api).length, 2);
  depositTags(deposits(api)[0]);
  assert.equal(JSON.parse(api.requests[0].init.body).contact.phone, '+18138204157');
});

for (const scope of ['FUNNEL', 'THANK_YOU']) {
  test(`only the configured ${scope} campaign receives a deposit`, async () => {
    const keyName = `POSTBACKCALLS_${scope}_ENRICHMENT_KEY`;
    const api = apiSandbox({ env: { [keyName]: '  ' + ENRICHMENT_ENV[keyName] + '  ' } });
    await api.run();
    assert.equal(deposits(api).length, 1);
    assert(deposits(api)[0].url.endsWith(ENRICHMENT_ENV[keyName]));
  });
}

test('deduplicates an accidentally repeated campaign key', async () => {
  const api = apiSandbox({ env: {
    POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY: ENRICHMENT_ENV.POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY,
    POSTBACKCALLS_THANK_YOU_ENRICHMENT_KEY: ENRICHMENT_ENV.POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY
  } });
  await api.run();
  assert.equal(deposits(api).length, 1);
});

test('missing or malformed configuration never sends or logs campaign credentials', async () => {
  const api = apiSandbox({ env: { POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY: 'private-invalid-key' } });
  await api.run();
  assert.equal(deposits(api).length, 0);
  assert.equal(api.requests.length, 2);
  assert(!JSON.stringify(api.warnings).includes('private-invalid-key'));
  assert(api.warnings.some(w => w[1]?.reason === 'invalid_configuration'));
  assert(api.warnings.some(w => w[1]?.reason === 'not_configured'));
});

for (const [label, options, body] of [
  ['invalid phone', {}, { phone: '123' }],
  ['invalid email', {}, { email: 'invalid' }],
  ['missing CRM configuration', { noEnv: true }, {}],
  ['CRM rejects lead', { crmStatus: 400 }, {}],
  ['CRM fails twice', { crmStatus: 500 }, {}],
  ['CRM throws', { crmThrows: true }, {}],
  ['CRM omits lead ID', { noLeadId: true }, {}],
  ['comparison funnel', {}, { dni: '0' }],
  ['compliance funnel', {}, { lp: 'qualify0' }],
  ['inactive funnel', {}, { lp: 'qualify3' }],
  ['safety-net funnel', {}, { lp: 'qualify4' }]
]) {
  test(`does not enrich ${label}`, async () => {
    const api = apiSandbox({ env: ENRICHMENT_ENV, ...options });
    await api.run(body);
    assert.equal(deposits(api).length, 0);
    assert.equal(api.response.statusCode, 302);
  });
}

test('CRM retry success produces one deposit per configured campaign', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV, crmRetry: true });
  await api.run();
  assert.equal(deposits(api).length, 2);
  assert.equal(api.requests.length, 5);
});

for (const [label, options] of [
  ['network failure', { enrichmentThrows: true }],
  ['HTTP rejection', { enrichmentStatus: 401 }],
  ['rate limit', { enrichmentStatus: 429 }],
  ['HTTP 200 with ok:false', { enrichmentOk: false }],
  ['HTTP 200 with string ok', { enrichmentOk: 'true' }],
  ['malformed JSON', { enrichmentMalformed: true }]
]) {
  test(`enrichment ${label} never blocks redirect or exposes data in its logs`, async () => {
    const api = apiSandbox({ env: ENRICHMENT_ENV, ...options });
    await api.run();
    assert.equal(deposits(api).length, 2);
    assert.equal(api.response.statusCode, 302);
    assert(api.response.location.includes('lead_id=mock-lead'));
    const warnings = api.warnings.filter(w => w[0] === 'postbackcalls-enrichment-failed');
    assert.equal(warnings.length, 2);
    const text = JSON.stringify(warnings);
    for (const secret of [...Object.values(ENRICHMENT_ENV), '8138204157', 'test@example.com', 'api+/&id', 'private-error', 'private-response']) {
      assert(!text.includes(secret));
    }
  });
}

test('one failed campaign does not prevent the other campaign from receiving enrichment', async () => {
  const api = apiSandbox({
    env: ENRICHMENT_ENV,
    onEnrichment(url) {
      if (url.endsWith(ENRICHMENT_ENV.POSTBACKCALLS_FUNNEL_ENRICHMENT_KEY)) throw new Error('private-campaign-error');
    }
  });
  await api.run();
  assert.equal(deposits(api).length, 2);
  assert.equal(api.warnings.filter(w => w[0] === 'postbackcalls-enrichment-failed').length, 1);
  assert.equal(api.response.statusCode, 302);
});

test('PostbackX failure does not prevent caller enrichment', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV, postbackThrows: true });
  await api.run();
  assert.equal(deposits(api).length, 2);
  assert.equal(api.response.statusCode, 302);
});

test('stalled enrichment requests abort within the two-second deadline', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV, enrichmentTimeout: true });
  // AbortSignal.timeout uses an unref'd timer. Keep this offline test alive
  // long enough to observe cancellation, without making any real requests.
  const guard = setTimeout(() => {}, 4000);
  try {
    await api.run();
    assert.equal(deposits(api).length, 2);
    assert(deposits(api).every(r => r.init.signal.aborted));
    assert.equal(api.response.statusCode, 302);
    assert.equal(api.warnings.filter(w => w[0] === 'postbackcalls-enrichment-failed').length, 2);
  } finally {
    clearTimeout(guard);
  }
});

test('all submit tracking runs concurrently and finishes before redirect', async () => {
  const releases = [];
  const hold = () => new Promise(resolve => releases.push(resolve));
  const api = apiSandbox({ env: ENRICHMENT_ENV, onPostback: hold, onEnrichment: hold });
  const completion = api.run();
  // Advance only mocked microtasks, with no network or wall-clock waiting.
  for (let n = 0; n < 10; n++) await Promise.resolve();
  assert.equal(api.requests.length, 4);
  assert.equal(releases.length, 3);
  assert.equal(api.response.location, undefined);
  for (const release of releases) release();
  await completion;
  assert.equal(api.response.statusCode, 302);
});

test('non-POST requests never enrich even when credentials are configured', async () => {
  const api = apiSandbox({ env: ENRICHMENT_ENV });
  await api.run({}, 'GET');
  assert.equal(api.requests.length, 0);
  assert.equal(api.response.statusCode, 405);
});

for (const options of [{ postbackThrows: true }, { postbackStatus: 500 }]) {
  test(`postback failure does not affect lead success (${JSON.stringify(options)})`, async () => {
    const api = apiSandbox(options);
    await api.run();
    assert.equal(api.requests.length, 2);
    assert.equal(api.response.statusCode, 302);
    assert(api.response.location.includes('lead_id=mock-lead'));
  });
}

test('non-POST requests perform no external requests', async () => {
  const api = apiSandbox();
  await api.run({}, 'GET');
  assert.equal(api.requests.length, 0);
  assert.equal(api.response.statusCode, 405);
});

test('all ten live pages load tracking after attribution with intact GTM and plain phone links', () => {
  for (const variant of ['2', '5']) {
    const dir = path.join(root, 'qualify', variant);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
    assert.equal(files.length, 5);
    for (const file of files) {
      const html = fs.readFileSync(path.join(dir, file), 'utf8');
      const tag = '<script defer src="/qualify/_postbackx.js?v=1"></script>';
      assert(html.includes(tag), file);
      assert(html.indexOf(`/_attribution.js?v=4`) < html.indexOf(tag), file);
      assert(html.includes("'dataLayer','GTM-WRGCMJLR'"), file);
      assert(html.includes('ns.html?id=GTM-WRGCMJLR'), file);
      assert(html.includes('api.trustedform.com'), file);
      for (const a of html.matchAll(/<a\b[^>]*href="tel:[^"]*"[^>]*>/g)) {
        assert(!/onclick|preventDefault/.test(a[0]), file);
      }
      if (file.startsWith('step-4-')) {
        assert.equal((html.match(/name="postbackx_click_id"/g) || []).length, 1);
        assert(html.includes("$('a_postbackx_click_id').value = attr.click_id || '';"));
      }
    }
  }
});
