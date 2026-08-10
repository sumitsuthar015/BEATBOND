import type { Song } from "@/types";
import { SAAVN_API_BASE } from "@/lib/saavn";

export type LyricsResult = {
  text: string;
  synced: boolean;
};

type LyricsCandidate = {
  plainLyrics?: unknown;
  syncedLyrics?: unknown;
  lyrics?: unknown;
  lyricsId?: unknown;
  lyrics_id?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  duration?: unknown;
};

type LyricsOvhSuggestion = {
  title?: unknown;
  duration?: unknown;
  artist?: { name?: unknown };
};

const cache = new Map<string, Promise<LyricsResult>>();

const asText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const lyricText = (value: unknown) => asText(value)
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]*>/g, "")
  .trim();
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const firstArtist = (artist: string) => artist.split(/,|&| feat\.? | ft\.? /i)[0]?.trim() || artist;
const cleanTitle = (title: string) => title
  .replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "")
  .replace(/\s+-\s+(?:remaster(?:ed)?|radio edit|version|mix).*$/i, "")
  .trim();

const resultFrom = (candidate: LyricsCandidate | null | undefined): LyricsResult | null => {
  const synced = lyricText(candidate?.syncedLyrics);
  const plain = lyricText(candidate?.plainLyrics) || lyricText(candidate?.lyrics);
  return synced ? { text: synced, synced: true } : plain ? { text: plain, synced: false } : null;
};

const fetchJson = async (url: string, timeoutMs = 5_500) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? response.json() : null;
  } catch {
    // A public lyrics provider timing out must not reject a whole batch of
    // candidate requests. Returning null lets the remaining providers win.
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};

const firstAvailable = async <T,>(lookups: Array<() => Promise<T | null>>): Promise<T | null> =>
  new Promise((resolve) => {
    let pending = lookups.length;
    for (const lookup of lookups) {
      void lookup().then((result) => {
        if (result) {
          resolve(result);
          return;
        }
        pending -= 1;
        if (pending === 0) resolve(null);
      }).catch(() => {
        pending -= 1;
        if (pending === 0) resolve(null);
      });
    }
  });

const getSaavnLyrics = async (song: Song): Promise<LyricsResult | null> => {
  try {
    let item: LyricsCandidate | null = null;
    let lyricsId = asText(song.lyricsId);

    // Try backend endpoint first if song._id exists
    if (song._id) {
      const lyricsQuery = lyricsId ? `?lyricsId=${encodeURIComponent(lyricsId)}` : "";
      const backendPayload = await fetchJson(`${SAAVN_API_BASE}/lyrics/${encodeURIComponent(song._id)}${lyricsQuery}`, 6_000);
      if (backendPayload?.status === "SUCCESS" && backendPayload?.data?.lyrics) {
        return resultFrom({ lyrics: backendPayload.data.lyrics });
      }

      const payload = await fetchJson(`${SAAVN_API_BASE}/songs/${encodeURIComponent(song._id)}`, 4_000);
      const data = payload?.data ?? payload;
      item = Array.isArray(data) ? data[0] : data;
      const includedLyrics = resultFrom(item);
      if (includedLyrics) return includedLyrics;
      lyricsId = asText(item?.lyricsId) || asText(item?.lyrics_id) || lyricsId;
    }

    if (lyricsId) {
      const nativeLyrics = await fetchJson(
        `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&lyrics_id=${encodeURIComponent(lyricsId)}&ctx=web6dot0&api_version=4&_format=json&_marker=0`,
        3_000
      );
      const parsedNative = resultFrom(nativeLyrics?.data ?? nativeLyrics);
      if (parsedNative) return parsedNative;
    }

    if (song._id) {
      const directPidLyrics = await fetchJson(
        `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&pids=${encodeURIComponent(song._id)}&_format=json`,
        3_000
      );
      const parsedPid = resultFrom(directPidLyrics?.data ?? directPidLyrics);
      if (parsedPid) return parsedPid;
    }

    return null;
  } catch {
    return null;
  }
};

const getLrcLibLyrics = async (song: Song): Promise<LyricsResult | null> => {
  try {
    const titles = [...new Set([song.title, cleanTitle(song.title)].filter(Boolean))];
    const artists = [...new Set([song.artist, firstArtist(song.artist)].filter(Boolean))];

    // Run metadata variants together.
    const exactRequests = titles.flatMap((title) => artists.map((artist) => {
      const request = new URL("https://lrclib.net/api/get");
      request.searchParams.set("artist_name", artist);
      request.searchParams.set("track_name", title);
      if (song.duration) request.searchParams.set("duration", String(Math.round(song.duration)));
      return fetchJson(request.toString(), 3_000).then(resultFrom);
    }));
    const exactResults = await Promise.all(exactRequests);
    const exact = exactResults.find((result): result is LyricsResult => Boolean(result));
    if (exact) return exact;

    const searches = await Promise.all(
      [...new Set([
        ...titles.map((title) => `${title} ${song.artist}`),
        ...titles,
      ])].map((query) => fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, 3_000))
    );
    const search = searches.flat().filter((item): item is LyricsCandidate => Boolean(item));
    if (!search.length) return null;

    const title = normalise(cleanTitle(song.title));
    const artist = normalise(firstArtist(song.artist));
    const best = search
      .map((item: LyricsCandidate) => {
        const candidate = resultFrom(item);
        if (!candidate) return null;
        let score = normalise(asText(item.trackName)) === title ? 4 : 0;
        score += normalise(asText(item.artistName)).includes(artist) ? 2 : 0;
        if (song.duration && Number.isFinite(Number(item.duration))) {
          score -= Math.min(Math.abs(Number(item.duration) - song.duration) / 30, 2);
        }
        return { candidate, score };
      })
      .filter(Boolean)
      .sort((left, right) => right!.score - left!.score)[0];
    return best?.candidate ?? null;
  } catch {
    return null;
  }
};

const getLyricsOvh = async (song: Song): Promise<LyricsResult | null> => {
  const artists = [song.artist, firstArtist(song.artist)];
  const titles = [song.title, cleanTitle(song.title)];

  const directRequests = [...new Set(artists)].filter(Boolean).flatMap((artist) =>
    [...new Set(titles)].filter(Boolean).map((title) =>
      fetchJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, 3_000)
        .then(resultFrom)
        .catch(() => null)
    )
  );
  const directResults = await Promise.all(directRequests);
  const direct = directResults.find((result): result is LyricsResult => Boolean(result));
  if (direct) return direct;

  try {
    const suggestions = await fetchJson(
      `https://api.lyrics.ovh/suggest/${encodeURIComponent(cleanTitle(song.title))}`,
      3_000
    );
    const expectedTitle = normalise(cleanTitle(song.title));
    const matches = Array.isArray(suggestions?.data)
      ? suggestions.data
        .filter((item: LyricsOvhSuggestion) => {
          const titleMatches = normalise(asText(item.title)) === expectedTitle;
          const duration = Number(item.duration);
          const durationMatches = !song.duration || !Number.isFinite(duration)
            || Math.abs(duration - song.duration) <= 20;
          return titleMatches && durationMatches && asText(item.artist?.name);
        })
        .slice(0, 5) as LyricsOvhSuggestion[]
      : [];

    const suggested = await Promise.all(matches.map((match) => fetchJson(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(asText(match.artist?.name))}/${encodeURIComponent(asText(match.title))}`,
      3_000
    ).then(resultFrom)));
    return suggested.find((result): result is LyricsResult => Boolean(result)) ?? null;
  } catch {
    // Regular attempts above remain the primary path.
  }

  return null;
};

/**
 * Retrieves lyrics for local uploads, Saavn songs, and external catalog songs.
 * Timed lyrics are preferred; plain lyrics still receive progressive highlighting.
 */
export const fetchLyricsForSong = (song: Song): Promise<LyricsResult> => {
  const key = `${song._id}:${song.title}:${song.artist}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const request = (async () => {
    const embedded = asText(song.lyrics);
    if (embedded) return { text: embedded, synced: /\[\d{1,2}:\d{2}/.test(embedded) };

    // Start all providers together. Previously Saavn could consume its full
    // timeout before LRCLIB or Lyrics.ovh were even contacted, causing a very
    // noticeable delay despite another provider already having the text.
    const lyrics = await firstAvailable([
      () => getSaavnLyrics(song),
      () => getLrcLibLyrics(song),
      () => getLyricsOvh(song),
    ]);
    if (!lyrics) throw new Error("Lyrics are not available for this song yet.");
    return lyrics;
  })().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, request);
  return request;
};
