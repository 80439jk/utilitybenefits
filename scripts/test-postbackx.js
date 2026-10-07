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
  const response = { statusCode: 200, headers: {} };
  const context = vm.createContext({
    module: { exports: {} },
    require,
    process: { env: options.noEnv ? {} : { CALIBER_HMAC_SECRET: 'mock-secret', CALIBER_ANON_KEY: 'mock-key' } },
    console: { log() {}, warn() {}, error() {} },
    AbortSignal,
    async fetch(url, init) {
      requests.push({ url, init });
      if (url.startsWith('https://postbacks.postbackx.com/')) {
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
    requests, response,
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
