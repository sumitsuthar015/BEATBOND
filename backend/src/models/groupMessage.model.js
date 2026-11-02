import mongoose from "mongoose";

const groupMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "GroupConversation", required: true, index: true },
  senderId: { type: String, required: true, index: true },
  content: { type: String, required: true, maxlength: 4000 },
  voiceNote: { url: { type: String, default: "" }, duration: { type: Number, default: 0 } },
}, { timestamps: true });
groupMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const GroupMessage = mongoose.model("GroupMessage", groupMessageSchema);
