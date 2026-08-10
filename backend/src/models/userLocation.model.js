import mongoose from "mongoose";

const userLocationSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  sharingEnabled: { type: Boolean, default: false, index: true },
  visibility: { type: String, enum: ["friends"], default: "friends" },
  updatedAt: { type: Date, default: Date.now },
});
userLocationSchema.index({ sharingEnabled: 1, updatedAt: -1 });

export const UserLocation = mongoose.model("UserLocation", userLocationSchema);
