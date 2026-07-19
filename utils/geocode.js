// Best-effort geocoding via Nominatim (OpenStreetMap). Never throws - callers
// get null on any failure (missing network, no match, rate limit) so a
// geocoding hiccup never blocks creating/updating an event or profile.
const geocodeLocation = async (city, country) => {
  const query = [city, country].map((s) => (s || '').trim()).filter(Boolean).join(', ');
  if (!query) return null;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MoveUpApp/1.0 (contact@moveupapp.com)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const results = await response.json();
    const first = results[0];
    if (!first) return null;

    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
};

module.exports = { geocodeLocation };
