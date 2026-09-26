export type LatLng = { lat: number; lng: number };
export type Fix = LatLng & {
  /** Radius in metres that the true position is likely within. */
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const distanceMeters = (a: LatLng, b: LatLng) => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const formatDistance = (meters: number) => {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 1000).toLocaleString()} km`;
};

export const formatAgo = (date: string | number | Date | undefined, now = Date.now()) => {
  if (date === undefined) return "";
  const seconds = Math.max(0, (now - new Date(date).getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
};

// Faster than ~250 km/h between two fixes is a GPS glitch, not a person.
const MAX_SPEED_MPS = 70;
// How far someone walking or riding may drift per second between fixes.
const DRIFT_MPS = 3;

/**
 * Smooths raw GPS fixes with a small Kalman filter: each new fix is blended
 * in by how precise it is, so the dot stops jittering while standing still
 * but still follows real movement. Glitches (impossible jumps, or a coarse
 * cell-tower fix right after a precise GPS one) are dropped.
 */
export const createLocationFilter = () => {
  let estimate: Fix | null = null;
  let variance = 0;
  let rejected = 0;

  const restart = (fix: Fix) => {
    estimate = fix;
    variance = fix.accuracy ** 2;
    rejected = 0;
    return estimate;
  };

  return {
    push(raw: Fix): Fix | null {
      const fix = { ...raw, accuracy: Math.max(raw.accuracy, 1) };
      if (!estimate) return restart(fix);

      const seconds = (fix.timestamp - estimate.timestamp) / 1000;
      if (seconds <= 0) return null;
      if (fix.accuracy > 1000 && estimate.accuracy < 200 && seconds < 120) return null;

      if (distanceMeters(estimate, fix) > MAX_SPEED_MPS * seconds + fix.accuracy + estimate.accuracy) {
        rejected += 1;
        // Several "impossible" fixes in a row means the person really is
        // somewhere else (e.g. the phone slept during a journey).
        return rejected >= 3 ? restart(fix) : null;
      }
      rejected = 0;

      const drift = Math.max(DRIFT_MPS, fix.speed ?? 0);
      variance += seconds * drift * drift;
      const gain = variance / (variance + fix.accuracy ** 2);
      variance *= 1 - gain;
      estimate = {
        lat: estimate.lat + gain * (fix.lat - estimate.lat),
        lng: estimate.lng + gain * (fix.lng - estimate.lng),
        accuracy: Math.max(3, Math.sqrt(variance)),
        heading: fix.heading,
        speed: fix.speed,
        timestamp: fix.timestamp,
      };
      return estimate;
    },
    reset() {
      estimate = null;
      rejected = 0;
    },
  };
};

export type ScreenPoint<T> = { x: number; y: number; item: T };

/**
 * Groups points that are within `radius` pixels of each other on screen.
 * Earlier points seed groups, so pass the most important ones first.
 */
export const clusterByDistance = <T,>(points: ScreenPoint<T>[], radius: number) => {
  const cellOf = (value: number) => Math.floor(value / radius);
  const grid = new Map<string, number[]>();
  points.forEach((point, index) => {
    const key = `${cellOf(point.x)}:${cellOf(point.y)}`;
    grid.set(key, [...(grid.get(key) ?? []), index]);
  });

  const taken = new Array<boolean>(points.length).fill(false);
  const groups: ScreenPoint<T>[][] = [];
  points.forEach((seed, index) => {
    if (taken[index]) return;
    taken[index] = true;
    const group = [seed];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const other of grid.get(`${cellOf(seed.x) + dx}:${cellOf(seed.y) + dy}`) ?? []) {
          if (taken[other] || Math.hypot(points[other].x - seed.x, points[other].y - seed.y) > radius) continue;
          taken[other] = true;
          group.push(points[other]);
        }
      }
    }
    groups.push(group);
  });
  return groups;
};

const PLACE_ZOOM: Record<string, number> = {
  country: 5, state: 7, region: 7, county: 9, district: 11, city: 12, town: 13,
  village: 14, suburb: 14, postcode: 14, neighbourhood: 15, quarter: 15, hamlet: 15,
};

/** A sensible zoom for a search result that has no bounding box. */
export const zoomForPlace = (kind: string) => PLACE_ZOOM[kind] ?? 17;
