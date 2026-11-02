import mongoose from "mongoose";

const podcastSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  podcastId: { type: mongoose.Schema.Types.ObjectId, ref: "Podcast", default: null, index: true },
  collectionId: { type: String, required: true },
  platform: { type: String, enum: ["rss", "youtube"], default: "rss" },
  videoId: { type: String, default: "", maxlength: 20 },
  title: { type: String, required: true, maxlength: 250 },
  artist: { type: String, default: "", maxlength: 200 },
  imageUrl: { type: String, default: "", maxlength: 2048 },
  feedUrl: { type: String, default: "", maxlength: 2048 },
  notify: { type: Boolean, default: true },
}, { timestamps: true });

podcastSubscriptionSchema.index({ userId: 1, collectionId: 1 }, { unique: true });
export const PodcastSubscription = mongoose.model("PodcastSubscription", podcastSubscriptionSchema);
