import { describe, expect, it } from "vitest";
import { orderStreams } from "./streamQuality";

const urls = [
  "https://aac.saavncdn.com/123/abc_320.mp4",
  "https://aac.saavncdn.com/123/abc_160.mp4",
  "https://aac.saavncdn.com/123/abc_96.mp4",
];

describe("orderStreams", () => {
  it("plays the chosen quality first and keeps the rest as fallbacks", () => {
    expect(orderStreams(urls, "high")).toEqual(urls);
    expect(orderStreams(urls, "normal")[0]).toContain("_160.mp4");
    expect(orderStreams(urls, "saver")).toEqual([urls[2], urls[1], urls[0]]);
  });

  it("works with signed links that carry a query string", () => {
    const signed = urls.map((url) => `${url}?Expires=1&Signature=x`);
    expect(orderStreams(signed, "saver")[0]).toContain("_96.mp4?");
  });

  it("keeps links without a known bitrate after the known ones", () => {
    const mixed = ["https://example.com/stream", ...urls];
    expect(orderStreams(mixed, "high")).toEqual([...urls, "https://example.com/stream"]);
  });
});
