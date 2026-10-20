import mongoose from "mongoose";

const verifiedArtistSchema = new mongoose.Schema({
  artistId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  imageUrl: { type: String, default: "" },
  followerCount: { type: Number, default: 0 },
  dominantLanguage: { type: String, default: "" },
  providerVerified: { type: Boolean, default: false },
  verifiedBy: { type: String, required: true },
  verifiedAt: { type: Date, default: Date.now },
}, { timestamps: true });

verifiedArtistSchema.index({ name: 1 });

export const VerifiedArtist = mongoose.model("VerifiedArtist", verifiedArtistSchema);
