#!/usr/bin/env python3
"""Install TrustedForm cert capture on lead-capture pages.

Targets:
  - 5 paid LPs at /lp/*/index.html — full wiring (script + hidden input
    + submit-handler thread-through into sessionStorage.ub_lead and the
    thank-you redirect URL).
  - /qualify/index.html — script tag only. The "Get my callback" form
    inside the calculator is still stubbed; it'll be wired up in Part 2
    when a real backend exists.

The script is idempotent: files that already contain `xxTrustedFormCertUrl`
are skipped, so re-running after adding new LPs is safe.

Usage:
    python3 scripts/install_trustedform.py
"""
from __future__ import annotations

import sys
from pathlib import Path

MARKER = "xxTrustedFormCertUrl"  # presence == already installed

TRUSTEDFORM_SNIPPET = """<!-- TrustedForm -->
<script type="text/javascript">
(function() {
var tf = document.createElement('script');
tf.type = 'text/javascript';
tf.async = true;
tf.src = ("https:" == document.location.protocol ? 'https' : 'http') +
'://api.trustedform.com/trustedform.js?field=xxTrustedFormCertUrl&use_tagged_consent=true&l=' +
new Date().getTime() + Math.random();
var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(tf, s);
})();
</script>
<noscript>
<img src='https://api.trustedform.com/ns.gif' />
</noscript>
<!-- End TrustedForm -->
"""

HIDDEN_INPUT_LINE = (
    '        <input type="hidden" name="xxTrustedFormCertUrl" value="" />\n'
)

LP_FORM_OPEN = (
    '      <form class="lp-form-card" id="lp-form" '
    'method="get" action="/qualify/thank-you/" novalidate>\n'
)

# Lines we replace in the LP submit handler. All 5 LPs are byte-identical
# in this section, so a single old/new pair works for every file.
SUBMIT_HANDLER_OLD = """        // Snapshot form data for later (when backend is wired)
        var data = {};
        new FormData(form).forEach(function(val,key){ data[key] = val; });
        try {
          sessionStorage.setItem('ub_lead', JSON.stringify({
            case: caseNum,
            ts: Date.now(),
            lp_slug: document.body.getAttribute('data-lp'),
            lp_variant: v,
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            data: data
          }));
        } catch(err) {}"""

SUBMIT_HANDLER_NEW = """        // Snapshot form data for later (when backend is wired)
        var data = {};
        new FormData(form).forEach(function(val,key){ data[key] = val; });

        // TrustedForm auto-populates the hidden xxTrustedFormCertUrl input
        // with the cert URL by submit time. Capture it for downstream use.
        var certInput = form.querySelector('input[name="xxTrustedFormCertUrl"]');
        var certUrl = certInput ? certInput.value : '';

        try {
          sessionStorage.setItem('ub_lead', JSON.stringify({
            case: caseNum,
            ts: Date.now(),
            lp_slug: document.body.getAttribute('data-lp'),
            lp_variant: v,
            trustedform_cert: certUrl,
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            data: data
          }));
        } catch(err) {}"""

REDIRECT_OLD = """        // Carry UTMs through for attribution on thank-you / call connect
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){
          var val = params.get(k);
          if (val) qs.set(k, val);
        });"""

REDIRECT_NEW = """        // Carry the cert URL through so thank-you / downstream can persist it
        if (certUrl) qs.set('tf', certUrl);

        // Carry UTMs through for attribution on thank-you / call connect
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k){
          var val = params.get(k);
          if (val) qs.set(k, val);
        });"""


def install_script_tag(src: str) -> str:
    """Insert the TrustedForm script block immediately before </body>."""
    # case-insensitive match on </body>; preserve whatever case the file uses
    idx = src.lower().rfind("</body>")
    if idx == -1:
        raise ValueError("no </body> tag")
    return src[:idx] + TRUSTEDFORM_SNIPPET + src[idx:]


def install_on_lp(path: Path) -> None:
    src = path.read_text(encoding="utf-8")

    # 1. Add hidden input inside the form (immediately after opening <form>)
    if LP_FORM_OPEN not in src:
        raise ValueError(f"{path}: LP <form> opening line not found verbatim")
    src = src.replace(LP_FORM_OPEN, LP_FORM_OPEN + HIDDEN_INPUT_LINE, 1)

    # 2. Thread certUrl through the submit handler
    if SUBMIT_HANDLER_OLD not in src:
        raise ValueError(f"{path}: submit-handler anchor not found verbatim")
    src = src.replace(SUBMIT_HANDLER_OLD, SUBMIT_HANDLER_NEW, 1)

    if REDIRECT_OLD not in src:
        raise ValueError(f"{path}: redirect-block anchor not found verbatim")
    src = src.replace(REDIRECT_OLD, REDIRECT_NEW, 1)

    # 3. TrustedForm script block before </body>
    src = install_script_tag(src)

    path.write_text(src, encoding="utf-8")


def install_on_qualify(path: Path) -> None:
    src = path.read_text(encoding="utf-8")
    src = install_script_tag(src)
    path.write_text(src, encoding="utf-8")


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent

    lp_slugs = [
        "cell-phone-discount",
        "free-government-phone",
        "heating-assistance",
        "medical-alert-medicaid",
        "save-on-electric-bill",
    ]
    lp_targets = [repo_root / "lp" / slug / "index.html" for slug in lp_slugs]
    qualify_target = repo_root / "qualify" / "index.html"

    installed: list[str] = []
    skipped: list[str] = []

    for target in lp_targets:
        rel = target.relative_to(repo_root)
        if MARKER in target.read_text(encoding="utf-8"):
            skipped.append(str(rel))
            continue
        install_on_lp(target)
        installed.append(str(rel))

    rel = qualify_target.relative_to(repo_root)
    if MARKER in qualify_target.read_text(encoding="utf-8"):
        skipped.append(str(rel))
    else:
        install_on_qualify(qualify_target)
        installed.append(str(rel))

    print(f"TrustedForm installer — {len(installed)} installed, {len(skipped)} skipped")
    for p in installed:
        print(f"  installed: {p}")
    for p in skipped:
        print(f"  skipped (already had marker): {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
