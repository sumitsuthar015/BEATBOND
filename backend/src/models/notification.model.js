import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    type: { 
      type: String, 
      enum: ['message', 'friend_request', 'friend_request_response', 'system'], 
      default: 'system' 
    },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Index for faster queries
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = mongoose.model("Notification", notificationSchema);