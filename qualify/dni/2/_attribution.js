/*  /qualify/dni/2/ — first-touch attribution capture
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

  window.UBAttribution = {
    getAll: function(){
      var d = load();
      var c = clickId();
      if (c) d.click_id = c;
      return d;
    },
    get: function(k){ return k === 'click_id' ? clickId() : (load()[k] || ''); },
    clickId: clickId
  };
})();
