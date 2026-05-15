/* /api/maps-key — return the public Google Maps JS API key from env var.
 *
 * The key itself isn't a hard secret (it's visible in every Maps script tag
 * a user inspects), but routing it through an env var means:
 *   - Not committed to git
 *   - Rotatable without a redeploy of HTML
 *   - One place to swap if we move providers
 *
 * The key MUST be domain-restricted to www.utilitybenefits.com (and
 * utilitybenefits.vercel.app for previews) in Google Cloud Console
 * → APIs & Services → Credentials → set HTTP referrer restrictions.
 */
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify({
    key: process.env.GOOGLE_MAPS_API_KEY || ''
  }));
};
