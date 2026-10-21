/*  /qualify/5/ — first-touch attribution capture
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
  var KEY = 'ub5d_attr';
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
    save(d);
  } else {
    // Mid-funnel: still capture any new params (some redirect chains append late)
    var changed = false;
    CLICK_IDS.concat(UTMS).forEach(function (k) {
      var v = params.get(k);
      if (v && !stored[k]) { stored[k] = v; changed = true; }
    });
    if (changed) save(stored);
  }

  // PostbackX/Propel click_id.
  //
  // Resolved lazily rather than at load, because on the direct flow PropelDirect
  // creates the click with an async POST — on the entry page the cookie does not
  // exist yet when this file runs. Sources, in order of trust:
  //   1. sessionStorage  — already resolved earlier in this funnel
  //   2. ?click_id=      — redirect flow, present on the entry page immediately
  //   3. _propel_click_id cookie / localStorage — direct flow, written by
  //      PropelDirect once its POST returns. Cookie is path=/ and lasts 30 days,
  //      so it is readable from every step and the thank-you page.
  // Once found it is written back to sessionStorage so the rest of the funnel
  // does not depend on the cookie surviving.
  function cookie(name){
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    return parts.length === 2 ? parts.pop().split(';').shift() : '';
  }
  function clickId(){
    var d = load();
    if (d.click_id) return d.click_id;

    var v = new URLSearchParams(window.location.search).get('click_id') ||
            cookie('_propel_click_id') || '';
    if (!v) { try { v = localStorage.getItem('_propel_click_id') || ''; } catch (e) {} }
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
