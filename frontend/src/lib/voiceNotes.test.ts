import { describe, expect, it } from "vitest";
import { chooseVoiceMimeType, clampVoiceDuration, formatVoiceDuration, voiceFileExtension } from "./voiceNotes";

describe("voice note helpers", () => {
  it("chooses a browser-supported recorder type with Safari MP4 fallback", () => {
    expect(chooseVoiceMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(chooseVoiceMimeType(() => false)).toBeUndefined();
  });

  it("uses an extension that matches the recorded media type", () => {
    expect(voiceFileExtension("audio/mp4;codecs=mp4a.40.2")).toBe("m4a");
    expect(voiceFileExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(voiceFileExtension("audio/webm;codecs=opus")).toBe("webm");
  });

  it("bounds durations and formats the timer", () => {
    expect(clampVoiceDuration(62, 60)).toBe(60);
    expect(clampVoiceDuration(Number.NaN, 60)).toBe(0);
    expect(formatVoiceDuration(65)).toBe("1:05");
  });
});
