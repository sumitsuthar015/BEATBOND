import { describe, expect, it } from "vitest";
import { getSpeechRecognitionConstructor } from "@/lib/voiceSearch";

describe("speech recognition support detection", () => {
  it("returns the standard browser constructor when present", () => {
    class StandardRecognition {}
    expect(getSpeechRecognitionConstructor({ SpeechRecognition: StandardRecognition })).toBe(StandardRecognition);
  });

  it("supports browsers that expose only the webkit-prefixed constructor", () => {
    class WebkitRecognition {}
    expect(getSpeechRecognitionConstructor({ webkitSpeechRecognition: WebkitRecognition })).toBe(WebkitRecognition);
  });

  it("reports unsupported browsers without throwing", () => {
    expect(getSpeechRecognitionConstructor({})).toBeUndefined();
  });
});
