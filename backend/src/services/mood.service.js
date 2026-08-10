import { searchSongs } from "./saavn.service.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const moodCache = new Map();

// These are listening intents, not superficial mood-keyword searches. They
// provide broad catalogue entry points; the scorer below decides what is
// emotionally appropriate before anything reaches the client.
const moodProfiles = {
  happy: {
    searches: ["bollywood uplifting", "feel good hindi", "positive pop"],
    positive: ["feel good", "smile", "sunshine", "joy", "uplift", "zindagi", "khushi", "good day"],
    exclude: ["sad", "heartbreak", "breakup", "pain", "cry", "lofi", "slowed", "reverb", "remix"],
  },
  sad: {
    searches: ["heartbreak hindi", "emotional ballads", "soulful hindi"],
    positive: ["heart", "dil", "judai", "tanha", "emotional", "pain", "yaad", "breakup", "sad"],
    exclude: ["party", "dance", "club", "remix", "lofi", "slowed", "reverb"],
  },
  romantic: {
    searches: ["bollywood love songs", "romantic ballads", "soft hindi love"],
    positive: ["love", "ishq", "pyaar", "pyar", "mohabbat", "romantic", "dil", "saath", "tum"],
    exclude: ["party", "dance", "club", "remix", "lofi", "slowed", "reverb"],
  },
  party: {
    searches: ["bollywood dance anthems", "punjabi dance", "high energy pop"],
    positive: ["dance", "party", "club", "dhol", "bhangra", "nach", "dj", "beat", "anthem", "disco"],
    exclude: ["sad", "heartbreak", "lofi", "slowed", "reverb", "acoustic", "unplugged"],
  },
};

const textFor = (song) => [song.name, song.title, song.album?.name, song.language, song.artists?.primary?.map((artist) => artist.name).join(" ")]
  .filter(Boolean).join(" ").toLowerCase();

const mapSong = (song) => {
  const audioUrl = song.downloadUrl?.find((item) => item.quality === "320kbps")?.url || song.downloadUrl?.find((item) => item.quality === "160kbps")?.url || song.downloadUrl?.[0]?.url;
  if (!song.id || !song.name || !audioUrl) return null;
  return {
    _id: String(song.id),
    title: String(song.name),
    artist: song.artists?.primary?.map((item) => item.name).filter(Boolean).join(", ") || "Unknown Artist",
    imageUrl: song.image?.[2]?.url || song.image?.[1]?.url || song.image?.[0]?.url || "/default-image.png",
    audioUrl,
    duration: Number(song.duration) || 0,
    albumId: String(song.album?.id || ""),
    albumName: String(song.album?.name || ""),
    genre: String(song.language || "Unknown"),
    videoUrl: null,
    playedAt: "",
    userId: undefined,
    isLiked: false,
    lyrics: "",
    createdAt: "",
    updatedAt: "",
  };
};

const scoreSong = (song, profile, sourceIndex) => {
  const text = textFor(song);
  if (profile.exclude.some((term) => text.includes(term))) return Number.NEGATIVE_INFINITY;
  const signalScore = profile.positive.reduce((score, term) => score + (text.includes(term) ? 30 : 0), 0);
  // Source order reflects intentional editorial searches. A small result-order
  // bonus keeps Saavn's strongest matches while never overriding mood safety.
  return 200 - sourceIndex * 10 + signalScore;
};

export async function getMoodBasedSongs(mood) {
  const normalizedMood = String(mood || "").trim().toLowerCase();
  const profile = moodProfiles[normalizedMood];
  if (!profile) throw new Error(`Invalid mood: ${mood}`);

  const cached = moodCache.get(normalizedMood);
  if (cached?.expiresAt > Date.now()) return cached.songs;

  try {
    const responses = await Promise.all(profile.searches.map((query) => searchSongs(query, 30)));
    const ranked = new Map();
    responses.forEach((response, sourceIndex) => {
      (response.data?.results || []).forEach((song) => {
        const score = scoreSong(song, profile, sourceIndex);
        if (!Number.isFinite(score)) return;
        const existing = ranked.get(String(song.id));
        if (!existing || score > existing.score) ranked.set(String(song.id), { song, score });
      });
    });

    const songs = [...ranked.values()]
      .sort((left, right) => right.score - left.score)
      .map(({ song }) => mapSong(song))
      .filter(Boolean)
      .slice(0, 30);
    if (!songs.length) throw new Error("Saavn returned no mood-safe playable songs");

    moodCache.set(normalizedMood, { expiresAt: Date.now() + CACHE_TTL_MS, songs });
    return songs;
  } catch (error) {
    console.error("Saavn mood search failed:", error.message);
    throw new Error("Unable to load mood songs from Saavn");
  }
}
