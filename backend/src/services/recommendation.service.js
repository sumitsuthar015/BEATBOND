import { ListeningActivity } from "../models/listeningActivity.model.js";
import { searchSongs } from "./saavn.service.js";
import { isDatabaseConnected } from "../lib/db.js";

const normalise = (value) => String(value || "").trim().toLowerCase();
const artistNames = (song) => String(song?.artist || song?.artists?.primary?.map((artist) => artist?.name).filter(Boolean).join(", ") || "")
  .split(/,|&| feat\.? | ft\.? /i).map(normalise).filter(Boolean);
const identity = (song) => `${normalise(song?.name || song?.title)}|${artistNames(song).join(",")}`;
const primaryArtist = (song) => artistNames(song)[0] || "";

const weights = Object.freeze({
  sameArtist: 48,
  sameAlbum: 24,
  sameLanguage: 12,
  preferredArtist: 18,
  preferredLanguage: 8,
  recentlyPlayed: -80,
});

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

export async function getRecommendations({ songId, source: sourceInput, userId, limit = 10 }) {
  const source = sourceFromRequest(songId, sourceInput);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const history = userId && isDatabaseConnected()
    ? await ListeningActivity.find({ userId }).sort({ playedAt: -1 }).limit(100).lean()
    : [];
  const recentIds = new Set(history.slice(0, 25).map((item) => String(item.songId)));
  const recentKeys = new Set(history.slice(0, 25).map((item) => `${normalise(item.title)}|${normalise(item.artist)}`));
  const artistAffinity = new Map();
  const languageAffinity = new Map();
  history.forEach((item, index) => {
    const decay = Math.max(0.2, (100 - index) / 100);
    artistNames(item).forEach((artist) => artistAffinity.set(artist, (artistAffinity.get(artist) || 0) + decay));
    const language = normalise(item.genre);
    if (language && language !== "unknown") languageAffinity.set(language, (languageAffinity.get(language) || 0) + decay);
  });

  const responses = await Promise.all(candidateQueries(source).map((query) => searchSongs(query, 30).catch(() => ({ data: { results: [] } }))));
  const unique = new Map();
  responses.flatMap((response) => response?.data?.results || []).forEach((song) => {
    if (!song?.id || !song?.name || !(song?.downloadUrl || []).length) return;
    const key = identity(song);
    if (!unique.has(key)) unique.set(key, song);
  });

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
      score += artists.reduce((total, artist) => total + (artistAffinity.get(artist) || 0) * weights.preferredArtist, 0);
      score += (languageAffinity.get(language) || 0) * weights.preferredLanguage;
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
