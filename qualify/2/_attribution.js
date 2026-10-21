/*  /qualify/2/ — first-touch attribution capture
    Loads on every funnel page. Captures click IDs + UTMs + landing context
    on the first hit, then preserves them across all 5 steps via sessionStorage.
    Step 4 reads these out and ships them to /api/lead → Caliber.

    Click IDs covered:
      Google Ads:  gclid · gbraid · wbraid
      Meta:        fbclid
      TikTok:      ttclid
      Microsoft:   msclkid
      LinkedIn:    li_fat_id
      X:           twclid
      Pinterest:   epik
      PostbackX:   click_id  (see clickId() below)
*/
(function () {
  var KEY = 'ub2d_attr';
  var CLICK_IDS = ['gclid','gbraid','wbraid','fbclid','ttclid','msclkid','li_fat_id','twclid','epik','click_id'];
  var UTMS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];

  function load(){
    try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function save(d){
    try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  }

  var stored = load();
  var params = new URLSearchParams(window.location.search);
  var firstTouch = !stored.click_timestamp;

  // PostbackX attribution key of THIS ad click. Same rule as PropelDirect's
  // getAttributionKey(): axon:<aleid|alart|axwrt|axon_event_id|event_id>, else
  // google:<gclid|gbraid|wbraid>, else ''. A _propel_click_id cookie belongs to
  // this visit only if its _propel_attribution_key matches; otherwise it is the
  // previous ad's click and PropelDirect is about to create a new one.
  function attrKey(p){
    var a = p.get('aleid') || p.get('alart') || p.get('axwrt') ||
            p.get('axon_event_id') || p.get('event_id');
    if (a) return 'axon:' + a;
    var g = p.get('gclid') || p.get('gbraid') || p.get('wbraid');
    return g ? 'google:' + g : '';
  }
  var urlKey = attrKey(params);

  if (firstTouch) {
    var d = {};
    CLICK_IDS.concat(UTMS).forEach(function (k) {
      var v = params.get(k);
      if (v) d[k] = v;
    });
    d.click_timestamp = new Date().toISOString();
    d.referrer = document.referrer || '';
    d.landing_page = window.location.href;
    d.user_agent = navigator.userAgent || '';
    if (urlKey) d.attr_key = urlKey;
    save(d);
  } else {
    // Mid-funnel: still capture any new params (some redirect chains append late)
    var changed = false;
    CLICK_IDS.concat(UTMS).forEach(function (k) {
      var v = params.get(k);
      if (v && !stored[k]) { stored[k] = v; changed = true; }
    });
    // Same tab, new ad click: the pinned click_id belongs to the old ad.
    if (urlKey && urlKey !== stored.attr_key) {
      stored.attr_key = urlKey;
      delete stored.click_id;
      changed = true;
    }
    if (changed) save(stored);
  }

  // PostbackX/Propel click_id.
  //
  // Resolved lazily rather than at load, because on the direct flow PropelDirect
  // creates the click with an async POST — on the entry page the cookie does not
  // exist yet when this file runs. Sources, in order of trust:
  //   1. sessionStorage  — already resolved earlier in this funnel
  //   2. ?click_id=      — redirect flow, present on the entry page immediately
  //   3. PropelDirect.clickId — the landing page's own resolved click (new,
  //      reused, or edge-created; see EDGE-CLICK-IMPLEMENTATION-PLAN.md)
  //   4. _propel_click_id cookie — direct flow or Edge Inject. Cookie is path=/
  //      and lasts 30 days, so it is readable from every step and the thank-you
  //      page. Used only when its _propel_attribution_key matches this visit's
  //      ad click (attr_key); a mismatch is a previous ad's click.
  //   5. localStorage backup — only when this visit has no ad attribution key,
  //      since it carries no key to check.
  // Once found it is written back to sessionStorage so the rest of the funnel
  // does not depend on the cookie surviving.
  function cookie(name){
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    return parts.length === 2 ? parts.pop().split(';').shift() : '';
  }
  function clickId(){
    var d = load();
    if (d.click_id) return d.click_id;

    var key = d.attr_key || '';
    var v = new URLSearchParams(window.location.search).get('click_id') || '';
    if (!v) { try { v = (window.PropelDirect && window.PropelDirect.clickId) || ''; } catch (e) {} }
    if (!v) {
      var c = cookie('_propel_click_id');
      var ck = cookie('_propel_attribution_key');
      try { ck = decodeURIComponent(ck); } catch (e) {}
      if (c && (!key || ck === key)) v = c;
    }
    if (!v && !key) { try { v = localStorage.getItem('_propel_click_id') || ''; } catch (e) {} }
    v = String(v || '').trim();
    if (!v) return '';

    d.click_id = v;
    save(d);
    return v;
  }

  // The snippet loads async and PropelDirect can write the cookie after its
  // POST returns. Flush the click_id as soon as both it and Sparrow exist,
  // without waiting for a form submit or the setTag debounce.
  //
  // Done only when Sparrow ACKNOWLEDGES the write: enrich(tags, cb) calls back
  // with an error when /v2/session/validate rejects or the fetch fails, and we
  // retry with backoff. Before init, enrich() calls back null without sending
  // anything ("init() sends them"), and for an edge-injected session init only
  // fires one unchecked beacon. So a pre-session call just stores the tag and
  // the acknowledged send waits until Sparrow has a session id.
  // See qualify/ATTRIBUTION-FIX-PLAN.md (UB-1).
  var clickIdSent = false, inFlight = false, attempt = 0, retryTimer = null;
  var primedCid = '', MAX_ATTEMPTS = 20;
  function hasSession(){
    var S = window.Sparrow;
    // Older snippets without getSessionId: fall back to "initialised".
    if (!S || typeof S.getSessionId !== 'function') return true;
    try { return !!S.getSessionId(); } catch (e) { return false; }
  }
  function sendClickId(){
    if (clickIdSent || inFlight || retryTimer) return clickIdSent;
    if (attempt >= MAX_ATTEMPTS) return false;
    if (!(window.Sparrow && window.Sparrow.enrich)) return false;
    var cid = clickId();
    if (!cid) return false;
    if (!hasSession()) {
      // No session to write to yet: store it so init() carries it, once.
      if (primedCid !== cid) { primedCid = cid; window.Sparrow.enrich({ click_id: cid }); }
      return false;
    }
    inFlight = true;
    try {
      window.Sparrow.enrich({ click_id: cid }, function(err){
        inFlight = false;
        if (!err) { clickIdSent = true; return; }
        attempt++;
        if (attempt >= MAX_ATTEMPTS) return;
        retryTimer = setTimeout(function(){ retryTimer = null; sendClickId(); },
                                Math.min(30000, 1000 * Math.pow(2, attempt)));
      });
    } catch (e) {
      inFlight = false;
    }
    return false;
  }

  window.UBAttribution = {
    getAll: function(){
      var d = load();
      var c = clickId();
      if (c) d.click_id = c;
      return d;
    },
    get: function(k){ return k === 'click_id' ? clickId() : (load()[k] || ''); },
    clickId: clickId,
    sendClickId: sendClickId
  };

  // Watch for the page's lifetime (not just 30 s): the click, the snippet or
  // the session can each arrive late. Stops on acknowledgement or when the
  // retry budget is spent.
  sendClickId();
  var watch = setInterval(function(){
    if (sendClickId() || attempt >= MAX_ATTEMPTS) clearInterval(watch);
  }, 250);
  // A dialer can background the page; these are best-effort re-checks.
  window.addEventListener('pagehide', sendClickId);
  document.addEventListener('visibilitychange', sendClickId);
})();
