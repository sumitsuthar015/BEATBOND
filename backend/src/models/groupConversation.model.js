import mongoose from "mongoose";

const groupConversationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 300, default: "" },
  imageUrl: { type: String, trim: true, maxlength: 2000, default: "" },
  imagePublicId: { type: String, trim: true, maxlength: 300, default: "" },
  ownerId: { type: String, required: true, index: true },
  members: [{ userId: { type: String, required: true }, joinedAt: { type: Date, default: Date.now } }],
  lastMessage: { type: String, default: "" },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
groupConversationSchema.index({ "members.userId": 1, lastMessageAt: -1 });

export const GroupConversation = mongoose.model("GroupConversation", groupConversationSchema);
