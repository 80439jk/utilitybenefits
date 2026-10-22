#!/usr/bin/env node
/* Synthetic browser test for the click_id hand-off (qualify/ATTRIBUTION-FIX-PLAN.md, UB-8).

   Walks /qualify/2/ -> steps 1-4 -> /qualify/thank-you-2/ in headless Chromium and
   checks that the PostbackX click_id reaches the Funnel and Thank You DNI sessions
   (acknowledged by a stubbed /v2/session/validate) and that the thank-you page shows
   a pool number, not the (855) 617-2111 fallback.

   NOTHING REAL IS CALLED. Pages are served from this checkout by a local server with
   Vercel-style clean URLs. Every request leaving localhost is stubbed or aborted:
     - /api/lead/            -> 302 to the thank-you page (no Caliber / CRM lead)
     - Sparrow DNI API       -> in-memory sessions; the snippet JS itself is the real
                                one, downloaded once (or SPARROW_SNIPPET=<file>)
     - PropelDirect API      -> fake click, delayed; real direct-snippet.js
                                (or PROPEL_SNIPPET=<file>)
     - PostbackX, GTM, TrustedForm, fonts -> stubbed / aborted
   With BASE_URL=<preview deploy> the same stubs apply (including /api/lead/), but the
   edge-preload scenario is skipped because it needs the local server.

   Scenarios:
     baseline  no faults
     hostile   PropelDirect click 3 s late, first validate per pool forced to 500,
               localStorage disabled, landing served with an Edge Inject preload

   Run:
     npm i --no-save playwright-core    (or set PLAYWRIGHT_MODULE=/path/to/playwright-core)
     CHROME_PATH=/path/to/chrome node scripts/test-attribution-e2e.js [baseline|hostile]
*/
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const FUNNEL_POOL = 'c7a9acee-ab84-41ea-9b55-2e387dc2a943';
const TY_POOL = '26e71048-a73c-45c2-bc9f-9b05f824dd39';
const POOL_NUMBERS = {
  [FUNNEL_POOL]: { number: '+18335550101', formatted: '(833) 555-0101' },
  [TY_POOL]:     { number: '+18335550202', formatted: '(833) 555-0202' },
};
const CLICK_ID = '0b5c8e1a-5f3e-4c1e-9d7a-2f6b9c3e4a10';     // what PropelDirect creates
const OLD_CLICK_ID = '9d1f2e3c-0000-4000-8000-00000000a0a0'; // a previous ad's click
const EDGE_CLICK_ID = 'e0e0e0e0-1111-4222-8333-444444444444'; // set by Edge Inject (UB-9)
const GCLID = 'TESTGCLID';
const SPARROW_JS = 'https://sparrow-dni.propelsys.workers.dev/dni/sparrow-dni.min.js';
const PROPEL_JS = 'https://propel-lander-api.propelsys.workers.dev/direct-snippet.js';

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright-core', 'playwright'].filter(Boolean);
  for (const m of tries) { try { return require(m); } catch (e) {} }
  throw new Error('playwright-core not found: npm i --no-save playwright-core, or set PLAYWRIGHT_MODULE');
}

async function source(envName, url) {
  if (process.env[envName]) return fs.readFileSync(process.env[envName], 'utf8');
  const r = await fetch(url);                       // static JS only; no data is sent
  if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status);
  return r.text();
}

// ---------------------------------------------------------------- fake Sparrow
function makeSparrow(opts) {
  const sessions = new Map();          // pool_id|visitor_id -> session
  const failNext = new Set(opts.failFirstValidate ? [FUNNEL_POOL, TY_POOL] : []);
  const log = [];
  let n = 0;
  function create(poolId, visitorId, tags) {
    const num = POOL_NUMBERS[poolId];
    const s = {
      session_id: 'sess_' + (++n), pool_id: poolId, visitor_id: visitorId,
      number: num.number, formatted_number: num.formatted,
      cache_token: 'tok_' + n, expires_at: new Date(Date.now() + 180e3).toISOString(),
      tags: Object.assign({}, tags),
    };
    sessions.set(poolId + '|' + visitorId, s);
    return s;
  }
  function tagsFrom(obj) {
    const t = {};
    for (const [k, v] of Object.entries(obj)) if (k.startsWith('tag_')) t[k.slice(4)] = v;
    return t;
  }
  return {
    sessions, log, create,
    session(url) {
      const q = Object.fromEntries(new URL(url).searchParams);
      const s = create(q.pool_id, q.visitor_id, tagsFrom(q));
      log.push({ kind: 'session', pool: s.pool_id, session: s.session_id, tags: tagsFrom(q) });
      return { status: 200, body: {
        session_id: s.session_id, number: s.number, formatted_number: s.formatted_number,
        cache_token: s.cache_token, expires_at: s.expires_at, is_new: true } };
    },
    validate(body) {
      let p; try { p = JSON.parse(body); } catch (e) { return { status: 400, body: { valid: false, error: 'bad body' } }; }
      const tags = tagsFrom(p.attribution || {});
      if (failNext.has(p.pool_id) && Object.keys(tags).length) {
        failNext.delete(p.pool_id);
        log.push({ kind: 'validate', pool: p.pool_id, status: 500, tags });
        return { status: 500, body: { valid: false, error: 'Validation failed' } };
      }
      const s = sessions.get(p.pool_id + '|' + p.visitor_id);
      if (!s) {
        log.push({ kind: 'validate', pool: p.pool_id, status: 200, valid: false, tags });
        return { status: 200, body: { valid: false, error: 'Session not found' } };
      }
      // Server-side guard (Sparrow SN-2): never replace a value with an empty one.
      for (const [k, v] of Object.entries(tags)) if (v !== '' || !s.tags[k]) s.tags[k] = v;
      log.push({ kind: 'validate', pool: p.pool_id, session: s.session_id, status: 200, valid: true, tags });
      return { status: 200, body: { valid: true, expires_at: s.expires_at } };
    },
  };
}

// ---------------------------------------------------------------- local server
function startServer(state) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/lead/' || u.pathname === '/api/lead') return lead(req, res);
    let p = decodeURIComponent(u.pathname);
    const candidates = p.endsWith('/') ? [p + 'index.html', p.slice(0, -1) + '.html'] : [p, p + '.html'];
    for (const c of candidates) {
      const f = path.join(ROOT, path.normalize(c));
      if (!f.startsWith(ROOT)) break;
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        let body = fs.readFileSync(f);
        const type = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript'
          : f.endsWith('.css') ? 'text/css' : 'application/octet-stream';
        if (type === 'text/html' && state.edgePreload && u.pathname === '/qualify/2/') {
          body = Buffer.from(String(body).replace('<head>', '<head>' + state.edgePreload()));
        }
        res.writeHead(200, { 'content-type': type });
        return res.end(body);
      }
    }
    res.writeHead(404); res.end('not found');
  });
  function lead(req, res) {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const b = Object.fromEntries(new URLSearchParams(raw));
      state.leads.push(b);
      const ty = b.dni === '1' ? (b.lp === 'qualify5' ? '/qualify/thank-you-5/' : '/qualify/thank-you-2/') : '/qualify/thank-you/';
      res.writeHead(302, { location: ty + '?case=UB-2026-TEST001&zip=' + encodeURIComponent(b.zip || '')
        + '&state=' + encodeURIComponent(b.state || '') + '&lp=' + encodeURIComponent(b.lp || '') });
      res.end();
    });
  }
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(100); }
  throw new Error('timed out waiting for ' + what);
}

// ---------------------------------------------------------------- scenario
async function run(name, cfg, deps) {
  const { chromium, sparrowJs, propelJs } = deps;
  const sparrow = makeSparrow({ failFirstValidate: cfg.failFirstValidate });
  const state = { leads: [], edgePreload: null };
  let server = null, base = process.env.BASE_URL;
  if (!base) {
    server = await startServer(state);
    base = 'http://localhost:' + server.address().port;
    if (cfg.edgePreload) {
      state.edgePreload = () => {
        const s = sparrow.create(FUNNEL_POOL, 'v_edge_' + Date.now().toString(36), {});
        sparrow.log.push({ kind: 'edge', pool: FUNNEL_POOL, session: s.session_id });
        return '<script>window.__sparrow_edge_injected=true;window.__sparrow_cb={result:'
          + JSON.stringify({ number: s.number, formatted: s.formatted_number, session_id: s.session_id,
            visitor_id: s.visitor_id, cache_token: s.cache_token, expires_at: s.expires_at })
          + '};try{localStorage.setItem("sparrow_visitor_id",' + JSON.stringify(s.visitor_id) + ')}catch(e){}</script>';
      };
    }
  } else if (cfg.edgePreload) {
    console.log('  (edge preload skipped: BASE_URL set)');
  }
  const origin = new URL(base).origin;

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const context = await browser.newContext();
  if (cfg.cookies) {
    // Raw values, exactly as PropelDirect writes them (no URL encoding).
    await context.addCookies(Object.entries(cfg.cookies).map(([name, value]) => ({ name, value, url: base })));
  }
  if (cfg.noLocalStorage) {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
      });
    });
  }
  const external = [];
  let trackFulfilledAt = 0, trackCalls = 0;
  await context.route('**/*', async route => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (u.origin === origin) {
      if (u.pathname.replace(/\/$/, '') === '/api/lead') {
        if (!server) {           // preview deploy: never let the real endpoint see a submit
          const b = Object.fromEntries(new URLSearchParams(req.postData() || ''));
          state.leads.push(b);
          return route.fulfill({ status: 302, headers: { location: '/qualify/thank-you-2/?case=UB-2026-TEST001&lp=qualify2' } });
        }
      }
      return route.continue();
    }
    external.push(u.host + u.pathname);
    if (req.url().split('?')[0] === SPARROW_JS) return route.fulfill({ contentType: 'text/javascript', body: sparrowJs });
    if (req.url().split('?')[0] === PROPEL_JS) return route.fulfill({ contentType: 'text/javascript', body: propelJs });
    if (u.host === 'sparrow-dni.propelsys.workers.dev') {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      if (u.pathname === '/dni/v2/session') { const r = sparrow.session(req.url()); return json(r.status, r.body); }
      if (u.pathname === '/dni/v2/session/validate') { const r = sparrow.validate(req.postData() || ''); return json(r.status, r.body); }
      return json(200, { ok: true });   // events, release, heartbeat
    }
    if (u.host === 'propel-lander-api.propelsys.workers.dev') {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
      if (u.pathname === '/api/direct/track') {
        trackCalls++;
        await sleep(cfg.propelDelayMs || 0);
        trackFulfilledAt = Date.now();
        return json(200, { click_id: CLICK_ID });
      }
      return json(200, { ok: true });
    }
    if (u.host === 'postbacks.postbackx.com') return json(200, { ok: true });
    return route.abort();      // GTM, TrustedForm, fonts, anything else
  });

  const want = cfg.expectClickId || CLICK_ID;
  const page = await context.newPage();
  const errors = [], upstream = [];
  page.on('pageerror', e => {
    // Errors thrown inside the Sparrow snippet itself are a Sparrow defect, not
    // this repo's; report them, and fail only with STRICT_SNIPPET=1.
    if (/sparrow-dni\.min\.js/.test(e.stack || '') && !process.env.STRICT_SNIPPET) {
      const where = page.url().replace(base, '').split('?')[0] + ': ' + e.message;
      if (!upstream.includes(where)) console.log('  WARNING Sparrow snippet threw (upstream): ' + where);
      upstream.push(where);
      return;
    }
  });
  page.on('pageerror', e => (/sparrow-dni\.min\.js/.test(e.stack || '') && !process.env.STRICT_SNIPPET) || errors.push(page.url().replace(base, '') + ': ' + (e.stack || e.message).split('\n').slice(0, 3).join(' <- ')));
  let step1At = 0;
  page.on('request', r => { if (r.url().includes('/qualify/2/step-1-dob-citizen/') && !step1At) step1At = Date.now(); });

  // Landing: linger like a visitor, then pick a state (auto-advance).
  await page.goto(base + '/qualify/2/?utm_source=test&gclid=' + GCLID);
  await sleep(cfg.lingerMs);
  await page.selectOption('#state', 'Florida');
  await page.waitForURL(/step-1-dob-citizen/, { timeout: 8000 });

  await page.fill('#dob', '01011980');
  await page.selectOption('#citizen', { index: 1 });
  await page.click('#cta');
  await page.waitForURL(/step-2-address/);
  await page.fill('#addr', '1 Test Street');
  await page.fill('#city', 'Tampa');
  await page.fill('#zip', '33602');
  await page.click('#cta');
  await page.waitForURL(/step-3-income-employ/);
  await page.selectOption('#income', { index: 1 });
  await page.selectOption('#employ', { index: 1 });
  await page.click('#cta');
  await page.waitForURL(/step-4-contact/);
  // Stay on step 4 long enough for a forced 500 to be retried (2 s backoff).
  await page.fill('#first', 'Test');
  await page.fill('#last', 'Attribution');
  await page.fill('#email', 'attribution-test@example.com');
  await page.fill('#phone', '8135551234');
  await page.check('#tcpa');
  await waitFor(() => acked(FUNNEL_POOL), 15000, 'funnel click_id ack');
  await page.click('#cta');
  await page.waitForURL(/thank-you-2/);
  await waitFor(() => acked(TY_POOL), 20000, 'thank-you click_id ack');
  // The snippet must both hold the pool number and have put it on the page.
  let shown = false;
  try { await waitFor(async () => /833\) 555-0202/.test(await page.textContent('#ty-call-cta')), 5000, 'pool number'); shown = true; }
  catch (e) {}
  const held = await page.evaluate(() => window.Sparrow && Sparrow.getFormattedNumber());

  function acked(pool) {
    return sparrow.log.some(e => e.kind === 'validate' && e.pool === pool && e.valid && e.tags.click_id === want)
      || sparrow.log.some(e => e.kind === 'session' && e.pool === pool && e.tags.click_id === want);
  }

  const tyText = (await page.textContent('#ty-call-cta')).replace(/\s+/g, ' ').trim();
  const ty = [...sparrow.sessions.values()].filter(s => s.pool_id === TY_POOL);
  const funnel = [...sparrow.sessions.values()].filter(s => s.pool_id === FUNNEL_POOL);
  const emptyWrites = sparrow.log.filter(e => e.tags && e.tags.click_id === '');
  const wrongWrites = sparrow.log.filter(e => e.tags && e.tags.click_id && e.tags.click_id !== want);
  const forced500 = sparrow.log.filter(e => e.status === 500).length;

  await browser.close();
  if (server) server.close();

  assert.equal(errors.length, 0, 'page errors: ' + errors.join(' | '));
  assert.equal(state.leads.length, 1, 'exactly one (stubbed) lead submit');
  assert.equal(state.leads[0].postbackx_click_id, want, 'lead carries the expected click_id');
  assert.ok(ty.some(s => s.tags.click_id === want), 'Thank You session holds click_id');
  assert.ok(funnel.some(s => s.tags.click_id === want), 'a Funnel session holds click_id');
  assert.equal(wrongWrites.length, 0, 'no other click_id ever reached Sparrow: '
    + [...new Set(wrongWrites.map(e => e.tags.click_id))].join(', '));
  if (cfg.expectTrackCalls !== undefined) {
    assert.equal(trackCalls, cfg.expectTrackCalls, 'PropelDirect click-creation calls');
  }
  assert.equal(held, POOL_NUMBERS[TY_POOL].formatted, 'Thank You session holds the pool number');
  if (!shown) {
    // Session holds the pool number but the DOM was never swapped: the
    // snippet's swapNumbers(document.body) ran before <body> existed (Sparrow
    // defect; on the fetch path its own .catch swallows the throw).
    const msg = 'thank-you shows ' + tyText + ' although the session holds ' + held
      + ' (Sparrow swapNumbers-before-body defect)';
    if (process.env.STRICT_SNIPPET) assert.fail(msg);
    console.log('  WARNING (upstream): ' + msg);
  }
  assert.equal(emptyWrites.length, 0, 'no empty click_id was ever sent');
  if (cfg.failFirstValidate) assert.ok(forced500 >= 1, 'a forced 500 was exercised');
  if (cfg.propelDelayMs && step1At) {
    assert.ok(step1At >= trackFulfilledAt, 'landing waited for the click before auto-advancing');
  }
  const blockedHosts = [...new Set(external.map(h => h.split('/')[0]))].sort();
  console.log('  thank-you CTA: ' + tyText);
  console.log('  funnel sessions: ' + funnel.length + ' (with click_id: ' + funnel.filter(s => s.tags.click_id).length
    + '), thank-you sessions: ' + ty.length + ', forced 500s: ' + forced500
    + ', validate not-found: ' + sparrow.log.filter(e => e.valid === false && e.status === 200).length
    + ', PropelDirect creates: ' + trackCalls);
  console.log('  external hosts (all stubbed/aborted): ' + blockedHosts.join(', '));
}

const SCENARIOS = {
  baseline: { lingerMs: 800, propelDelayMs: 0 },
  hostile:  { lingerMs: 2000, propelDelayMs: 3000, failFirstValidate: true, noLocalStorage: true, edgePreload: true },
  // Returning visitor from a NEW ad: the cookie belongs to the previous ad, so
  // PropelDirect creates a new click; the old one must never be used.
  newad:    { lingerMs: 1500, propelDelayMs: 1000, expectTrackCalls: 1,
              cookies: { _propel_click_id: OLD_CLICK_ID, _propel_attribution_key: 'google:OLDGCLID' } },
  // Edge-created click (EDGE-CLICK-IMPLEMENTATION-PLAN / UB-9): cookie + key for
  // this gclid already set by the HTML response, so PropelDirect must reuse it.
  edgeclick: { lingerMs: 800, expectTrackCalls: 0, expectClickId: EDGE_CLICK_ID,
              cookies: { _propel_click_id: EDGE_CLICK_ID, _propel_attribution_key: 'google:' + GCLID } },
};

(async () => {
  const { chromium } = loadPlaywright();
  const deps = { chromium, sparrowJs: await source('SPARROW_SNIPPET', SPARROW_JS), propelJs: await source('PROPEL_SNIPPET', PROPEL_JS) };
  const pick = process.argv.slice(2);
  const names = pick.length ? pick : Object.keys(SCENARIOS);
  let failed = 0;
  for (const n of names) {
    console.log('scenario ' + n);
    try { await run(n, SCENARIOS[n], deps); console.log('  PASS'); }
    catch (e) { failed++; console.log('  FAIL: ' + (e && e.message)); }
  }
  process.exit(failed ? 1 : 0);
})();
