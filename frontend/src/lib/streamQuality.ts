export type StreamQuality = "high" | "normal" | "saver";

export const STREAM_QUALITIES: { value: StreamQuality; label: string; detail: string; kbps: number }[] = [
  { value: "high", label: "High", detail: "320 kbps", kbps: 320 },
  { value: "normal", label: "Normal", detail: "160 kbps", kbps: 160 },
  { value: "saver", label: "Data saver", detail: "96 kbps", kbps: 96 },
];

// Stream links carry their bitrate in the file name, e.g. ".../abc_160.mp4".
const bitrateOf = (url: string) => Number(url.match(/_(\d{2,3})\.(?:mp4|mp3|m4a)(?:\?|$)/)?.[1]) || null;

/**
 * Orders a song's streams so the chosen quality plays first. The rest stay as
 * fallbacks, closest bitrate first, so a missing quality still plays.
 */
export const orderStreams = (urls: string[], quality: StreamQuality) => {
  const target = STREAM_QUALITIES.find((option) => option.value === quality)?.kbps ?? 320;
  const known = urls
    .map((url) => ({ url, kbps: bitrateOf(url) }))
    .filter((item): item is { url: string; kbps: number } => item.kbps !== null)
    .sort((a, b) => Math.abs(a.kbps - target) - Math.abs(b.kbps - target) || b.kbps - a.kbps);
  // Links whose bitrate isn't known keep their order, after the known ones.
  const unknown = urls.filter((url) => bitrateOf(url) === null);
  return [...known.map((item) => item.url), ...unknown];
};
