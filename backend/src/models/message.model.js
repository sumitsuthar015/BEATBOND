import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
      ref: "User",
    },
    receiverId: {
      type: String,
      required: true,
      ref: "User",
    },
    content: {
      type: String,
      required: true,
    },
    sharedContent: {
      type: {
        type: String,
        enum: ["song", "profile", "playlist", "post", "album"],
      },
      title: String,
      subtitle: String,
      imageUrl: String,
      href: String,
      song: mongoose.Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
    },
    readAt: {
      type: Date,
      default: null
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    // Set when the sender corrects the text (shown as "edited").
    editedAt: { type: Date, default: null },
    // One emoji per person.
    reactions: [{ _id: false, userId: String, emoji: String }],
    // People who deleted this message (or cleared the chat) only for themselves.
    deletedFor: [{ type: String }],
  },
  { 
    timestamps: true 
  }
);

// Index for better query performance
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });
messageSchema.index({ status: 1 });

export const Message = mongoose.model("Message", messageSchema);
