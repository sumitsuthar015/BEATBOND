import type { Song } from "@/types";
import { axiosInstance } from "@/lib/axios";

export type LyricsResult = {
  text: string;
  synced: boolean;
};

type LrcLibTrack = {
  trackName?: unknown;
  artistName?: unknown;
  duration?: unknown;
  plainLyrics?: unknown;
  syncedLyrics?: unknown;
};

type LyricsOvhResponse = { lyrics?: unknown };

export type LyricLine = { text: string; time?: number };

const timestampPattern = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g;

/** Splits lyrics into display lines; synced lyrics keep their start time in seconds. */
export const toLines = (text: string, hasTiming: boolean): LyricLine[] => {
  const lines = text.split("\n").flatMap((rawLine): LyricLine[] => {
    const times = [...rawLine.matchAll(timestampPattern)].map((match) => Number(match[1]) * 60 + Number(match[2]));
    const line = rawLine.replace(timestampPattern, "").trim();
    if (!line) return [];
    return hasTiming && times.length ? times.map((time) => ({ text: line, time })) : [{ text: line }];
  });
  // A repeated chorus is often written once with several timestamps, so the
  // expanded lines must be put back in time order before they can be followed.
  return hasTiming ? lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0)) : lines;
};

/** The words only, for views that don't follow playback. */
export const lyricsAsPlainText = (result: LyricsResult) =>
  toLines(result.text, result.synced).map((line) => line.text).join("\n");

/** Lower is better. Synced lyrics that belong to this exact recording win. */
const RANK = {
  exactSynced: 0,
  matchedSynced: 1,
  jioSaavn: 2,
  exactPlain: 3,
  matchedPlain: 4,
  lyricsOvh: 5,
} as const;

type Candidate = LyricsResult & { rank: number };

const cache = new Map<string, Promise<LyricsResult>>();

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const lyricText = (value: unknown) =>
  asText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .trim();
const stripTimestamps = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "").trim())
    .join("\n")
    .trim();

export const normalise = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&quot;|&amp;/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** "Channa Mereya (From "Ae Dil Hai Mushkil")" -> "Channa Mereya". */
export const cleanTitle = (title: string) =>
  title
    .replace(/&quot;/g, '"')
    .replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "")
    .replace(/\s+-\s+(?:remaster(?:ed)?|radio edit|version|mix|from|acoustic|lofi|slowed).*$/i, "")
    .trim();

export const songArtists = (artist: string) =>
  artist.split(/,|&| feat\.? | ft\.? | x /i).map((name) => name.trim()).filter(Boolean);

/**
 * Decides whether a lyrics-provider track is the song that is playing.
 * Returns "timed" when its timestamps can be trusted, "plain" when it is the
 * right song but a different cut (timings would drift), or null to reject it.
 */
export const matchLyricsTrack = (
  song: Pick<Song, "title" | "artist" | "duration">,
  track: { trackName?: unknown; artistName?: unknown; duration?: unknown }
): "timed" | "plain" | null => {
  const wantedTitle = normalise(cleanTitle(song.title));
  const trackTitle = normalise(cleanTitle(asText(track.trackName)));
  if (!wantedTitle || !trackTitle) return null;
  // Providers sometimes store "Artist - Title" or "Title - Artist"; accept the
  // track when every word of the wanted title appears in its title.
  const trackWords = new Set(trackTitle.split(" "));
  if (!wantedTitle.split(" ").every((word) => trackWords.has(word))) return null;

  const trackArtist = normalise(`${asText(track.artistName)} ${asText(track.trackName)}`);
  const sharesArtist = songArtists(song.artist).some((name) => {
    const artist = normalise(name);
    return artist.length > 1 && trackArtist.includes(artist);
  });
  if (!sharesArtist) return null;

  const trackDuration = Number(track.duration);
  if (!song.duration || !Number.isFinite(trackDuration) || trackDuration <= 0) return "plain";
  const drift = Math.abs(trackDuration - song.duration);
  if (drift > 15) return null;
  return drift <= 3 ? "timed" : "plain";
};

const fetchJson = async <T,>(url: string, timeoutMs = 4_000): Promise<T | null> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    // A slow or failing provider must never block the others.
    return null;
  }
};

const fromTrack = (track: LrcLibTrack | null, syncedRank: number, plainRank: number, timed: boolean): Candidate | null => {
  if (!track) return null;
  const synced = lyricText(track.syncedLyrics);
  if (synced && timed) return { text: synced, synced: true, rank: syncedRank };
  const plain = lyricText(track.plainLyrics) || (synced ? stripTimestamps(synced) : "");
  return plain ? { text: plain, synced: false, rank: plainRank } : null;
};

/** LRCLIB's exact lookup matches title, artist and length (within ~2s). */
const lrcLibExact = async (song: Song): Promise<Candidate | null> => {
  const titles = [...new Set([song.title, cleanTitle(song.title)].filter(Boolean))];
  const artists = [...new Set([song.artist, ...songArtists(song.artist)].filter(Boolean))].slice(0, 4);
  const lookups = titles.flatMap((title) =>
    artists.map((artist) => {
      const url = new URL("https://lrclib.net/api/get");
      url.searchParams.set("artist_name", artist);
      url.searchParams.set("track_name", title);
      if (song.duration) url.searchParams.set("duration", String(Math.round(song.duration)));
      return fetchJson<LrcLibTrack>(url.toString());
    })
  );
  const tracks = await Promise.all(lookups);
  const candidates = tracks
    .map((track) => fromTrack(track, RANK.exactSynced, RANK.exactPlain, true))
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  return candidates.sort((a, b) => a.rank - b.rank)[0] ?? null;
};

/** LRCLIB search, accepted only when the result really is this song. */
const lrcLibSearch = async (song: Song): Promise<Candidate | null> => {
  const title = cleanTitle(song.title);
  const queries = [...new Set([`${title} ${songArtists(song.artist)[0] || ""}`.trim(), title])];
  const results = await Promise.all(
    queries.map((query) => fetchJson<LrcLibTrack[]>(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`))
  );
  const candidates = results
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map((track) => {
      const match = matchLyricsTrack(song, track);
      return match ? fromTrack(track, RANK.matchedSynced, RANK.matchedPlain, match === "timed") : null;
    })
    .filter((candidate): candidate is Candidate => Boolean(candidate));
  return candidates.sort((a, b) => a.rank - b.rank)[0] ?? null;
};

/** JioSaavn's own lyrics, fetched by the backend (browsers can't call JioSaavn). */
const jioSaavn = async (song: Song): Promise<Candidate | null> => {
  if (!song._id) return null;
  try {
    const { data } = await axiosInstance.get(`/saavn/lyrics/${encodeURIComponent(song._id)}`, {
      params: song.lyricsId ? { lyricsId: song.lyricsId } : undefined,
      timeout: 6_000,
    });
    const text = data?.status === "SUCCESS" ? lyricText(data?.data?.lyrics) : "";
    return text ? { text, synced: false, rank: RANK.jioSaavn } : null;
  } catch {
    return null;
  }
};

/** lyrics.ovh only answers exact artist + title pairs, so it is safe but plain. */
const lyricsOvh = async (song: Song): Promise<Candidate | null> => {
  const title = cleanTitle(song.title);
  const lookups = [...new Set(songArtists(song.artist).slice(0, 2))].map((artist) =>
    fetchJson<LyricsOvhResponse>(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`)
  );
  const text = (await Promise.all(lookups)).map((result) => lyricText(result?.lyrics)).find(Boolean);
  return text ? { text, synced: false, rank: RANK.lyricsOvh } : null;
};

/**
 * Runs every provider at once but answers with the best-ranked result: it
 * returns early only when nothing better can still arrive. Previously the
 * fastest provider won, so a song could show unsynced or wrong lyrics.
 */
type Provider = { bestRank: number; run: () => Promise<Candidate | null> };

export const bestOf = (providers: Provider[]): Promise<Candidate | null> =>
  new Promise((resolve) => {
    let best: Candidate | null = null;
    const settled = providers.map(() => false);
    // The best rank any still-running provider could produce.
    const bestStillPossible = () =>
      Math.min(...providers.map((provider, index) => (settled[index] ? Infinity : provider.bestRank)));
    providers.forEach((provider, index) => {
      provider
        .run()
        .catch(() => null)
        .then((candidate) => {
          settled[index] = true;
          if (candidate && (!best || candidate.rank < best.rank)) best = candidate;
          if (settled.every(Boolean) || (best && best.rank <= bestStillPossible())) resolve(best);
        });
    });
  });

// Lyrics of downloaded songs are kept on the device so they work offline too.
const SAVED_LYRICS_PREFIX = "beatbond-offline-lyrics:";

const readSavedLyrics = (songId: string): LyricsResult | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(`${SAVED_LYRICS_PREFIX}${songId}`) || "null");
    return saved && typeof saved.text === "string" ? { text: saved.text, synced: Boolean(saved.synced) } : null;
  } catch {
    return null;
  }
};

export const saveLyricsForOffline = async (song: Song) => {
  try {
    const lyrics = await fetchLyricsForSong(song);
    localStorage.setItem(`${SAVED_LYRICS_PREFIX}${song._id}`, JSON.stringify(lyrics));
  } catch {
    // Not every song has lyrics; the download itself still succeeds.
  }
};

export const removeSavedLyrics = (songId: string) => {
  try { localStorage.removeItem(`${SAVED_LYRICS_PREFIX}${songId}`); } catch { /* Storage unavailable. */ }
};

/**
 * Retrieves lyrics for local uploads, JioSaavn songs, and external catalog songs.
 * Time-synced lyrics for this exact recording are preferred.
 */
export const fetchLyricsForSong = (song: Song): Promise<LyricsResult> => {
  const key = `${song._id}:${song.title}:${song.artist}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const request = (async () => {
    const embedded = asText(song.lyrics);
    if (embedded) return { text: embedded, synced: /\[\d{1,2}:\d{2}/.test(embedded) };

    const saved = readSavedLyrics(song._id);
    if (saved) return saved;
    // Every provider is online; say so at once instead of waiting on timeouts.
    if (!navigator.onLine) throw new Error("Lyrics need an internet connection for songs you haven't downloaded.");

    const best = await bestOf([
      { bestRank: RANK.exactSynced, run: () => lrcLibExact(song) },
      { bestRank: RANK.matchedSynced, run: () => lrcLibSearch(song) },
      { bestRank: RANK.jioSaavn, run: () => jioSaavn(song) },
      { bestRank: RANK.lyricsOvh, run: () => lyricsOvh(song) },
    ]);
    if (!best) throw new Error("Lyrics are not available for this song yet.");
    return { text: best.text, synced: best.synced };
  })().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, request);
  return request;
};
