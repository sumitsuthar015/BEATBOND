import mongoose from "mongoose";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { Song } from "../models/song.model.js";
import { getSongsByIds, searchSongs } from "./saavn.service.js";
import { isDatabaseConnected } from "../lib/db.js";

const normalise = (value) => String(value || "").trim().toLowerCase();
const artistNames = (song) => String(song?.artist || song?.artists?.primary?.map((artist) => artist?.name).filter(Boolean).join(", ") || "")
  .split(/,|&| feat\.? | ft\.? /i).map(normalise).filter(Boolean);
const identity = (song) => `${normalise(song?.name || song?.title)}|${artistNames(song).join(",")}`;
const primaryArtist = (song) => artistNames(song)[0] || "";
// "Channa Mereya (From "Ae Dil Hai Mushkil")" and a re-release are one song.
const titleKey = (song) => normalise(String(song?.name || song?.title || "").replace(/&quot;/g, '"').replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, ""))
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const VARIANT = /\b(mashup|instrumental|karaoke|lo-?fi|slowed|reverb|sped up|8d|remix|cover|reprise)\b/i;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Hybrid recommender: content similarity (artist, album, language), what other
// listeners played around this song (collaborative filtering), and this
// listener's own feedback (full listens raise an artist, skips lower it).
const weights = Object.freeze({
  sameArtist: 48,
  sameAlbum: 24,
  sameLanguage: 12,
  preferredArtist: 18,
  preferredLanguage: 8,
  coListened: 40,
  skippedByListener: -150,
  skippedArtist: -40,
  variant: -30,
});

// Plays by one person within this window of the source song count as the same session.
const SESSION_WINDOW_MS = 2 * 60 * 60 * 1000;
const CO_LISTEN_CANDIDATES = 8;

const sourceFromRequest = (songId, query = {}) => ({
  id: String(songId),
  name: String(query.title || ""),
  artist: String(query.artist || ""),
  language: String(query.language || "Unknown"),
  album: query.albumId || query.album ? { id: String(query.albumId || ""), name: String(query.album || "") } : undefined,
});

const candidateQueries = (source) => {
  const artist = primaryArtist(source);
  return [...new Set([
    artist,
    artist && source.album?.name ? `${artist} ${source.album.name}` : "",
    source.language && source.language !== "Unknown" ? source.language : "",
    source.name && artist ? `${source.name} ${artist}` : "",
  ].map((value) => String(value || "").trim()).filter((value) => value.length >= 2))];
};

/**
 * Learns from one listener's recent plays (newest first): which songs they
 * skipped, which artists they keep skipping, and which artists and languages
 * they actually listen to. A full listen counts more than a play they abandoned.
 */
export const buildListenerProfile = (history) => {
  const skippedIds = new Set();
  const artistAffinity = new Map();
  const languageAffinity = new Map();
  const artistStats = new Map();

  history.forEach((play, index) => {
    const decay = Math.max(0.2, (100 - index) / 100);
    const skippedEarly = Boolean(play.skipped) && Number(play.completionPercentage || 0) < 40;
    if (skippedEarly) skippedIds.add(String(play.songId));
    const feedback = play.completed ? 1.2 : skippedEarly ? -0.5 : 0.8;

    artistNames(play).forEach((artist) => {
      artistAffinity.set(artist, (artistAffinity.get(artist) || 0) + decay * feedback);
      const stats = artistStats.get(artist) || { plays: 0, skips: 0 };
      stats.plays += 1;
      if (skippedEarly) stats.skips += 1;
      artistStats.set(artist, stats);
    });
    const language = normalise(play.genre);
    if (language && language !== "unknown") {
      languageAffinity.set(language, (languageAffinity.get(language) || 0) + decay * Math.max(feedback, 0));
    }
  });

  // An artist skipped in most of at least three plays is one to hold back.
  const skippedArtists = new Map();
  artistStats.forEach(({ plays, skips }, artist) => {
    if (plays >= 3 && skips / plays >= 0.6) skippedArtists.set(artist, skips / plays);
  });

  return { skippedIds, artistAffinity, languageAffinity, skippedArtists };
};

/**
 * Collaborative filtering: for every time someone played the source song, look
 * at what that same person played in the same session, and count how many
 * different listeners paired each song with it. Plays that were finished
 * count fully; abandoned ones count less.
 */
export const rankCoListened = (sourcePlays, sessionPlays, source, windowMs = SESSION_WINDOW_MS) => {
  const sourceKey = identity(source);
  const bySong = new Map();
  for (const anchor of sourcePlays) {
    const anchorTime = new Date(anchor.playedAt).getTime();
    for (const play of sessionPlays) {
      if (play.userId !== anchor.userId) continue;
      if (Math.abs(new Date(play.playedAt).getTime() - anchorTime) > windowMs) continue;
      if (String(play.songId) === String(source.id) || identity(play) === sourceKey) continue;
      const key = identity(play);
      const entry = bySong.get(key) || { songId: String(play.songId), title: play.title, artist: play.artist, listeners: new Set(), weight: 0 };
      if (!entry.listeners.has(play.userId)) {
        entry.listeners.add(play.userId);
        entry.weight += play.completed ? 1 : play.skipped ? 0.3 : 0.7;
      }
      bySong.set(key, entry);
    }
  }
  return [...bySong.values()]
    .map(({ listeners, ...entry }) => ({ ...entry, listeners: listeners.size }))
    .sort((a, b) => b.weight - a.weight || b.listeners - a.listeners);
};

const findCoListened = async (source) => {
  if (!isDatabaseConnected()) return [];
  const conditions = [{ songId: source.id }];
  if (source.name) conditions.push({ title: new RegExp(`^${escapeRegex(source.name.trim())}$`, "i") });
  const sourceArtists = new Set(artistNames(source));
  const sourcePlays = (await ListeningActivity.find({ $or: conditions }).sort({ playedAt: -1 }).limit(200).select("userId songId title artist playedAt").lean())
    // A title match only counts when an artist matches too ("Hukum" isn't one song).
    .filter((play) => String(play.songId) === source.id || !sourceArtists.size || artistNames(play).some((artist) => sourceArtists.has(artist)));
  if (!sourcePlays.length) return [];

  const sessions = sourcePlays.slice(0, 60).map((play) => {
    const time = new Date(play.playedAt).getTime();
    return { userId: play.userId, playedAt: { $gte: new Date(time - SESSION_WINDOW_MS), $lte: new Date(time + SESSION_WINDOW_MS) } };
  });
  const sessionPlays = await ListeningActivity.find({ $or: sessions })
    .select("userId songId title artist playedAt completed skipped")
    .limit(2000)
    .lean();
  return rankCoListened(sourcePlays, sessionPlays, source).slice(0, CO_LISTEN_CANDIDATES);
};

// Admin uploads live in MongoDB; everything else comes from JioSaavn. Both are
// returned in the provider shape the player already understands.
const fromLocalSong = (song) => ({
  id: String(song._id),
  name: song.title,
  artists: { primary: [{ name: song.artist }] },
  image: [{ quality: "500x500", url: song.imageUrl }],
  downloadUrl: [{ quality: "320kbps", url: song.audioUrl }],
  duration: Number(song.duration) || 0,
  language: song.language || "Unknown",
  album: song.albumId ? { id: String(song.albumId), name: "" } : undefined,
});

const resolveSongs = async (songIds) => {
  const localIds = songIds.filter((id) => mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id));
  const providerIds = songIds.filter((id) => !localIds.includes(id));
  const [localSongs, providerSongs] = await Promise.all([
    localIds.length && isDatabaseConnected()
      ? Song.find({ _id: { $in: localIds } }).select("title artist imageUrl audioUrl duration albumId language").lean()
      : [],
    getSongsByIds(providerIds),
  ]);
  return [...localSongs.filter((song) => song.audioUrl).map(fromLocalSong), ...providerSongs];
};

export async function getRecommendations({ songId, source: sourceInput, userId, limit = 10 }) {
  const source = sourceFromRequest(songId, sourceInput);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const history = userId && isDatabaseConnected()
    ? await ListeningActivity.find({ userId }).sort({ playedAt: -1 }).limit(100).lean()
    : [];
  const recentIds = new Set(history.slice(0, 25).map((item) => String(item.songId)));
  const recentKeys = new Set(history.slice(0, 25).map((item) => identity(item)));
  const profile = buildListenerProfile(history);

  const [searchResponses, coListened] = await Promise.all([
    Promise.all(candidateQueries(source).map((query) => searchSongs(query, 30).catch(() => ({ data: { results: [] } })))),
    findCoListened(source).catch(() => []),
  ]);
  // Stored stream links can expire, so co-listened songs are re-fetched fresh.
  const coListenedSongs = coListened.length ? await resolveSongs(coListened.map((item) => item.songId)) : [];
  const coListenByKey = new Map(coListened.map((item) => [identity(item), item]));
  const coListenById = new Map(coListened.map((item) => [item.songId, item]));

  // One entry per song title: re-releases and copies with a different artist
  // order ("A, B" vs "B, A") would otherwise fill the queue with repeats.
  const sourceTitle = titleKey(source);
  const unique = new Map();
  [...coListenedSongs, ...searchResponses.flatMap((response) => response?.data?.results || [])].forEach((song) => {
    if (!song?.id || !song?.name || !(song?.downloadUrl || []).length) return;
    const key = titleKey(song);
    if (!key || key === sourceTitle) return;
    if (!unique.has(key)) unique.set(key, song);
  });
  const sourceIsVariant = VARIANT.test(source.name);

  const sourceArtists = new Set(artistNames(source));
  const sourceLanguage = normalise(source.language);
  const sourceAlbumId = String(source.album?.id || "");
  const ranked = [...unique.values()]
    .filter((song) => String(song.id) !== String(source.id) && !recentIds.has(String(song.id)) && !recentKeys.has(identity(song)))
    .map((song) => {
      const artists = artistNames(song);
      const language = normalise(song.language);
      let score = 0;
      const reasons = [];
      if (artists.some((artist) => sourceArtists.has(artist))) { score += weights.sameArtist; reasons.push("same artist"); }
      if (sourceAlbumId && String(song.album?.id || "") === sourceAlbumId) { score += weights.sameAlbum; reasons.push("same album"); }
      if (sourceLanguage && sourceLanguage !== "unknown" && language === sourceLanguage) { score += weights.sameLanguage; reasons.push("same language"); }
      const coListen = coListenById.get(String(song.id)) || coListenByKey.get(identity(song));
      if (coListen) {
        score += weights.coListened * Math.min(coListen.weight, 3);
        reasons.push(`${coListen.listeners} ${coListen.listeners === 1 ? "listener" : "listeners"} also played this`);
      }
      score += artists.reduce((total, artist) => total + (profile.artistAffinity.get(artist) || 0) * weights.preferredArtist, 0);
      score += (profile.languageAffinity.get(language) || 0) * weights.preferredLanguage;
      if (profile.skippedIds.has(String(song.id))) { score += weights.skippedByListener; reasons.push("you skipped this before"); }
      const artistSkipRate = Math.max(0, ...artists.map((artist) => profile.skippedArtists.get(artist) || 0));
      if (artistSkipRate) score += weights.skippedArtist * artistSkipRate;
      if (!sourceIsVariant && VARIANT.test(song.name)) score += weights.variant;
      return { song, score, reason: reasons.join(", ") || "related to your listening" };
    })
    .sort((a, b) => b.score - a.score || String(a.song.name).localeCompare(String(b.song.name)));

  // Diversity rerank: do not return more than two adjacent songs by one artist.
  const selected = [];
  for (const candidate of ranked) {
    const previous = selected.slice(-2);
    if (previous.length === 2 && previous.every((item) => primaryArtist(item.song) === primaryArtist(candidate.song))) continue;
    selected.push(candidate);
    if (selected.length === safeLimit) break;
  }

  return { sourceSong: source, recommendations: selected };
}
