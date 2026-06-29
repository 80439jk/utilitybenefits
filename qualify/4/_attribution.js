/*  /qualify/4/ — first-touch attribution capture
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
*/
(function () {
  var KEY = 'ub2_attr';
  var CLICK_IDS = ['gclid','gbraid','wbraid','fbclid','ttclid','msclkid','li_fat_id','twclid','epik'];
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

  window.UBAttribution = {
    getAll: function(){ return load(); },
    get: function(k){ return load()[k] || ''; }
  };
})();
