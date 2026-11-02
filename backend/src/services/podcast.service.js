import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Podcast } from "../models/podcast.model.js";
import { PodcastEpisode } from "../models/podcastEpisode.model.js";

const searchCache = new Map();
let discoveryCache = { until: 0, value: null };
let refreshInProgress = false;
const XML_LIMIT = 3 * 1024 * 1024;
const CHAPTERS_LIMIT = 100;
const REFRESH_INTERVAL_MS = 30 * 60_000;

const decodeXml = (value = "") => String(value)
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const stripUnsafeMarkup = (value = "") => decodeXml(value)
  .replace(/<(script|style|iframe|object|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
  .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const safeTag = (tag) => tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tagText = (xml, tag) => {
  const match = String(xml || "").match(new RegExp(`<${safeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag(tag)}\\s*>`, "i"));
  return match ? stripUnsafeMarkup(match[1]) : "";
};
const attribute = (markup, name) => {
  const match = String(markup || "").match(new RegExp(`\\b${safeTag(name)}=["']([^"']*)["']`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
};
const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const isUnsafeAudioUrl = (value) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return !["http:", "https:"].includes(url.protocol) || Boolean(url.username || url.password)
      || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")
      || (isIP(hostname) && isPrivateAddress(hostname));
  } catch { return true; }
};

export const parsePodcastDuration = (value) => {
  const input = String(value || "").trim();
  if (!input) return 0;
  if (/^\d+(?:\.\d+)?$/.test(input)) return Math.max(0, Number(input));
  const parts = input.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) return 0;
  const values = parts.map(Number);
  if (values.slice(1).some((part) => part >= 60)) return 0;
  const duration = values.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(duration) ? duration : 0;
};

const safeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

export const parsePodcastFeed = (xml, podcast = {}) => {
  const items = [...String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)].slice(0, 100);
  return items.map(([, item], index) => {
    const enclosure = item.match(/<enclosure\b[^>]*>/i)?.[0] || "";
    const audioUrl = attribute(enclosure, "url");
    const mimeType = attribute(enclosure, "type").toLowerCase().slice(0, 100);
    const title = tagText(item, "title");
    if (!audioUrl || isUnsafeAudioUrl(audioUrl) || (mimeType && !mimeType.startsWith("audio/")) || !title) return null;
    const chapterTag = item.match(/<podcast:chapters\b[^>]*>/i)?.[0] || "";
    const imageTag = item.match(/<itunes:image\b[^>]*>/i)?.[0] || "";
    const explicitText = tagText(item, "itunes:explicit").toLowerCase();
    const guid = (tagText(item, "guid") || audioUrl || `${title}:${tagText(item, "pubDate") || index}`).slice(0, 2048);
    return {
      id: guid,
      title: title.slice(0, 250),
      description: tagText(item, "content:encoded") || tagText(item, "description"),
      audioUrl,
      mimeType: mimeType || "audio/mpeg",
      duration: parsePodcastDuration(tagText(item, "itunes:duration")),
      publishedAt: safeDate(tagText(item, "pubDate")) || new Date(),
      season: numberOrNull(tagText(item, "itunes:season")),
      episodeNumber: numberOrNull(tagText(item, "itunes:episode")),
      guid,
      explicit: ["yes", "true", "explicit"].includes(explicitText),
      imageUrl: attribute(imageTag, "href") || podcast.coverImage || podcast.imageUrl || "",
      chaptersUrl: attribute(chapterTag, "url"),
      chaptersType: attribute(chapterTag, "type"),
    };
  }).filter(Boolean);
};

export const parsePodcastMetadata = (xml, rssUrl) => {
  const channel = String(xml || "").match(/<channel\b[^>]*>([\s\S]*?)<\/channel\s*>/i)?.[1] || "";
  const imageTag = channel.match(/<itunes:image\b[^>]*>/i)?.[0] || "";
  const standardImage = channel.match(/<image\b[^>]*>[\s\S]*?<\/image\s*>/i)?.[0] || "";
  const categoryTags = [...channel.matchAll(/<itunes:category\b[^>]*>/gi)];
  const categories = [...new Set(categoryTags.map(([, value]) => attribute(value, "text")).filter(Boolean))].slice(0, 30);
  const description = tagText(channel, "itunes:summary") || tagText(channel, "description");
  const image = attribute(imageTag, "href") || tagText(standardImage, "url");
  return {
    title: (tagText(channel, "title") || new URL(rssUrl).hostname).slice(0, 250),
    author: (tagText(channel, "itunes:author") || tagText(channel, "managingEditor")).slice(0, 200),
    description: description.slice(0, 5000),
    coverImage: /^https?:\/\//i.test(image) ? image.slice(0, 2048) : "",
    language: tagText(channel, "language").slice(0, 32),
    categories,
    website: /^https:\/\//i.test(tagText(channel, "link")) ? tagText(channel, "link").slice(0, 2048) : "",
    rssUrl,
  };
};

const isPrivateAddress = (address) => {
  const ip = address.toLowerCase();
  if (ip.includes(":")) return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:") || ip.startsWith("::ffff:");
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
};

export const assertPublicFeedUrl = async (value) => {
  const url = new URL(value);
  if (!(["https:", "http:"].includes(url.protocol)) || url.username || url.password || url.port || url.hostname.length > 253) throw new Error("Podcast feed must use a public HTTP or HTTPS URL.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") || isIP(hostname)) throw new Error("Podcast feed host is not public.");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Podcast feed host resolves to a non-public address.");
  return url;
};

const readLimitedBody = async (response, maxBytes = XML_LIMIT) => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Podcast feed returned an empty response.");
  const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error(`Podcast response is larger than ${Math.floor(maxBytes / 1024)} KB.`); }
    chunks.push(Buffer.from(value));
  }
  const bytes = Buffer.concat(chunks);
  const contentType = response.headers.get("content-type") || "";
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().replace(/["']/g, "");
  try { return new TextDecoder(charset || "utf-8", { fatal: false }).decode(bytes); }
  catch { return bytes.toString("utf8"); }
};

const fetchPublicFeed = async (urlValue, { etag = "", lastModified = "" } = {}) => {
  let url = await assertPublicFeedUrl(urlValue);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const headers = { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "User-Agent": "BeatBondPodcast/1.0" };
    if (etag) headers["If-None-Match"] = etag;
    if (lastModified) headers["If-Modified-Since"] = lastModified;
    const response = await fetch(url, { redirect: "manual", headers, signal: AbortSignal.timeout(10_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("Podcast feed redirected too many times.");
      url = await assertPublicFeedUrl(new URL(location, url).href);
      etag = ""; lastModified = "";
      continue;
    }
    if (response.status === 304) return { status: 304, xml: "", etag: etag || response.headers.get("etag") || "", lastModified: lastModified || response.headers.get("last-modified") || "" };
    if (!response.ok) throw new Error(`Podcast feed returned ${response.status}.`);
    return { status: response.status, xml: await readLimitedBody(response), etag: response.headers.get("etag") || "", lastModified: response.headers.get("last-modified") || "" };
  }
  throw new Error("Could not load podcast feed.");
};

const saveParsedEpisodes = async (podcast, xml, now = new Date()) => {
  const episodes = parsePodcastFeed(xml, podcast);
  if (!episodes.length) throw new Error("No playable audio episodes were found in the podcast feed.");
  const operations = episodes.map((episode) => ({
    updateOne: {
      filter: { podcastId: podcast._id, guid: episode.guid },
      update: { $set: {
        title: episode.title, description: episode.description, audioUrl: episode.audioUrl, mimeType: episode.mimeType,
        duration: episode.duration, publishedAt: episode.publishedAt, season: episode.season,
        episodeNumber: episode.episodeNumber, explicit: episode.explicit, chaptersUrl: episode.chaptersUrl,
        chaptersType: episode.chaptersType, isActive: true,
      } },
      upsert: true,
    },
  }));
  await PodcastEpisode.bulkWrite(operations, { ordered: false });
  const chapterSources = episodes.filter((episode) => episode.chaptersUrl).slice(0, 5);
  await Promise.allSettled(chapterSources.map(async (episode) => {
    const chapters = await fetchPodcastChapters(episode.chaptersUrl);
    await PodcastEpisode.updateOne({ podcastId: podcast._id, guid: episode.guid }, { $set: { chapters } });
  }));
  const metadata = parsePodcastMetadata(xml, podcast.rssUrl);
  return { episodeCount: episodes.length, metadata, fetchedAt: now };
};

export const fetchPodcastChapters = async (chaptersUrl) => {
  const safeUrl = await assertPublicFeedUrl(chaptersUrl);
  const response = await fetch(safeUrl, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Podcast chapters are unavailable.");
  const raw = await readLimitedBody(response, 512 * 1024);
  const payload = JSON.parse(raw);
  return (Array.isArray(payload.chapters) ? payload.chapters : []).slice(0, CHAPTERS_LIMIT).map((chapter) => ({
    startTime: typeof chapter.startTime === "number" ? chapter.startTime : parsePodcastDuration(chapter.startTime),
    title: stripUnsafeMarkup(chapter.title || "").slice(0, 200),
    url: /^https?:\/\//i.test(String(chapter.url || "")) ? String(chapter.url).slice(0, 2048) : "",
  })).filter((chapter) => Number.isFinite(chapter.startTime) && chapter.startTime >= 0 && chapter.title)
    .sort((left, right) => left.startTime - right.startTime);
};

const saveConditionalHeaders = (fetchResult, now) => ({
  etag: fetchResult.etag || "",
  lastModified: fetchResult.lastModified || "",
  lastFetchedAt: now,
  nextFetchAt: new Date(now.getTime() + REFRESH_INTERVAL_MS),
  nextRetryAt: null,
  failureCount: 0,
});

export const refreshPodcastFeed = async (podcastId, now = new Date()) => {
  const podcast = await Podcast.findById(podcastId);
  if (!podcast) throw new Error("Podcast was not found.");
  try {
    const fetched = await fetchPublicFeed(podcast.rssUrl, { etag: podcast.etag, lastModified: podcast.lastModified });
    if (fetched.status === 304) {
      await Podcast.updateOne({ _id: podcast._id }, { $set: saveConditionalHeaders(fetched, now) });
      return { updated: false, podcastId: String(podcast._id) };
    }
    const saved = await saveParsedEpisodes(podcast, fetched.xml, now);
    await Podcast.updateOne({ _id: podcast._id }, { $set: { ...saved.metadata, ...saveConditionalHeaders(fetched, now) } });
    return { updated: true, podcastId: String(podcast._id), episodeCount: saved.episodeCount };
  } catch (error) {
    const failures = (podcast.failureCount || 0) + 1;
    const delay = Math.min(6 * 60 * 60_000, 60_000 * (2 ** Math.min(failures - 1, 8)));
    await Podcast.updateOne({ _id: podcast._id }, { $set: { failureCount: failures, nextRetryAt: new Date(now.getTime() + delay), nextFetchAt: new Date(now.getTime() + delay) } });
    throw error;
  }
};

export const refreshDuePodcastFeeds = async (now = new Date(), limit = 20) => {
  if (refreshInProgress) return [];
  refreshInProgress = true;
  try {
  const due = await Podcast.find({ active: true, nextFetchAt: { $lte: now }, $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }] })
    .sort({ lastFetchedAt: 1, _id: 1 }).limit(Math.min(50, Math.max(1, limit))).select("_id").lean();
  const results = [];
  for (const { _id } of due) {
    try { results.push(await refreshPodcastFeed(_id, now)); }
    catch (error) { console.error(`Podcast feed refresh failed for ${_id}:`, error.message); }
  }
  return results;
  } finally {
    refreshInProgress = false;
  }
};

export const searchPodcasts = async (query) => {
  const normalized = String(query || "").trim().slice(0, 100);
  if (normalized.length < 2) return [];
  const cached = searchCache.get(normalized.toLowerCase());
  if (cached && cached.until > Date.now()) return cached.value;
  const response = await fetch(`https://itunes.apple.com/search?media=podcast&entity=podcast&limit=25&term=${encodeURIComponent(normalized)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Podcast search is temporarily unavailable.");
  const payload = await response.json();
  const results = (payload.results || []).map((item) => ({
    collectionId: String(item.collectionId || ""), title: String(item.collectionName || "").slice(0, 250),
    artist: String(item.artistName || "").slice(0, 200), imageUrl: String(item.artworkUrl600 || item.artworkUrl100 || ""),
    episodeCount: Number(item.trackCount) || 0, platform: "rss",
  })).filter((item) => /^\d{1,20}$/.test(item.collectionId) && item.title && /^https:\/\//i.test(item.imageUrl));
  searchCache.set(normalized.toLowerCase(), { value: results, until: Date.now() + 5 * 60_000 });
  return results;
};

export const discoverPodcasts = async () => {
  if (discoveryCache.value && discoveryCache.until > Date.now()) return discoveryCache.value;
  const [newPodcasts, chartResponse] = await Promise.all([
    searchPodcasts("new podcasts"),
    fetch("https://rss.marketingtools.apple.com/api/v2/in/podcasts/top/25/podcasts.json", { signal: AbortSignal.timeout(8000) }),
  ]);
  if (!chartResponse.ok) throw new Error("Trending podcast suggestions are temporarily unavailable.");
  const chart = await chartResponse.json();
  const trendingPodcasts = (chart.feed?.results || []).map((item) => ({
    collectionId: String(item.id || ""), title: String(item.name || "").slice(0, 250),
    artist: String(item.artistName || "").slice(0, 200), imageUrl: String(item.artworkUrl100 || ""),
    episodeCount: 0, platform: "rss",
  })).filter((item) => /^\d{1,20}$/.test(item.collectionId) && item.title && /^https:\/\//i.test(item.imageUrl)).slice(0, 10);
  const trendingIds = new Set(trendingPodcasts.map((item) => item.collectionId));
  const value = { newPodcasts: newPodcasts.filter((item) => !trendingIds.has(item.collectionId)).slice(0, 10), trendingPodcasts };
  discoveryCache = { value, until: Date.now() + 15 * 60_000 };
  return value;
};

export const lookupPodcast = async (collectionId) => {
  const id = String(collectionId || "");
  if (!/^\d{1,20}$/.test(id)) throw new Error("Invalid podcast id.");
  const response = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=podcast`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Podcast could not be found right now.");
  const payload = await response.json();
  const item = (payload.results || []).find((result) => String(result.collectionId) === id && result.feedUrl);
  if (!item) throw new Error("Podcast feed is unavailable.");
  const feedUrl = String(item.feedUrl);
  await assertPublicFeedUrl(feedUrl);
  return {
    catalogId: id,
    title: String(item.collectionName || "").slice(0, 250),
    author: String(item.artistName || "").slice(0, 200),
    description: stripUnsafeMarkup(item.collectionDescription || "").slice(0, 5000),
    coverImage: String(item.artworkUrl600 || item.artworkUrl100 || ""),
    language: String(item.language || "").slice(0, 32),
    categories: Array.isArray(item.genres) ? item.genres.map((genre) => String(genre).slice(0, 80)).slice(0, 30) : [],
    website: String(item.artistViewUrl || ""),
    rssUrl: feedUrl,
    episodeCount: Number(item.trackCount) || 0,
  };
};

export const ensureCatalogPodcast = async (collectionId, { refresh = true } = {}) => {
  const data = await lookupPodcast(collectionId);
  const podcast = await Podcast.findOneAndUpdate(
    { catalogId: data.catalogId },
    { $set: { ...data, active: true }, $setOnInsert: { nextFetchAt: new Date() } },
    { upsert: true, new: true, runValidators: true },
  );
  if (refresh && (!podcast.lastFetchedAt || Date.now() - podcast.lastFetchedAt.getTime() > REFRESH_INTERVAL_MS)) {
    try { await refreshPodcastFeed(podcast._id); }
    catch (error) { if (!podcast.lastFetchedAt) throw error; }
  }
  return Podcast.findById(podcast._id).lean();
};

export const addPodcastFromRSS = async (rssUrl) => {
  const safeUrl = await assertPublicFeedUrl(rssUrl);
  const fetched = await fetchPublicFeed(safeUrl.href);
  const metadata = parsePodcastMetadata(fetched.xml, safeUrl.href);
  const podcast = await Podcast.findOneAndUpdate(
    { rssUrl: safeUrl.href },
    { $set: { ...metadata, ...saveConditionalHeaders(fetched, new Date()), active: true }, $setOnInsert: { catalogId: "" } },
    { upsert: true, new: true, runValidators: true },
  );
  const saved = await saveParsedEpisodes(podcast, fetched.xml);
  await Podcast.updateOne({ _id: podcast._id }, { $set: saved.metadata });
  return Podcast.findById(podcast._id).lean();
};

export const getCatalogPodcastEpisodes = async (collectionId) => {
  const podcast = await ensureCatalogPodcast(collectionId);
  const episodes = await PodcastEpisode.find({ podcastId: podcast._id, isActive: true })
    .sort({ publishedAt: -1, _id: -1 }).limit(100).lean();
  return { podcast, episodes };
};
