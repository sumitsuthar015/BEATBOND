import { readFile, unlink } from "node:fs/promises";
import cloudinary from "../lib/cloudinary.js";
import { Message } from "../models/message.model.js";
import { User } from "../models/user.model.js";
import { isUserOnline, emitToUsers } from "../lib/realtime.js";
import { Notification } from "../models/notification.model.js";
import { sendPushToUser } from "../services/push.service.js";

const configuredLimit = (name, fallback, minimum, maximum) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
};

export const MAX_AUDIO_BYTES = () => configuredLimit("AUDIO_MAX_SIZE_BYTES", 10 * 1024 * 1024, 1024, 25 * 1024 * 1024);
export const MAX_AUDIO_SECONDS = () => configuredLimit("AUDIO_MAX_DURATION_SECONDS", 60, 1, 600);
const uploadTimeout = () => configuredLimit("AUDIO_UPLOAD_TIMEOUT_MS", 120_000, 15_000, 300_000);

export const sniffAudioMime = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "audio/webm";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") return "audio/wav";
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (buffer.toString("ascii", 0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  return "";
};

const idempotentResponse = (message, receiverId, res) => {
  if (message.receiverId !== receiverId) return res.status(409).json({ message: "This message ID was already used." });
  return res.status(200).json({ message: typeof message.toObject === "function" ? message.toObject() : message, duplicate: true });
};

const removeUploadedAudio = (publicId) => publicId
  ? cloudinary.uploader.destroy(publicId, { resource_type: "video" }).catch((error) => console.error("Unable to clean up orphaned audio asset:", error.message))
  : Promise.resolve();

export const createAudioMessage = async (req, res, next) => {
  const file = req.files?.audio;
  let uploaded;
  try {
    const senderId = req.auth().userId;
    const receiverId = typeof req.body?.receiverId === "string" ? req.body.receiverId.trim() : "";
    const clientMessageId = typeof req.body?.clientMessageId === "string" ? req.body.clientMessageId.trim() : "";
    const duration = Number(req.body?.duration);
    if (!receiverId || receiverId === senderId) return res.status(400).json({ message: "Choose a valid recipient." });
    if (!/^[\w-]{8,100}$/.test(clientMessageId)) return res.status(400).json({ message: "A valid message ID is required." });
    if (!Number.isFinite(duration) || duration < 0.3 || duration > MAX_AUDIO_SECONDS()) return res.status(400).json({ message: `Audio must be 0.3 to ${MAX_AUDIO_SECONDS()} seconds long.` });
    if (!file || Array.isArray(file) || !file.tempFilePath) return res.status(400).json({ message: "Choose an audio recording." });
    if (file.size > MAX_AUDIO_BYTES()) return res.status(413).json({ message: `Audio must be ${Math.round(MAX_AUDIO_BYTES() / 1024 / 1024)} MB or smaller.` });

    const previous = await Message.findOne({ senderId, clientMessageId });
    if (previous) return idempotentResponse(previous, receiverId, res);

    const audioBuffer = await readFile(file.tempFilePath);
    if (audioBuffer.length !== file.size || audioBuffer.length > MAX_AUDIO_BYTES()) return res.status(400).json({ message: "Audio file is invalid or incomplete." });
    const mimeType = sniffAudioMime(audioBuffer);
    if (!mimeType) return res.status(415).json({ message: "Use a supported WebM, MP4, Ogg, WAV or MP3 audio recording." });

    const [sender, receiver] = await Promise.all([
      User.findOne({ clerkId: senderId }).select("fullName imageUrl friends blockedUsers").lean(),
      User.findOne({ clerkId: receiverId }).select("blockedUsers").lean(),
    ]);
    if (!sender || !receiver) return res.status(404).json({ message: "Chat recipient not found." });
    if (!sender.friends?.includes(receiverId) || sender.blockedUsers?.includes(receiverId) || receiver.blockedUsers?.includes(senderId)) {
      return res.status(403).json({ message: "You can only send audio to a friend who has not blocked you." });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({ message: "Audio uploads are not configured yet." });
    }

    uploaded = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "beatbond/voice-notes",
      resource_type: "video",
      format: "mp3",
      timeout: uploadTimeout(),
    });

    const receiverOnline = isUserOnline(receiverId);
    let message;
    try {
      message = await Message.create({
        senderId,
        receiverId,
        clientMessageId,
        content: "Voice note",
        voiceNote: {
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
          duration,
          mimeType,
          size: audioBuffer.length,
        },
        status: receiverOnline ? "delivered" : "sent",
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await removeUploadedAudio(uploaded.public_id);
      uploaded = null;
      const existing = await Message.findOne({ senderId, clientMessageId });
      if (existing) return idempotentResponse(existing, receiverId, res);
      throw error;
    }

    const saved = message.toObject();
    const messagePayload = { message: saved, clientMessageId };
    if (receiverOnline) emitToUsers([receiverId], "messageReceived", messagePayload);
    emitToUsers([senderId], "messageSent", messagePayload);
    emitToUsers([senderId, receiverId], "messagePersisted", messagePayload);

    void Notification.create({
      userId: receiverId,
      message: "Voice note",
      type: "message",
      metadata: { messageId: String(message._id), senderId },
    }).then((notification) => {
      if (notification) emitToUsers([receiverId], "notificationReceived", {
        ...notification.toObject(),
        sender: { clerkId: senderId, fullName: sender.fullName || "BeatBond user", imageUrl: sender.imageUrl || "" },
      });
    }).catch((error) => console.error("Unable to save voice message notification:", error.message));
    void sendPushToUser(receiverId, {
      title: sender.fullName || "New message",
      body: "Sent a voice note",
      url: `/chat?userId=${encodeURIComponent(senderId)}`,
      tag: `beatbond-message-${senderId}`,
      data: { senderId, messageId: String(message._id) },
    }).catch((error) => console.error("Unable to send voice message push notification:", error.message));

    res.status(201).json({ message: saved, duplicate: false });
  } catch (error) {
    if (uploaded?.public_id) await removeUploadedAudio(uploaded.public_id);
    next(error);
  } finally {
    const files = Array.isArray(file) ? file : [file];
    await Promise.all(files.filter((item) => item?.tempFilePath).map((item) => unlink(item.tempFilePath).catch(() => {})));
  }
};
