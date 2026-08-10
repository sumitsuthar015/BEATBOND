import mongoose from "mongoose";

const avatarSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  gender: { type: String, enum: ["male", "female"], default: "female" },
  options: { type: Map, of: String, default: {} },
}, { timestamps: true });

export const Avatar = mongoose.model("Avatar", avatarSchema);
