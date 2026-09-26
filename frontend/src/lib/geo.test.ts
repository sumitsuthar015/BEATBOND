import { describe, expect, it } from "vitest";
import { clusterByDistance, createLocationFilter, distanceMeters, formatAgo, formatDistance, zoomForPlace, type Fix } from "./geo";

const fix = (lat: number, lng: number, accuracy: number, seconds: number, speed: number | null = null): Fix => ({
  lat, lng, accuracy, heading: null, speed, timestamp: seconds * 1000,
});

// ~1 m of latitude, in degrees.
const METRE = 1 / 111_320;

describe("distanceMeters", () => {
  it("measures real-world distances", () => {
    const meters = distanceMeters({ lat: 18.922, lng: 72.8347 }, { lat: 18.9398, lng: 72.8355 });
    expect(meters).toBeGreaterThan(1850);
    expect(meters).toBeLessThan(2050);
  });
});

describe("createLocationFilter", () => {
  it("steadies a jittery position while standing still", () => {
    const filter = createLocationFilter();
    const home = { lat: 19.07, lng: 72.87 };
    const jitter = [8, -10, 6, -7, 9, -5, 7, -8];
    let last: Fix | null = null;
    jitter.forEach((offset, index) => {
      last = filter.push(fix(home.lat + offset * METRE, home.lng, 15, index * 2)) ?? last;
    });
    // Raw fixes swing up to 10 m; the smoothed dot stays within a few metres.
    expect(distanceMeters(last!, home)).toBeLessThan(4);
  });

  it("drops a single impossible jump but follows real movement", () => {
    const filter = createLocationFilter();
    filter.push(fix(19.07, 72.87, 10, 0));
    // 5 km away one second later: a glitch.
    expect(filter.push(fix(19.07 + 5000 * METRE, 72.87, 10, 1))).toBeNull();
    // Walking 20 m north over 15 s is accepted.
    const walked = filter.push(fix(19.07 + 20 * METRE, 72.87, 10, 16));
    expect(walked).not.toBeNull();
    expect(distanceMeters(walked!, { lat: 19.07, lng: 72.87 })).toBeGreaterThan(10);
  });

  it("restarts when the jump keeps being confirmed", () => {
    const filter = createLocationFilter();
    filter.push(fix(19.07, 72.87, 10, 0));
    const far = 19.07 + 5000 * METRE;
    expect(filter.push(fix(far, 72.87, 10, 1))).toBeNull();
    expect(filter.push(fix(far, 72.87, 10, 2))).toBeNull();
    const restarted = filter.push(fix(far, 72.87, 10, 3));
    expect(restarted?.lat).toBeCloseTo(far, 6);
  });

  it("ignores a coarse network fix right after a precise one", () => {
    const filter = createLocationFilter();
    filter.push(fix(19.07, 72.87, 8, 0));
    expect(filter.push(fix(19.071, 72.871, 1500, 5))).toBeNull();
  });

  it("jumps straight to a precise fix after a coarse first guess", () => {
    const filter = createLocationFilter();
    filter.push(fix(19.08, 72.88, 1500, 0));
    const precise = filter.push(fix(19.07, 72.87, 10, 3));
    expect(distanceMeters(precise!, { lat: 19.07, lng: 72.87 })).toBeLessThan(2);
    expect(precise!.accuracy).toBeLessThan(15);
  });
});

describe("clusterByDistance", () => {
  it("groups points that would overlap on screen", () => {
    const points = [
      { x: 0, y: 0, item: "a" },
      { x: 20, y: 10, item: "b" },
      { x: 200, y: 200, item: "c" },
      { x: 30, y: -20, item: "d" },
    ];
    const groups = clusterByDistance(points, 46).map((group) => group.map((point) => point.item).sort());
    expect(groups).toEqual([["a", "b", "d"], ["c"]]);
  });
});

describe("formatting", () => {
  it("formats distances for people", () => {
    expect(formatDistance(4)).toBe("10 m");
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(2340)).toBe("2.3 km");
    expect(formatDistance(48_600)).toBe("49 km");
  });

  it("formats how long ago something happened", () => {
    const now = Date.now();
    expect(formatAgo(now - 10_000, now)).toBe("just now");
    expect(formatAgo(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe("3 h ago");
    expect(formatAgo(now - 2 * 86_400_000, now)).toBe("2 d ago");
  });

  it("picks a zoom that fits the kind of place", () => {
    expect(zoomForPlace("city")).toBe(12);
    expect(zoomForPlace("cafe")).toBe(17);
  });
});
