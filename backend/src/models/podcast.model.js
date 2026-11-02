import mongoose from "mongoose";

const podcastSchema = new mongoose.Schema({
  catalogId: { type: String, default: "" },
  title: { type: String, required: true, trim: true, maxlength: 250 },
  author: { type: String, default: "", trim: true, maxlength: 200 },
  description: { type: String, default: "", maxlength: 5000 },
  coverImage: { type: String, default: "", maxlength: 2048 },
  language: { type: String, default: "", maxlength: 32 },
  categories: [{ type: String, maxlength: 80 }],
  rssUrl: { type: String, required: true, unique: true, maxlength: 2048 },
  website: { type: String, default: "", maxlength: 2048 },
  etag: { type: String, default: "", maxlength: 512 },
  lastModified: { type: String, default: "", maxlength: 128 },
  lastFetchedAt: { type: Date, default: null },
  nextFetchAt: { type: Date, default: Date.now, index: true },
  failureCount: { type: Number, default: 0, min: 0 },
  nextRetryAt: { type: Date, default: null },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

podcastSchema.index({ title: "text", author: "text", description: "text", categories: "text" });
podcastSchema.index({ catalogId: 1 }, { unique: true, partialFilterExpression: { catalogId: { $type: "string", $gt: "" } } });

export const Podcast = mongoose.model("Podcast", podcastSchema);
