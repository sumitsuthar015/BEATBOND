import { describe, expect, it } from "vitest";
import { distanceMeters } from "@/lib/geo";
import { circlePolygon } from "./mapMarkers";

describe("circlePolygon", () => {
  it("draws a closed ring the given distance around the centre", () => {
    const center = { lat: 19.06, lng: 72.83 };
    const ring = circlePolygon(center, 50).geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    ring.forEach(([lng, lat]: number[]) => {
      expect(distanceMeters(center, { lat, lng })).toBeCloseTo(50, 0);
    });
  });
});
