import mongoose from "mongoose";

const playlistSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: "", trim: true, maxlength: 500 },
  songs: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Download metadata belongs to the account, rather than a browser. The
  // client still caches media locally, while this value keeps the library in
  // sync when the user signs in on another device.
  downloadedAt: { type: Date, default: null },
}, { timestamps: true });

playlistSchema.index({ ownerId: 1, updatedAt: -1 });

export const Playlist = mongoose.model("Playlist", playlistSchema);
