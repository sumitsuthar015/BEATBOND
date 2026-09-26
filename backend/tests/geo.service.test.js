import { test } from "node:test";
import assert from "node:assert/strict";

const {
  LIVE_WINDOW_MS, areaNameFrom, createTtlCache, distanceMeters, isLiveLocation,
  parseAccuracy, parseNominatimResults, parsePhotonResults, roundCoordinate,
} = await import("../src/services/geo.service.js");

test("distanceMeters measures real distances between coordinates", () => {
  // Gateway of India to Chhatrapati Shivaji Terminus is about 1.9 km.
  const meters = distanceMeters({ latitude: 18.922, longitude: 72.8347 }, { latitude: 18.9398, longitude: 72.8355 });
  assert.ok(meters > 1850 && meters < 2050, `got ${meters}`);
  assert.equal(distanceMeters({ latitude: 10, longitude: 10 }, { latitude: 10, longitude: 10 }), 0);
});

test("a pin is live only while sharing is on and the app has checked in recently", () => {
  const now = Date.now();
  assert.equal(isLiveLocation({ sharingEnabled: true, updatedAt: new Date(now - 30_000) }, now), true);
  assert.equal(isLiveLocation({ sharingEnabled: true, updatedAt: new Date(now - LIVE_WINDOW_MS - 1000) }, now), false);
  assert.equal(isLiveLocation({ sharingEnabled: false, updatedAt: new Date(now) }, now), false);
});

test("coordinates and accuracy are normalised before they are stored", () => {
  assert.equal(roundCoordinate(18.92196612345), 18.921966);
  assert.equal(parseAccuracy("12.6"), 13);
  assert.equal(parseAccuracy(-5), null);
  assert.equal(parseAccuracy("abc"), null);
});

test("Photon results keep names, details and bounds, without duplicate landmarks", () => {
  const feature = (osm_id, lng, lat, extra = {}) => ({
    geometry: { coordinates: [lng, lat] },
    properties: { osm_type: "W", osm_id, name: "Gateway of India", district: "Apollo Bandar", city: "Mumbai", state: "Maharashtra", country: "India", osm_value: "monument", ...extra },
  });
  const results = parsePhotonResults({ features: [
    feature(1, 72.8345, 18.9219, { extent: [72.834, 18.923, 72.835, 18.921] }),
    feature(2, 72.8346, 18.9220),
    { geometry: { coordinates: [73.85, 18.52] }, properties: { osm_type: "N", osm_id: 3, name: "Pune", state: "Maharashtra", country: "India", osm_value: "city" } },
  ] });

  assert.equal(results.length, 2);
  assert.deepEqual(results[0], {
    id: "W1", name: "Gateway of India", detail: "Apollo Bandar, Mumbai, Maharashtra, India",
    lat: 18.9219, lng: 72.8345, bounds: [[18.921, 72.834], [18.923, 72.835]], kind: "monument",
  });
  assert.equal(results[1].name, "Pune");
  assert.equal(results[1].bounds, null);
});

test("Nominatim results are parsed into the same shape", () => {
  const [result] = parseNominatimResults([{ place_id: 9, lat: "18.52", lon: "73.85", name: "Pune", display_name: "Pune, Pune District, Maharashtra, India", boundingbox: ["18.4", "18.6", "73.7", "74.0"], type: "city" }]);
  assert.deepEqual(result, { id: "n9", name: "Pune", detail: "Pune District, Maharashtra, India", lat: 18.52, lng: 73.85, bounds: [[18.4, 73.7], [18.6, 74]], kind: "city" });
});

test("the area name combines the neighbourhood and the city", () => {
  assert.equal(areaNameFrom({ address: { suburb: "Bandra West", city: "Mumbai" } }), "Bandra West, Mumbai");
  assert.equal(areaNameFrom({ address: { town: "Lonavala" } }), "Lonavala");
  assert.equal(areaNameFrom(null), "");
});

test("the TTL cache expires entries and evicts the oldest when full", async () => {
  const cache = createTtlCache({ maxEntries: 2, ttlMs: 20 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), 3);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(cache.get("c"), undefined);
});
