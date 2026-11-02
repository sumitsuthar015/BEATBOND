import cloudinary from "../lib/cloudinary.js";
import { unlink } from "node:fs/promises";

export const uploadVoiceNote = async (req, res, next) => {
  const file = req.files?.audio;
  try {
    if (!file || Array.isArray(file) || !String(file.mimetype || "").startsWith("audio/")) return res.status(400).json({ message: "Choose an audio recording." });
    if (file.size > 10 * 1024 * 1024) return res.status(400).json({ message: "Voice notes must be 10 MB or smaller." });
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) return res.status(503).json({ message: "Voice note uploads are not configured yet." });
    const uploaded = await cloudinary.uploader.upload(file.tempFilePath, { folder: "beatbond/voice-notes", resource_type: "video", format: "mp3", timeout: 30_000 });
    res.status(201).json({ url: uploaded.secure_url });
  } catch (error) { next(error); }
  finally { if (file?.tempFilePath) await unlink(file.tempFilePath).catch(() => {}); }
};
