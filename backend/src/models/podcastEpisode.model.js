import mongoose from "mongoose";

const podcastEpisodeSchema = new mongoose.Schema({
  podcastId: { type: mongoose.Schema.Types.ObjectId, ref: "Podcast", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 250 },
  description: { type: String, default: "", maxlength: 10000 },
  audioUrl: { type: String, required: true, maxlength: 2048 },
  mimeType: { type: String, default: "audio/mpeg", maxlength: 100 },
  duration: { type: Number, default: 0, min: 0 },
  publishedAt: { type: Date, default: null },
  season: { type: Number, default: null, min: 0 },
  episodeNumber: { type: Number, default: null, min: 0 },
  guid: { type: String, required: true, maxlength: 2048 },
  explicit: { type: Boolean, default: false },
  chaptersUrl: { type: String, default: "", maxlength: 2048 },
  chaptersType: { type: String, default: "", maxlength: 100 },
  chapters: [{ startTime: { type: Number, min: 0 }, title: { type: String, maxlength: 200 }, url: { type: String, maxlength: 2048 } }],
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true });

podcastEpisodeSchema.index({ podcastId: 1, guid: 1 }, { unique: true });
podcastEpisodeSchema.index({ podcastId: 1, publishedAt: -1, _id: -1 });
export const PodcastEpisode = mongoose.model("PodcastEpisode", podcastEpisodeSchema);
