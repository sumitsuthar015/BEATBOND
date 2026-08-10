import mongoose from "mongoose";

const likedArtistSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  artistId: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: "" },
  followerCount: { type: Number, default: 0 },
  dominantLanguage: { type: String, default: "" },
}, { timestamps: true });

likedArtistSchema.index({ userId: 1, artistId: 1 }, { unique: true });
export const LikedArtist = mongoose.model("LikedArtist", likedArtistSchema);
