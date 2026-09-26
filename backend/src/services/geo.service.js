// Helpers for the live map: distances, freshness rules, place-search parsing
// and a small in-memory cache for the free geocoding services we rely on.

// A sharing user's app re-sends its position at least once a minute, so a pin
// that hasn't been updated for longer than this belongs to a closed app.
export const LIVE_WINDOW_MS = 3 * 60 * 1000;
// Last-known pins disappear after a week instead of lingering forever.
export const LAST_LOCATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export const distanceMeters = (a, b) => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const isLiveLocation = (location, now = Date.now()) =>
  Boolean(location?.sharingEnabled) && now - new Date(location.updatedAt).getTime() <= LIVE_WINDOW_MS;

// 6 decimals is ~11 cm: more than any phone GPS can resolve.
export const roundCoordinate = (value) => Math.round(value * 1e6) / 1e6;

export const parseAccuracy = (value) => {
  const accuracy = Number(value);
  return Number.isFinite(accuracy) && accuracy > 0 ? Math.min(Math.round(accuracy), 100_000) : null;
};

const joinUnique = (parts) => [...new Set(parts.filter(Boolean))].join(", ");

// OpenStreetMap often maps one landmark twice (a building and its outline),
// which would show the same suggestion two times.
export const dedupePlaces = (places) => places.filter((place, index) => !places.slice(0, index).some((other) =>
  other.name === place.name && other.detail === place.detail
  && distanceMeters({ latitude: other.lat, longitude: other.lng }, { latitude: place.lat, longitude: place.lng }) < 250));

// Photon returns GeoJSON. Keep the fields the map needs, and a bounding box so
// a city or state is framed as a whole instead of zooming onto its centre point.
export const parsePhotonResults = (payload) => dedupePlaces((payload?.features ?? []).flatMap((feature, index) => {
  const [lng, lat] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const p = feature.properties ?? {};
  const name = p.name || p.street || p.city || p.state || p.country;
  if (!name) return [];
  const street = p.street ? [p.housenumber, p.street].filter(Boolean).join(" ") : "";
  const detail = joinUnique([street !== name && street, p.district, p.city !== name && p.city, p.state !== name && p.state, p.country !== name && p.country]);
  const [west, north, east, south] = Array.isArray(p.extent) ? p.extent : [];
  const bounds = [west, north, east, south].every(Number.isFinite) ? [[south, west], [north, east]] : null;
  return [{ id: `${p.osm_type || "p"}${p.osm_id ?? index}`, name, detail, lat, lng, bounds, kind: p.osm_value || p.type || "place" }];
}));

export const parseNominatimResults = (payload) => dedupePlaces((Array.isArray(payload) ? payload : []).flatMap((result, index) => {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const [name, ...rest] = String(result.display_name || "").split(", ");
  const [south, north, west, east] = (result.boundingbox ?? []).map(Number);
  const bounds = [south, north, west, east].every(Number.isFinite) ? [[south, west], [north, east]] : null;
  return [{ id: `n${result.place_id ?? index}`, name: result.name || name || "Place", detail: rest.slice(0, 3).join(", "), lat, lng, bounds, kind: result.type || "place" }];
}));

export const areaNameFrom = (address) => {
  const area = address?.address || {};
  const local = area.neighbourhood || area.suburb || area.quarter || area.village || area.hamlet;
  const city = area.city || area.town || area.municipality || area.county || area.state_district;
  return joinUnique([local, city]) || address?.display_name || "";
};

// Nominatim allows one request a second and Photon asks for fair use, so the
// same searches and nearby reverse lookups are answered from memory.
export const createTtlCache = ({ maxEntries = 500, ttlMs = 10 * 60 * 1000 } = {}) => {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expires) { entries.delete(key); return undefined; }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expires: Date.now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
  };
};
