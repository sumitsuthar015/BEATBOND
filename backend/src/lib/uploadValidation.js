import { open } from "node:fs/promises";

export const isSupportedImage = async (file) => {
  const mime = file?.mimetype?.toLowerCase();
  const allowedMime = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowedMime.has(mime)) return false;
  const handle = await open(file.tempFilePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 4) return false;
    if (mime === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    if (mime === "image/png") return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mime === "image/webp") return header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP";
    if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(header.toString("ascii", 0, 6));
    return false;
  } finally {
    await handle.close();
  }
};

export const isSupportedAudio = async (file) => {
  const mime = file?.mimetype?.toLowerCase();
  if (!new Set(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "video/mp4"]).has(mime)) return false;
  const handle = await open(file.tempFilePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 4) return false;
    return (
      header.toString("ascii", 0, 3) === "ID3" ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) ||
      header.toString("ascii", 4, 8) === "ftyp" ||
      (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WAVE") ||
      header.toString("ascii", 0, 4) === "OggS" ||
      header.toString("ascii", 0, 4) === "fLaC"
    );
  } finally {
    await handle.close();
  }
};
