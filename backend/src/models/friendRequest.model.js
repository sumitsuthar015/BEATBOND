import mongoose from "mongoose";

const friendRequestSchema = new mongoose.Schema(
  {
    senderId: { 
      type: String, 
      required: true,
      index: true
    },
    receiverId: { 
      type: String, 
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate requests
friendRequestSchema.index({ senderId: 1, receiverId: 1 }, { unique: true });

export const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);