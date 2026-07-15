/* ============================================================
   UtilityBenefits — inactivity "Are you still there?" popup
   Loaded on the live funnels (/qualify/2/ and /qualify/4/,
   landing + steps) and the thank-you page (/qualify/thank-you/).
   Single shared file, so every funnel behaves identically.

   Behavior mirrors the NBA funnel popup (apply/popup.js) — keep
   the two in sync (see each repo's CLAUDE.md "Popup behavior"):
   - Fires after 30s of mouse/touch inactivity, well after any
     crawler has scored the page. Underlying HTML is identical
     for everyone (not cloaking).
   - Shows once per session across page loads (sessionStorage
     flag), but on the page where it appears it RE-POPS 30s after
     the visitor closes it (the timer re-arms on mouse/touch).
     This is intentional — matches the long-standing NBA behavior.
   - On the thank-you page it surfaces the case number inside the
     card (reassurance pattern from NBA) so the caller has it to
     reference — it deliberately overlaps the on-page number.
   - Pre-rendered hidden so the tel: anchor is in the DOM for
     GTM / Google Forwarding Number scans on page load.
   - Plain tel: anchor — no onclick / preventDefault — so call
     tracking fires natively on the dedicated popup number.

   Visual identity is UtilityBenefits (DM Sans + emerald /
   dark-green), NOT the NBA navy/amber design.
   Tokens borrowed from /lp/_shared.css + /qualify/2/_funnel.css:
     emerald #0E8E5C · emerald-soft #E5F4EE · CTA green #1B5E20
     hover #14491A · ink #0A1F2E · navy #0A2540
   ============================================================ */
(function () {
  var DELAY = 30000;                 // 30s inactivity, matches NBA
  var SESSION_KEY = 'ub_popup_shown';
  var PHONE_DISPLAY = '(813) 820-4146';
  var PHONE_TEL = 'tel:+18138204146'; // dedicated popup line (E.164)

  if (sessionStorage.getItem(SESSION_KEY)) return;

  var timer;
  var overlay;

  function injectStyles() {
    if (document.getElementById('ub-popup-styles')) return;
    var style = document.createElement('style');
    style.id = 'ub-popup-styles';
    style.textContent = [
      '.ub-popup-overlay{position:fixed;inset:0;background:rgba(10,37,64,.82);display:flex;align-items:center;justify-content:center;z-index:99999;padding:1rem;backdrop-filter:blur(2px)}',
      '.ub-popup-card{background:#fff;border-radius:18px;box-shadow:0 20px 60px -10px rgba(0,0,0,.45);max-width:440px;width:100%;overflow:hidden;position:relative;animation:ub-popup-in .25s ease-out}',
      '@keyframes ub-popup-in{from{opacity:0;transform:scale(.93) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}',
      '.ub-popup-bar{height:5px;background:linear-gradient(90deg,#1B5E20,#14491A)}',
      '.ub-popup-close{position:absolute;top:.85rem;right:.85rem;background:#F2F4F3;border:none;border-radius:50%;width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#6B7280;transition:background .15s,color .15s}',
      '.ub-popup-close:hover{background:#E2E5EB;color:#0A1F2E}',
      '.ub-popup-body{padding:1.75rem 2rem 1.75rem;box-sizing:border-box;font-family:"DM Sans","Inter",system-ui,-apple-system,sans-serif;letter-spacing:-.005em}',
      '.ub-popup-header{display:flex;align-items:center;gap:.75rem;margin-bottom:1rem}',
      '.ub-popup-icon{flex-shrink:0;width:2.5rem;height:2.5rem;background:#E5F4EE;border:2px solid #C9E8DA;border-radius:50%;display:flex;align-items:center;justify-content:center}',
      '.ub-popup-icon svg{width:1.25rem;height:1.25rem;color:#0E8E5C}',
      '.ub-popup-title{font-family:"DM Sans","Inter",system-ui,sans-serif;font-size:1.35rem;font-weight:700;color:#0A1F2E;margin:0;line-height:1.2;letter-spacing:-.022em}',
      '.ub-popup-text{font-size:.96rem;color:#333;line-height:1.6;margin:0 0 1rem}',
      // Case-number reassurance line (thank-you only). Mirrors NBA .nba-popup-ref.
      '.ub-popup-ref{font-size:.875rem;color:#6B7280;line-height:1.5;margin:0 0 1.25rem}',
      '.ub-popup-ref strong{color:#0A1F2E;font-weight:700}',
      // Call button mirrors the funnel CTA: #1B5E20 dark green, white text.
      // Single tel: anchor — same GTM trigger / Call Conversion behavior.
      '.ub-popup-call-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.15rem;width:100%;box-sizing:border-box;padding:.95rem 1rem;background:#1B5E20;color:#fff;font-family:"DM Sans","Inter",system-ui,sans-serif;font-weight:700;border-radius:8px;text-decoration:none;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(27,94,32,.40),0 2px 4px rgba(27,94,32,.18);transition:background .15s,box-shadow .15s,transform .12s;line-height:1.15}',
      '.ub-popup-call-btn:hover{background:#14491A;transform:translateY(-1px);box-shadow:0 12px 30px rgba(27,94,32,.50),0 2px 4px rgba(27,94,32,.20)}',
      '.ub-popup-call-btn:active{transform:translateY(0);box-shadow:0 4px 12px rgba(27,94,32,.35)}',
      '.ub-popup-call-btn__cta{font-size:1.35rem;font-weight:700;letter-spacing:.01em;white-space:nowrap;line-height:1.15}',
      '.ub-popup-call-btn__phone-row{display:inline-flex;align-items:center;gap:.45rem;font-size:1.2rem;font-weight:700;letter-spacing:.02em;white-space:nowrap;line-height:1.15}',
      '.ub-popup-call-btn__phone-row svg{width:20px;height:20px;flex-shrink:0}',
      '@media (max-width:480px){',
      '  .ub-popup-body{padding:1.5rem 1.4rem}',
      '  .ub-popup-title{font-size:1.2rem}',
      '  .ub-popup-call-btn{padding:.85rem 1.1rem;gap:.1rem}',
      '  .ub-popup-call-btn__cta{font-size:1.15rem}',
      '  .ub-popup-call-btn__phone-row{font-size:1.05rem;gap:.35rem}',
      '  .ub-popup-call-btn__phone-row svg{width:18px;height:18px}',
      '}'
    ].join('');
    document.head.appendChild(style);
  }

  // Real case number from the thank-you page (set by its inline script before
  // this runs). Returns null on funnel/landing pages (no case number yet) or
  // while it's still the 'UB-2026-0000000' placeholder, so the ref line is only
  // shown where a genuine number exists.
  function getCaseNumber() {
    var el = document.getElementById('ty-case-number');
    if (!el) return null;
    var v = (el.textContent || '').trim();
    return /^UB-2026-\d{7}$/.test(v) && v !== 'UB-2026-0000000' ? v : null;
  }

  function buildPopup() {
    var phoneIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.21 12 19.79 19.79 0 0 1 1.14 3.38 2 2 0 0 1 3.11 1.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
    var closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    // Case-number reassurance line — thank-you only.
    var caseNum = getCaseNumber();
    var refHtml = caseNum
      ? '<p class="ub-popup-ref">Your case number: <strong>' + caseNum + '</strong></p>'
      : '';

    overlay = document.createElement('div');
    overlay.className = 'ub-popup-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Are you still there?');
    // Pre-render: in DOM but hidden until the inactivity trigger fires.
    // GFN's initial DOM scan finds the tel: anchor on page load.
    overlay.style.display = 'none';

    overlay.innerHTML =
      '<div class="ub-popup-card">' +
        '<div class="ub-popup-bar"></div>' +
        '<button class="ub-popup-close" aria-label="Close">' + closeIcon + '</button>' +
        '<div class="ub-popup-body">' +
          '<div class="ub-popup-header">' +
            '<div class="ub-popup-icon">' + phoneIcon + '</div>' +
            '<h2 class="ub-popup-title">Are you still there?</h2>' +
          '</div>' +
          '<p class="ub-popup-text">Call now and speak with a case manager who can help you find what options may be available to you.</p>' +
          refHtml +
          '<a href="' + PHONE_TEL + '" class="ub-popup-call-btn">' +
            '<span class="ub-popup-call-btn__cta">Call Now</span>' +
            '<span class="ub-popup-call-btn__phone-row">' + phoneIcon + '<span>' + PHONE_DISPLAY + '</span></span>' +
          '</a>' +
        '</div>' +
      '</div>';

    overlay.querySelector('.ub-popup-close').addEventListener('click', hide);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });

    document.body.appendChild(overlay);
  }

  function show() {
    if (!overlay) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    overlay.style.display = 'flex';
    // restart entry animation
    var card = overlay.querySelector('.ub-popup-card');
    if (card) {
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = '';
    }
  }

  function hide() {
    if (!overlay) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    overlay.style.display = 'none';
  }

  function resetTimer() {
    clearTimeout(timer);
    timer = setTimeout(show, DELAY);
  }

  function init() {
    injectStyles();
    buildPopup();

    document.addEventListener('mousemove', resetTimer, { passive: true });
    document.addEventListener('touchstart', resetTimer, { passive: true });
    document.addEventListener('touchmove', resetTimer, { passive: true });

    resetTimer();
  }

  // Pre-render the popup at script load (or as soon as <body> is ready) so the
  // tel: anchor is in the DOM before GFN's initial swap scan runs.
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
