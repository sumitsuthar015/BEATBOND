import mongoose from "mongoose";
import { Podcast } from "../models/podcast.model.js";
import { PodcastEpisode } from "../models/podcastEpisode.model.js";
import { PodcastProgress } from "../models/podcastProgress.model.js";
import { PodcastSubscription } from "../models/podcastSubscription.model.js";
import { User } from "../models/user.model.js";
import {
  addPodcastFromRSS, discoverPodcasts, ensureCatalogPodcast, getCatalogPodcastEpisodes,
  searchPodcasts,
} from "../services/podcast.service.js";

const objectId = (value) => mongoose.isValidObjectId(value);
const parseLimit = (value, fallback = 20) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(50, Math.max(1, parsed)) : fallback;
};
export const normalizePodcastProgress = (duration, previous, body) => {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  let positionSeconds = body.mark === "played" ? safeDuration
    : body.mark === "unplayed" ? 0
      : (body.positionSeconds ?? previous?.positionSeconds ?? 0);
  if (safeDuration > 0) positionSeconds = Math.min(safeDuration, positionSeconds);
  const completed = body.mark === "played" ? true
    : body.mark === "unplayed" ? false
      : (body.completed ?? (safeDuration > 0 && positionSeconds / safeDuration >= 0.95));
  return { positionSeconds, completed };
};
const encodeCursor = (item) => Buffer.from(JSON.stringify({ date: item.publishedAt?.toISOString?.() || "", id: String(item._id) })).toString("base64url");
const encodeIdCursor = (id) => Buffer.from(JSON.stringify({ id: String(id) })).toString("base64url");
const decodeCursor = (value) => {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 256) throw new Error("Invalid pagination cursor.");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!objectId(parsed.id) || !Number.isFinite(new Date(parsed.date).getTime())) throw new Error();
    return { date: new Date(parsed.date), id: new mongoose.Types.ObjectId(parsed.id) };
  } catch { throw new Error("Invalid pagination cursor."); }
};
const decodeIdCursor = (value) => {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 256) throw new Error("Invalid pagination cursor.");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!objectId(parsed.id)) throw new Error();
    return new mongoose.Types.ObjectId(parsed.id);
  } catch { throw new Error("Invalid pagination cursor."); }
};

export const getPodcastDiscoverFeed = async (_req, res, next) => {
  try { res.json(await discoverPodcasts()); }
  catch (error) { next(error); }
};

export const searchPodcastCatalog = async (req, res, next) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2 || query.length > 100) return res.status(400).json({ message: "Search with 2 to 100 characters." });
    res.json({ podcasts: await searchPodcasts(query) });
  } catch (error) { next(error); }
};

export const getPodcastFeed = async (req, res, next) => {
  try {
    const { podcast, episodes } = await getCatalogPodcastEpisodes(req.params.collectionId);
    const progress = await PodcastProgress.find({ userId: req.auth().userId, episodeId: { $in: episodes.map((episode) => episode._id) } }).lean();
    const progressByEpisode = new Map(progress.map((item) => [String(item.episodeId), item]));
    res.json({
      podcast: { id: String(podcast._id), collectionId: podcast.catalogId, title: podcast.title, artist: podcast.author, imageUrl: podcast.coverImage, episodeCount: podcast.episodeCount || episodes.length, description: podcast.description, categories: podcast.categories },
      episodes: episodes.map((episode) => {
        const saved = progressByEpisode.get(String(episode._id));
        return { id: String(episode._id), guid: episode.guid, title: episode.title, description: episode.description, audioUrl: episode.audioUrl, mimeType: episode.mimeType, duration: episode.duration, publishedAt: episode.publishedAt, season: episode.season, episodeNumber: episode.episodeNumber, explicit: episode.explicit, imageUrl: podcast.coverImage, progressSeconds: saved?.positionSeconds || 0, completed: saved?.completed || false, chapters: episode.chapters || [] };
      }),
    });
  } catch (error) { next(error); }
};

export const getMyPodcastSubscriptions = async (req, res, next) => {
  try { res.json(await PodcastSubscription.find({ userId: req.auth().userId }).sort({ createdAt: -1 }).lean()); }
  catch (error) { next(error); }
};

export const subscribeToPodcast = async (req, res, next) => {
  try {
    const requestedId = typeof req.body?.collectionId === "string" ? req.body.collectionId.trim() : "";
    const podcast = await ensureCatalogPodcast(requestedId);
    const saved = await PodcastSubscription.findOneAndUpdate(
      { userId: req.auth().userId, collectionId: requestedId },
      { $set: { podcastId: podcast._id, platform: "rss", title: podcast.title, artist: podcast.author, imageUrl: podcast.coverImage, feedUrl: podcast.rssUrl } },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    res.status(200).json({ ...saved, podcastId: String(podcast._id) });
  } catch (error) { next(error); }
};

export const unsubscribeFromPodcast = async (req, res, next) => {
  try {
    const result = await PodcastSubscription.deleteOne({ userId: req.auth().userId, collectionId: req.params.collectionId });
    if (!result.deletedCount) return res.status(404).json({ message: "Podcast subscription not found." });
    res.status(204).end();
  } catch (error) { next(error); }
};

export const browsePodcasts = async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const cursor = decodeIdCursor(req.query.cursor);
    const filter = { active: true };
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim().slice(0, 80) : "";
    if (query) filter.$text = { $search: query };
    if (category) filter.categories = category;
    if (cursor) filter._id = { $lt: cursor };
    const items = await Podcast.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = items.length > limit;
    const podcasts = items.slice(0, limit);
    res.json({ podcasts, nextCursor: hasMore ? encodeIdCursor(podcasts.at(-1)._id) : null });
  } catch (error) { next(error); }
};

export const getPodcastById = async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ message: "Invalid podcast id." });
    const podcast = await Podcast.findOne({ _id: req.params.id, active: true }).lean();
    if (!podcast) return res.status(404).json({ message: "Podcast not found." });
    res.json(podcast);
  } catch (error) { next(error); }
};

export const getPodcastEpisodesPage = async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ message: "Invalid podcast id." });
    const limit = parseLimit(req.query.limit);
    const sortOrder = req.query.sort === "oldest" ? 1 : -1;
    const cursor = decodeCursor(req.query.cursor);
    const filter = { podcastId: req.params.id, isActive: true };
    if (cursor) filter.$or = [
      { publishedAt: { [sortOrder === 1 ? "$gt" : "$lt"]: cursor.date } },
      { publishedAt: cursor.date, _id: { [sortOrder === 1 ? "$gt" : "$lt"]: cursor.id } },
    ];
    const items = await PodcastEpisode.find(filter).sort({ publishedAt: sortOrder, _id: sortOrder }).limit(limit + 1).lean();
    const hasMore = items.length > limit;
    const episodes = items.slice(0, limit);
    res.json({ episodes, nextCursor: hasMore ? encodeCursor(episodes.at(-1)) : null });
  } catch (error) { next(error); }
};

export const addPodcastByRSS = async (req, res, next) => {
  try {
    const rssUrl = typeof req.body?.rssUrl === "string" ? req.body.rssUrl.trim() : "";
    if (rssUrl.length > 2048 || !/^https:\/\//i.test(rssUrl)) return res.status(400).json({ message: "Provide a public HTTPS RSS feed URL." });
    res.status(201).json(await addPodcastFromRSS(rssUrl));
  } catch (error) { next(error); }
};

export const subscribeToPodcastById = async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ message: "Invalid podcast id." });
    const podcast = await Podcast.findOne({ _id: req.params.id, active: true }).lean();
    if (!podcast) return res.status(404).json({ message: "Podcast not found." });
    const subscription = await PodcastSubscription.findOneAndUpdate(
      { userId: req.auth().userId, collectionId: podcast.catalogId || String(podcast._id) },
      { $set: { collectionId: podcast.catalogId || String(podcast._id), platform: "rss", title: podcast.title, artist: podcast.author, imageUrl: podcast.coverImage, feedUrl: podcast.rssUrl }, $setOnInsert: { notify: true } },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    res.status(200).json(subscription);
  } catch (error) { next(error); }
};

export const unsubscribeFromPodcastById = async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ message: "Invalid podcast id." });
    const result = await PodcastSubscription.deleteOne({ userId: req.auth().userId, podcastId: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ message: "Podcast subscription not found." });
    res.status(204).end();
  } catch (error) { next(error); }
};

export const getMyPodcastSubscriptionsV1 = async (req, res, next) => {
  try {
    const subscriptions = await PodcastSubscription.find({ userId: req.auth().userId, podcastId: { $ne: null } }).sort({ createdAt: -1 }).lean();
    const ids = subscriptions.map((item) => item.podcastId);
    const podcasts = await Podcast.find({ _id: { $in: ids }, active: true }).lean();
    const byId = new Map(podcasts.map((podcast) => [String(podcast._id), podcast]));
    res.json(subscriptions.map((item) => ({ ...item, podcast: byId.get(String(item.podcastId)) || null })));
  } catch (error) { next(error); }
};

export const saveEpisodeProgress = async (req, res, next) => {
  try {
    if (!objectId(req.params.id)) return res.status(400).json({ message: "Invalid episode id." });
    const episode = await PodcastEpisode.findById(req.params.id).select("duration").lean();
    if (!episode) return res.status(404).json({ message: "Episode not found." });
    const body = req.body || {};
    if (body.positionSeconds !== undefined && (typeof body.positionSeconds !== "number" || !Number.isFinite(body.positionSeconds) || body.positionSeconds < 0)) return res.status(400).json({ message: "Position must be a finite number greater than or equal to zero." });
    if (body.completed !== undefined && typeof body.completed !== "boolean") return res.status(400).json({ message: "Completed must be true or false." });
    if (body.mark !== undefined && !["played", "unplayed"].includes(body.mark)) return res.status(400).json({ message: "Mark must be played or unplayed." });
    const previous = await PodcastProgress.findOne({ userId: req.auth().userId, episodeId: episode._id }).lean();
    const { positionSeconds, completed } = normalizePodcastProgress(episode.duration, previous, body);
    const progress = await PodcastProgress.findOneAndUpdate(
      { userId: req.auth().userId, episodeId: episode._id },
      { $set: { positionSeconds, completed } },
      { upsert: true, new: true, runValidators: true },
    ).lean();
    res.json(progress);
  } catch (error) { next(error); }
};

export const getContinueListening = async (req, res, next) => {
  try {
    const progress = await PodcastProgress.find({ userId: req.auth().userId, completed: false, positionSeconds: { $gt: 0 } })
      .sort({ updatedAt: -1 }).limit(30).lean();
    const episodeIds = progress.map((item) => item.episodeId);
    const episodes = await PodcastEpisode.find({ _id: { $in: episodeIds }, isActive: true }).lean();
    const podcastIds = [...new Set(episodes.map((item) => String(item.podcastId)))];
    const podcasts = await Podcast.find({ _id: { $in: podcastIds }, active: true }).lean();
    const episodeById = new Map(episodes.map((item) => [String(item._id), item]));
    const podcastById = new Map(podcasts.map((item) => [String(item._id), item]));
    res.json(progress.flatMap((saved) => {
      const episode = episodeById.get(String(saved.episodeId));
      const podcast = episode && podcastById.get(String(episode.podcastId));
      return episode && podcast ? [{ progress: saved, episode, podcast }] : [];
    }));
  } catch (error) { next(error); }
};

export const getNewPodcastEpisodes = async (req, res, next) => {
  try {
    const subscriptions = await PodcastSubscription.find({ userId: req.auth().userId, podcastId: { $ne: null }, notify: true }).select("podcastId createdAt").lean();
    if (!subscriptions.length) return res.json([]);
    const podcastIds = subscriptions.map((item) => item.podcastId);
    const episodes = await PodcastEpisode.find({ podcastId: { $in: podcastIds }, isActive: true, publishedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60_000) } })
      .sort({ publishedAt: -1, _id: -1 }).limit(50).lean();
    const podcasts = await Podcast.find({ _id: { $in: podcastIds } }).lean();
    const podcastById = new Map(podcasts.map((item) => [String(item._id), item]));
    const subscribedAt = new Map(subscriptions.map((item) => [String(item.podcastId), item.createdAt]));
    res.json(episodes.filter((episode) => episode.publishedAt >= subscribedAt.get(String(episode.podcastId))).map((episode) => ({ episode, podcast: podcastById.get(String(episode.podcastId)) })).filter((item) => item.podcast));
  } catch (error) { next(error); }
};

export const getPodcastPlaybackPreference = async (req, res, next) => {
  try {
    const user = await User.findOne({ clerkId: req.auth().userId }).select("podcastPlaybackSpeed").lean();
    res.json({ speed: user?.podcastPlaybackSpeed || 1 });
  } catch (error) { next(error); }
};

export const setPodcastPlaybackPreference = async (req, res, next) => {
  try {
    const speed = req.body?.speed;
    if (typeof speed !== "number" || !Number.isFinite(speed) || speed < 0.5 || speed > 3) return res.status(400).json({ message: "Playback speed must be between 0.5x and 3x." });
    const user = await User.findOneAndUpdate({ clerkId: req.auth().userId }, { $set: { podcastPlaybackSpeed: speed } }, { new: true }).select("podcastPlaybackSpeed").lean();
    if (!user) return res.status(404).json({ message: "User profile not found." });
    res.json({ speed: user.podcastPlaybackSpeed });
  } catch (error) { next(error); }
};
