/* PostbackX form_start for the two live paid funnels.
   Queue the first real interaction until UBAttribution resolves click_id.
   form_submit is sent by /api/lead only after the CRM accepts the lead. */
(function(){
  var match = /^\/qualify\/(2|5)(?:\/|$)/.exec(window.location.pathname);
  var form = document.getElementById('funnel-form');
  if (!match || !form) return;

  var PENDING_KEY = 'ub' + match[1] + 'd_postbackx_start';
  var SENT_PREFIX = 'ub_postbackx_form_start_';
  var pending = read(PENDING_KEY) === '1';
  var attempted = Object.create(null);
  var watch;
  var watchStartedAt;

  function read(key){
    try { return sessionStorage.getItem(key) || ''; } catch(e){ return ''; }
  }
  function write(key, value){
    try { sessionStorage.setItem(key, value); } catch(e){}
  }
  function clickId(){
    try {
      return (window.UBAttribution && window.UBAttribution.clickId()) || '';
    } catch(e){ return ''; }
  }
  function flush(){
    if (!pending) return true;
    var cid = clickId();
    if (!cid) return false;
    var key = SENT_PREFIX + cid;
    if (read(key) === '1') {
      pending = false;
      write(PENDING_KEY, '');
      return true;
    }
    if (attempted[cid]) return true;
    if (!window.fetch) return false;

    // Record the attempt before navigating. keepalive lets the GET outlive
    // this page; do not retry opaque responses, which could double-count.
    attempted[cid] = true;
    write(key, '1');
    pending = false;
    write(PENDING_KEY, '');
    function failed(){
      pending = true;
      write(PENDING_KEY, '1');
      write(key, '');
    }
    try {
      window.fetch('https://postbacks.postbackx.com/postback?click_id=' +
        encodeURIComponent(cid) + '&event_name=form_start', {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        keepalive: true,
        referrerPolicy: 'no-referrer'
      }).catch(function(){
        // Allow the next page to retry a failed network request, but avoid
        // a retry loop on this page.
        failed();
      });
    } catch(e) {
      failed();
    }
    return true;
  }
  function resume(){
    clearInterval(watch);
    if (flush() || !pending) return;
    watchStartedAt = Date.now();
    watch = setInterval(function(){
      if (flush() || Date.now() - watchStartedAt > 30000) clearInterval(watch);
    }, 250);
  }
  function start(e){
    if (!e.isTrusted) return;
    var el = e.target;
    if (!el || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ||
        /^(hidden|submit|button|reset)$/.test(el.type)) return;
    pending = true;
    write(PENDING_KEY, '1');
    resume();
  }

  form.addEventListener('input', start);
  form.addEventListener('change', start);
  // Covers browser autofill followed by a valid submit without an input event.
  // Existing validation listeners run first; invalid attempts do not start it.
  form.addEventListener('submit', function(e){
    if (!e.isTrusted || e.defaultPrevented) return;
    pending = true;
    write(PENDING_KEY, '1');
    resume();
  });
  window.addEventListener('pageshow', resume);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', resume);
  resume();
})();
