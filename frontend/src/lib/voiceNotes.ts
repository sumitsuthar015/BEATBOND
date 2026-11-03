const PREFERRED_AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export const chooseVoiceMimeType = (isTypeSupported?: (mimeType: string) => boolean) =>
  typeof isTypeSupported === "function" ? PREFERRED_AUDIO_TYPES.find(isTypeSupported) : undefined;

export const voiceFileExtension = (mimeType: string) => {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mpeg")) return "mp3";
  return "webm";
};

export const clampVoiceDuration = (seconds: number, maximum: number) =>
  Number.isFinite(seconds) ? Math.min(maximum, Math.max(0, seconds)) : 0;

export const formatVoiceDuration = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};
