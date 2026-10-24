
import { Song, Album, Artist, fetchFromSaavn, setFetchConfig } from "@saavn-labs/sdk";
import CryptoJS from "crypto-js";
import { VerifiedArtist } from "../models/verifiedArtist.model.js";

// JioSaavn tailors its catalogue to the caller's country, and outside India it
// hides many licensed originals (e.g. international hits). When the backend is
// hosted abroad, set SAAVN_API_BASE to a relay running in India (see
// saavn-relay/README.md) so provider calls leave from an Indian IP.
const DIRECT_API_BASE = "https://www.jiosaavn.com";
const SAAVN_API_URL = `${DIRECT_API_BASE}/api.php`;
const RELAY_API_BASE = (process.env.SAAVN_API_BASE || "").replace(/\/+$/, "");
const RELAY_HEADERS = { "x-relay-key": process.env.SAAVN_RELAY_KEY || "" };
const RELAY_CHECK_MS = 5 * 60 * 1000;

// Calls start direct and move to the relay only once it answers, and move back
// if it fails, so a broken or over-quota relay can never take search down.
let providerRoute = { viaRelay: false, base: DIRECT_API_BASE, headers: {} };

const routeProviderCalls = (viaRelay) => {
  if (viaRelay !== providerRoute.viaRelay) {
    console.log(viaRelay ? "JioSaavn relay is up; routing provider calls through it" : "JioSaavn relay unavailable; calling JioSaavn directly");
  }
  providerRoute = viaRelay
    ? { viaRelay, base: RELAY_API_BASE, headers: RELAY_HEADERS }
    : { viaRelay, base: DIRECT_API_BASE, headers: {} };
  setFetchConfig({ baseUrl: providerRoute.base, defaultHeaders: providerRoute.headers });
};

const checkRelay = async () => {
  try {
    const response = await fetch(`${RELAY_API_BASE}/api.php?__call=autocomplete.get&_format=json&_marker=0&ctx=web6dot0&query=arijit`, {
      headers: RELAY_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    routeProviderCalls(response.ok);
  } catch {
    routeProviderCalls(false);
  }
};

if (RELAY_API_BASE) {
  void checkRelay();
  setInterval(checkRelay, RELAY_CHECK_MS).unref();
}

// Every direct provider call goes through here. URLs are written against
// jiosaavn.com and rewritten to the relay while it is healthy.
const saavnFetch = async (url, init = {}) => {
  const route = providerRoute;
  if (!route.viaRelay) return fetch(url, init);
  try {
    const response = await fetch(url.replace(DIRECT_API_BASE, route.base), {
      ...init,
      headers: { ...route.headers, ...(init.headers || {}) },
    });
    if (response.ok) return response;
  } catch {
    // Fall through to a direct call below.
  }
  routeProviderCalls(false);
  return fetch(url, init);
};

const streamCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const searchResultCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_PROVIDER_TIMEOUT_MS = 12_000;
// Charts move throughout the day, so keep this shared server cache short
// enough to refresh regularly while avoiding a provider request per visitor.
const DAILY_TRENDING_TTL_MS = 30 * 60 * 1000;
let dailyTrendingCache = { fetchedAt: 0, songs: [] };

// Keep matching independent of accents, punctuation, spacing, and HTML
// entities returned by the provider. The same normal form is used for cache
// keys, relevance scoring, and duplicate detection.
const normaliseSearchText = (value) => String(value || "")
  .replace(/&amp;/gi, " and ")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

const SEARCH_NOISE_WORDS = new Set([
  "song", "songs", "music", "official", "video", "audio", "lyrics",
  "full", "new", "latest", "download", "listen", "play", "artist", "artists",
]);
const MAX_SEARCH_QUERY_LENGTH = 120;

export const normalizeSearchQuery = (query) => normaliseSearchText(query);

export const tokenizeQuery = (query) => normaliseSearchText(query).split(" ").filter(Boolean);

const searchTerms = (query) => {
  const terms = normaliseSearchText(query).split(" ").filter(Boolean);
  const useful = terms.filter((term) => !SEARCH_NOISE_WORDS.has(term));
  return useful.length ? useful : terms;
};

// These fields are based on verified JioSaavn `search.getResults` responses:
// title, subtitle, more_info.album, and more_info.artistMap.*. The SDK shape
// is also accepted because both sources flow through this one normalizer.
export const extractSearchFields = (song) => {
  const artistMap = song?.more_info?.artistMap || song?.moreInfo?.artistMap || {};
  const artistEntries = [
    ...(Array.isArray(artistMap.primary_artists) ? artistMap.primary_artists : []),
    ...(Array.isArray(artistMap.featured_artists) ? artistMap.featured_artists : []),
    ...(Array.isArray(song?.artists?.primary) ? song.artists.primary : []),
    ...(Array.isArray(song?.artists?.all) ? song.artists.all : []),
  ];
  const artists = [...new Set([
    ...artistEntries.map((artist) => String(artist?.name || "").trim()),
    ...String(song?.artist || song?.primary_artists || "").split(/,|&| feat\.? | ft\.? /i).map((name) => name.trim()),
  ].filter(Boolean))];
  const title = String(song?.title || song?.name || song?.song || "").trim();
  const album = String(song?.more_info?.album || song?.album?.name || song?.album?.title || song?.albumName || "").trim();
  return { title, artists, album, searchableText: normaliseSearchText(`${title} ${artists.join(" ")} ${album}`) };
};

const songArtistText = (song) => extractSearchFields(song).artists.join(" ");

const editDistance = (left, right) => {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = matrix[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, substitution);
      // Damerau transposition: "ligths" should match "lights" with one edit.
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
};

const fuzzyFieldMatch = (terms, value) => {
  const words = normaliseSearchText(value).split(" ").filter(Boolean);
  if (!terms.length || !words.length) return null;
  let typoCount = 0;
  for (const term of terms) {
    const exact = words.some((word) => word === term);
    if (exact) continue;
    if (term.length < 4) return null;
    const maxDistance = term.length >= 7 ? 2 : 1;
    const close = words.some((word) =>
      word.length >= 4 && Math.abs(word.length - term.length) <= maxDistance && editDistance(term, word) <= maxDistance,
    );
    if (!close) return null;
    typoCount += 1;
  }
  return typoCount ? { typoCount } : null;
};

const withTimeout = (promise, timeoutMs, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const detectSearchIntent = (query, artists, albums) => {
  const normalized = normaliseSearchText(query);
  if (/\b(artist|singer|singers)\b/.test(normalized)) return "artist";
  if (/\b(album|ep|soundtrack)\b/.test(normalized)) return "album";
  if (/\b(song|track|single|lyrics)\b/.test(normalized)) return "song";

  // An exact provider match is a stronger signal than keyword heuristics.
  if (artists.some((artist) => normaliseSearchText(artist?.name) === normalized)) return "artist";
  if (albums.some((album) => normaliseSearchText(album?.name || album?.title) === normalized)) return "album";
  return "general";
};

const resultText = (item, type) => type === "song"
  ? extractSearchFields(item).searchableText
  : type === "artist"
    ? item?.name || item?.title || ""
    : `${item?.name || item?.title || ""} ${songArtistText(item)}`;

const resultKey = (item, type) => {
  const id = String(item?.id || item?._id || "").trim();
  if (id) return `id:${id}`;
  if (type === "song") return `song:${normaliseSearchText(item?.name || item?.title)}:${normaliseSearchText(songArtistText(item))}`;
  return `${type}:${normaliseSearchText(resultText(item, type))}`;
};

const rankResults = (items, type, query, intent, limit) => {
  const normalized = normaliseSearchText(query);
  const terms = searchTerms(query);
  const unique = new Map();
  items.filter(Boolean).forEach((item, index) => {
    const key = resultKey(item, type);
    if (!unique.has(key)) unique.set(key, { item, index });
  });

  return [...unique.values()]
    .map(({ item, index }) => {
      const fields = type === "song" ? extractSearchFields(item) : { title: String(item?.name || item?.title || ""), artists: type === "artist" ? [String(item?.name || item?.title || "")] : [songArtistText(item)], album: String(item?.name || item?.title || ""), searchableText: normaliseSearchText(resultText(item, type)) };
      const title = normaliseSearchText(fields.title);
      const artists = fields.artists.map(normaliseSearchText).filter(Boolean);
      const album = normaliseSearchText(fields.album);
      const text = fields.searchableText;
      let score = 0;
      // Relevance order: exact -> prefix -> contains -> all tokens -> partial -> fuzzy.
      if (title === normalized) score += 1000;
      if (artists.some((artist) => artist === normalized)) score += 950;
      if (album === normalized) score += 900;
      if (title.startsWith(normalized)) score += 800;
      if (artists.some((artist) => artist.startsWith(normalized))) score += 750;
      if (album.startsWith(normalized)) score += 700;
      if (title.includes(normalized)) score += 600;
      if (artists.some((artist) => artist.includes(normalized))) score += 550;
      if (album.includes(normalized)) score += 500;
      if (terms.length && terms.every((term) => title.includes(term))) score += 450;
      if (terms.length && terms.every((term) => artists.some((artist) => artist.includes(term)))) score += 400;
      if (terms.length && terms.every((term) => text.includes(term))) score += 300;
      score += terms.reduce((sum, term) => sum + (text.includes(term) ? 50 : 0), 0);
      const titleFuzzy = fuzzyFieldMatch(terms, fields.title);
      const artistFuzzy = fuzzyFieldMatch(terms, fields.artists.join(" "));
      const allFieldsFuzzy = fuzzyFieldMatch(terms, `${fields.title} ${fields.artists.join(" ")} ${fields.album}`);
      if (titleFuzzy) score += 360 - titleFuzzy.typoCount * 20;
      else if (artistFuzzy) score += 330 - artistFuzzy.typoCount * 20;
      else if (allFieldsFuzzy) score += 260 - allFieldsFuzzy.typoCount * 20;
      if (intent === type || (intent === "song" && type === "song")) score += 25;
      if (type === "artist" && item?.isVerified) score += 150;
      const popularity = Math.min(Math.log10(Number(item?.play_count || item?.playCount || item?.followerCount || 0) + 1) || 0, 12);
      return { item, score, popularity, index };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.popularity - left.popularity || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => item);
};

export const rankSearchResults = rankResults;

// Search responses are read-heavy and identical queries are common while a
// user refines text. Cache the already-shaped payload, not the raw provider
// response, so clients receive the smallest possible object immediately.
const cachedSearch = async (kind, query, limit, fetcher) => {
  const normalized = normaliseSearchText(String(query || "").slice(0, MAX_SEARCH_QUERY_LENGTH));
  const key = `${kind}:${normalized}:${limit}`;
  const cached = searchResultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetcher(normalized);
  if (searchResultCache.size >= 500) {
    const oldestKey = searchResultCache.keys().next().value;
    if (oldestKey) searchResultCache.delete(oldestKey);
  }
  searchResultCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, value });
  return value;
};

// The SDK occasionally returns an empty collection for newer Indian releases
// and international tracks even though they are present in JioSaavn's web
// catalogue. Use JioSaavn's own web search response as a server-side fallback.
// It also avoids making browsers depend on a third-party CORS policy.
const searchJioSaavnWebSongs = async (query, limit, page = 1) => {
  try {
    const params = new URLSearchParams({
      __call: "search.getResults",
      _format: "json",
      _marker: "0",
      api_version: "4",
      ctx: "web6dot0",
      p: String(Math.max(Number(page) || 1, 1)),
      n: String(Math.min(Math.max(Number(limit) || 20, 1), 50)),
      q: query,
    });
    const response = await saavnFetch(`${SAAVN_API_URL}?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "BeatBond/1.0" },
      signal: AbortSignal.timeout(SEARCH_PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    return results.map((item) => {
      const primaryArtists = item?.more_info?.artistMap?.primary_artists || [];
      const artistName = primaryArtists.map((artist) => artist?.name).filter(Boolean).join(", ") || item?.subtitle?.split(" - ")[0] || "";
      return {
      id: String(item?.id || ""),
      name: item?.title || item?.song || "",
      artist: artistName,
      primary_artists: artistName,
      artists: {
        primary: primaryArtists,
        all: [...primaryArtists, ...(item?.more_info?.artistMap?.featured_artists || [])],
      },
      image: item?.image || item?.more_info?.image || "",
      duration: Number(item?.more_info?.duration || item?.duration) || 0,
      album: {
        id: String(item?.more_info?.album_id || ""),
        name: item?.more_info?.album || "",
      },
      // Confirmed in live `search.getResults` payloads. It is a safe
      // provider preview fallback when auth-token stream resolution fails.
      media: {
        encryptedUrl: item?.more_info?.encrypted_media_url || "",
        previewUrl: item?.more_info?.vlink || "",
      },
    }; }).filter((item) => item.id && item.name && item.artist && (item.media.encryptedUrl || item.media.previewUrl));
  } catch {
    return [];
  }
};

// JioSaavn's web player decrypts `encrypted_media_url` with this fixed DES key.
// Doing the same locally gives the CDN link without a network round trip per
// song; generating auth tokens for ~50 results took 1.5-9s per search.
const MEDIA_URL_KEY = CryptoJS.enc.Utf8.parse("38346591");

export const decryptMediaUrl = (encUrl) => {
  if (!encUrl || typeof encUrl !== "string") return "";
  try {
    const url = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encUrl) },
      MEDIA_URL_KEY,
      { mode: CryptoJS.mode.ECB }
    ).toString(CryptoJS.enc.Utf8);
    return /^https:\/\/\S+\.(mp4|mp3)$/.test(url) ? url.replace(/^https:\/\/(web|preview)\./, "https://aac.") : "";
  } catch {
    return "";
  }
};

const streamVariants = (url, query = "") => [
  { quality: "320kbps", url: url.replace("_96.mp4", "_320.mp4").replace("_96.mp3", "_320.mp3") + query },
  { quality: "160kbps", url: url.replace("_96.mp4", "_160.mp4").replace("_96.mp3", "_160.mp3") + query },
  { quality: "96kbps", url: url + query },
];

// Decrypted links only help while the CDN serves them without a token. Probe
// one occasionally and fall back to auth tokens automatically if it stops.
const DIRECT_LINK_RECHECK_MS = 30 * 60 * 1000;
const DIRECT_LINK_RETRY_MS = 5 * 60 * 1000;
let directLinkProbe = { ok: null, checkedAt: 0, pending: null };

const directLinksPlayable = (sampleUrl) => {
  const { ok, checkedAt, pending } = directLinkProbe;
  if (pending) return pending;
  if (ok !== null && Date.now() - checkedAt < (ok ? DIRECT_LINK_RECHECK_MS : DIRECT_LINK_RETRY_MS)) return ok;
  const probe = fetch(sampleUrl, { headers: { Range: "bytes=0-1" }, signal: AbortSignal.timeout(4000) })
    .then((response) => response.ok)
    .catch(() => false)
    .then((playable) => {
      directLinkProbe = { ok: playable, checkedAt: Date.now(), pending: null };
      return playable;
    });
  directLinkProbe = { ...directLinkProbe, pending: probe };
  return probe;
};

async function resolveFullStreamUrls(encUrl) {
  if (!encUrl || typeof encUrl !== "string") return [];

  const cached = streamCache.get(encUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.urls;
  }

  const direct = decryptMediaUrl(encUrl);
  if (direct && (await directLinksPlayable(streamVariants(direct)[0].url))) {
    const urls = streamVariants(direct);
    streamCache.set(encUrl, { expiresAt: Date.now() + CACHE_TTL_MS, urls });
    return urls;
  }

  try {
    const res = await fetchFromSaavn({
      call: "song.generateAuthToken",
      params: { url: encUrl, bitrate: "96" },
    });

    const rawUrl = res.data?.auth_url;
    if (!rawUrl || typeof rawUrl !== "string") return [];

    const parts = rawUrl.split("?");
    const baseUrl = parts[0].replace(/^https:\/\/(web|preview)\./, "https://aac.");
    const query = parts[1] ? `?${parts[1]}` : "";

    const [u320, u160] = streamVariants(baseUrl, query);
    const urls = [u320, u160, { quality: "96kbps", url: rawUrl }];

    streamCache.set(encUrl, { expiresAt: Date.now() + CACHE_TTL_MS, urls });
    return urls;
  } catch {
    return [];
  }
}

const mapImages = (images = []) => {
  if (typeof images === "string") {
    const url500 = images.replace(/150x150|50x50/, "500x500");
    const url150 = images.replace(/500x500|50x50/, "150x150");
    const url50 = images.replace(/500x500|150x150/, "50x50");
    return [
      { quality: "50x50", url: url50 },
      { quality: "150x150", url: url150 },
      { quality: "500x500", url: url500 },
    ];
  }
  if (!Array.isArray(images) || !images.length) return [];
  const mapped = images.map((img) => ({
    quality: img.quality || img.resolution || "500x500",
    url: typeof img === "string" ? img : img.url || img.link || "",
  }));
  if (mapped.length === 1) {
    return [mapped[0], mapped[0], mapped[0]];
  }
  return mapped;
};

const mapArtists = (artistsObj) => {
  const mapArtist = (artist) => ({
    id: String(artist?.id || artist?.artistId || ""),
    name: artist?.name || artist?.title || "Unknown Artist",
    image: mapImages(artist?.images || artist?.image),
    isVerified: artist?.isVerified === true || artist?.is_verified === true || artist?.verified === true,
  });
  const primary = Array.isArray(artistsObj?.primary)
    ? artistsObj.primary.map(mapArtist)
    : [];
  const all = Array.isArray(artistsObj?.all)
    ? artistsObj.all.map(mapArtist)
    : [];
  return {
    primary: primary.length ? primary : [{ name: "Unknown Artist" }],
    all: all.length ? all : primary,
  };
};

// Artist-page results from JioSaavn use both modern (`name`/`title`) and
// legacy (`song`/`songName`) field names. Keep the original title regardless
// of which response shape supplied the track.
const getSongTitle = (song) =>
  song?.name ||
  song?.title ||
  song?.song ||
  song?.songName ||
  song?.more_info?.song ||
  song?.moreInfo?.song ||
  "Unknown Song";

// Artist endpoints can include the same track more than once (and sometimes
// with different IDs). Prefer the first result while treating a normalized
// title and primary artist as the same song.
const uniqueSongs = (songs) => {
  const seenIds = new Set();
  const seenTracks = new Set();

  return songs.filter((song) => {
    const id = String(song?.id || "").trim();
    const artist = song?.artists?.primary?.map((item) => item.name).filter(Boolean).join(", ") || "";
    const trackKey = `${String(song?.title || song?.name || "").trim().toLowerCase()}::${artist.trim().toLowerCase()}`;

    if ((id && seenIds.has(id)) || (trackKey !== "::" && seenTracks.has(trackKey))) return false;
    if (id) seenIds.add(id);
    if (trackKey !== "::") seenTracks.add(trackKey);
    return true;
  });
};

const songIsCreditedToArtist = (song, artistName, artistId) => {
  const artists = [
    ...(song?.artists?.primary || []),
    ...(song?.artists?.all || []),
  ];
  const names = [
    ...artists.map((artist) => artist?.name || artist?.title || ""),
    song?.artist,
    song?.primary_artists,
    song?.more_info?.primary_artists,
  ].filter(Boolean);
  const normalizedArtist = String(artistName || "").trim().toLowerCase();

  return artists.some((artist) => String(artist?.id || artist?.artistId || "") === String(artistId)) ||
    names.some((name) => String(name).split(/,|&| feat\.? /i).some((part) => part.trim().toLowerCase() === normalizedArtist));
};

const getBioText = (value) => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(getBioText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return getBioText(value.text || value.description || value.content || value.bio || "");
  }
  return "";
};

// The artist API may return HTML, encoded entities, or nested bio objects.
// Convert it to a short, readable summary for the About section.
const formatArtistBio = (value) => {
  const decoded = getBioText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|li)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/(^|\n)\s*\[[^\]\n]{0,80}\]\s*/g, "$1")
    .replace(/\[(?:\d+|citation needed|source:[^\]]+)\]/gi, "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/[•▪◦■□]/g, " ")
    .replace(/Â/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (decoded.length <= 480) return decoded;
  const excerpt = decoded.slice(0, 480);
  const sentenceEnd = Math.max(excerpt.lastIndexOf(". "), excerpt.lastIndexOf("! "), excerpt.lastIndexOf("? "));
  return `${sentenceEnd >= 180 ? excerpt.slice(0, sentenceEnd + 1) : excerpt.trim()}…`;
};

export async function mapSongWithFullAudio(song) {
  if (!song) return null;
  const name = getSongTitle(song);

  const encUrl =
    song.media?.encryptedUrl ||
    song.encrypted_media_url ||
    song.media?.encrypted_media_url ||
    "";

  let downloadUrl = song.downloadUrl || [];
  if (encUrl) {
    const resolved = await resolveFullStreamUrls(encUrl);
    if (resolved.length) downloadUrl = resolved;
  }

  if (!downloadUrl.length && (song.media?.previewUrl || song.media_preview_url)) {
    const p = song.media?.previewUrl || song.media_preview_url;
    downloadUrl = [
      { quality: "320kbps", url: p },
      { quality: "160kbps", url: p },
    ];
  }

  const primaryArtist =
    song.artist ||
    song.primary_artists ||
    (Array.isArray(song.artists?.primary) ? song.artists.primary.map((a) => a.name).join(", ") : "") ||
    "Unknown Artist";

  return {
    id: String(song.id || ""),
    name,
    title: name,
    artists: mapArtists(song.artists || { primary: [{ name: primaryArtist }] }),
    image: mapImages(song.images || song.image),
    downloadUrl,
    duration: Number(song.duration) || 0,
    language: song.language || "Unknown",
    year: Number(song.year) || new Date().getFullYear(),
    album: song.album
      ? { id: String(song.album.id || song.albumid || ""), name: song.album.title || song.album.name || "" }
      : undefined,
  };
}

export const mapAlbum = async (album) => {
  if (!album) return null;
  const id = album.id || album.albumId || album.albumid || album._id || "";
  const name = album.name || album.title || album.album || album.albumName || "Unknown Album";
  const songs = Array.isArray(album.songs)
    ? (await Promise.all(album.songs.map(mapSongWithFullAudio))).filter(Boolean)
    : [];
  const artistNames = album.primary_artists || album.primaryArtists || "";
  const artists = album.artists || (artistNames
    ? { primary: String(artistNames).split(/,|&/).map((name) => ({ name: name.trim() })).filter((artist) => artist.name) }
    : undefined);

  return {
    id: String(id),
    name,
    title: name,
    description: album.description || "",
    year: Number(album.year) || new Date().getFullYear(),
    image: mapImages(album.images || album.image || album.imageUrl),
    songCount: Number(album.songCount || album.song_count || songs.length),
    artists: mapArtists(artists),
    songs,
  };
};

export const mapArtist = (artist) => {
  if (!artist) return null;
  // JioSaavn responses have used each of these field names across API
  // versions. Do not use Boolean("false"), which incorrectly treats the
  // string value as verified.
  const verifiedValue = artist.isVerified ?? artist.is_verified ?? artist.verified ?? artist.flags?.isVerified;
  const isVerified = verifiedValue === true || verifiedValue === 1 || String(verifiedValue).toLowerCase() === "true";
  return {
    id: String(artist.id || artist.artistId || ""),
    name: artist.name || "Unknown Artist",
    role: artist.role || "Artist",
    image: mapImages(artist.images || artist.image),
    imageUrl:
      artist.images?.[2]?.url ||
      artist.images?.[0]?.url ||
      (typeof artist.image === "string" ? artist.image : ""),
    type: artist.type || "artist",
    url: artist.url || "",
    isVerified,
    followerCount: Number(artist.followerCount || artist.follower_count || artist.stats?.followerCount || 0),
  };
};

const hasStreamSource = (song) => Boolean(
  song?.media?.encryptedUrl || song?.encrypted_media_url || song?.media?.encrypted_media_url ||
  song?.downloadUrl?.length || song?.media?.previewUrl || song?.media_preview_url
);

// The SDK and web searches mostly return the same songs. Keep one entry per
// id, in first-seen order, preferring whichever copy has a playable stream.
export const uniqueSongsById = (songs) => {
  const byId = new Map();
  for (const song of songs) {
    const id = String(song?.id || "");
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || (!hasStreamSource(existing) && hasStreamSource(song))) byId.set(id, song);
  }
  return [...byId.values()];
};

export async function searchSongs(query, limit = 50, page = 1) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  return cachedSearch(`songs:p${safePage}`, query, safeLimit, async (normalized) => {
    try {
      // Always merge the web catalogue: the SDK can return a non-empty but
      // incomplete list (for example a remix) while missing the official song.
      // Both lookups are independent, so run them side by side.
      let sdkResponse;
      let webResults;
      const sdkPromise =
        withTimeout(
          Song.search({ query: normalized, limit: safeLimit, offset: safePage }),
          SEARCH_PROVIDER_TIMEOUT_MS,
          "Saavn SDK search",
        ).catch(() => ({ results: [] }))
          .then((response) => { sdkResponse = response; return response; });
      const webPromise = searchJioSaavnWebSongs(normalized, safeLimit, safePage)
        .then((results) => { webResults = results; return results; });
      const firstUsefulProvider = Promise.any([
        sdkPromise.then((response) => {
          if (!response?.results?.length) throw new Error("SDK search returned no songs");
          return "sdk";
        }),
        webPromise.then((results) => {
          if (!results.length) throw new Error("Web search returned no songs");
          return "web";
        }),
      ]).catch(() => null);

      if (await firstUsefulProvider) {
        // Use the first good result immediately; merge the other provider only
        // when it is already close to completion to avoid tail-latency waits.
        await Promise.race([
          Promise.allSettled([sdkPromise, webPromise]),
          new Promise((resolve) => setTimeout(resolve, 250)),
        ]);
      } else {
        await Promise.all([sdkPromise, webPromise]);
      }
      sdkResponse ||= { results: [] };
      webResults ||= [];
      const sdkResults = sdkResponse?.results || [];
      const sourceResults = uniqueSongsById([...sdkResults, ...webResults]);
      const results = (await Promise.all(sourceResults.map(mapSongWithFullAudio))).filter((song) => song?.id);
      // Some SDK results contain metadata but no playable stream, while the
      // web catalogue does. Retry against it before giving up on the query.
      if (!results.length && !webResults.length) {
        const retryWebResults = await searchJioSaavnWebSongs(normalized, safeLimit, safePage);
        return { status: "SUCCESS", data: { results: (await Promise.all(retryWebResults.map(mapSongWithFullAudio))).filter((song) => song?.id) } };
      }
      const total = Number(sdkResponse?.total) || 0;
      const hasMore = total > safePage * safeLimit || sdkResults.length >= safeLimit || webResults.length >= safeLimit;
      return { status: "SUCCESS", data: { results, page: safePage, limit: safeLimit, hasMore, total: total || undefined } };
    } catch { return { status: "SUCCESS", data: { results: [] } }; }
  });
}

/** Today's provider chart, sampled across the app's main supported languages. */
export async function getDailyTrendingSongs() {
  if (dailyTrendingCache.songs.length && Date.now() - dailyTrendingCache.fetchedAt < DAILY_TRENDING_TTL_MS) {
    return dailyTrendingCache.songs;
  }

  const languages = ["hindi", "punjabi", "english", "tamil", "telugu"];
  const responses = await Promise.allSettled(languages.map((language) => Song.getTrending({ language })));
  const charts = await Promise.all(responses.map(async (response) => {
    if (response.status !== "fulfilled") return [];
    const rawSongs = Array.isArray(response.value)
      ? response.value
      : response.value?.results || response.value?.songs || [];
    return (await Promise.all(rawSongs.slice(0, 10).map(mapSongWithFullAudio))).filter((song) => song?.id && song.downloadUrl?.length);
  }));

  // Interleave language charts so the mixed home shelf reflects current
  // regional trends instead of being dominated by the first language.
  const songs = [];
  for (let index = 0; index < 10; index += 1) {
    for (const chart of charts) {
      if (chart[index]) songs.push(chart[index]);
    }
  }
  const uniqueSongs = uniqueSongsById(songs);
  if (uniqueSongs.length) dailyTrendingCache = { fetchedAt: Date.now(), songs: uniqueSongs };
  return uniqueSongs;
}

/** Fresh, playable copies of known songs (stored stream links can go stale). */
export async function getSongsByIds(songIds) {
  const ids = [...new Set((songIds || []).map(String).filter(Boolean))].slice(0, 20);
  if (!ids.length) return [];
  try {
    const res = await Song.getById({ songIds: ids });
    const songs = await Promise.all((res?.results || res?.songs || []).map(mapSongWithFullAudio));
    return songs.filter((song) => song?.id && song.downloadUrl?.length);
  } catch {
    return [];
  }
}

export async function searchArtists(query, limit = 10) {
  try {
    const terms = searchTerms(query);
    const conditions = terms.map((term) => ({ name: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    // The home shelf requests without a query. Random sampling keeps it from
    // showing only the alphabetically first verified artists on every visit.
    let artists = terms.length
      ? await VerifiedArtist.find({ $and: conditions }).sort({ name: 1 }).limit(safeLimit).lean()
      : await VerifiedArtist.aggregate([{ $sample: { size: safeLimit } }]);
    // Keep artist profiles limited to the admin-approved directory, while
    // letting the provider suggest likely names for common typing mistakes.
    if (terms.length && !artists.length) {
      const candidates = await searchArtistCandidates(terms.join(" "), 20, false);
      const matchingIds = candidates
        .filter((artist) => fuzzyFieldMatch(terms, artist.name) || terms.every((term) => normaliseSearchText(artist.name).includes(term)))
        .map((artist) => artist.id);
      if (matchingIds.length) {
        artists = await VerifiedArtist.find({ artistId: { $in: matchingIds } }).limit(safeLimit).lean();
      }
    }
    const normalizedQuery = normaliseSearchText(terms.join(" "));
    const results = artists
      .map((artist) => ({
        id: artist.artistId,
        name: artist.name,
        image: artist.imageUrl ? [{ quality: "500x500", url: artist.imageUrl }] : [],
        imageUrl: artist.imageUrl || "",
        isVerified: true,
        followerCount: artist.followerCount || 0,
        dominantLanguage: artist.dominantLanguage || "",
      }));
    if (terms.length) results.sort((a, b) => {
        const aName = normaliseSearchText(a.name);
        const bName = normaliseSearchText(b.name);
        const rank = (name) => name === normalizedQuery ? 3 : name.startsWith(normalizedQuery) ? 2 : 1;
        return rank(bName) - rank(aName) || (b.followerCount || 0) - (a.followerCount || 0);
      });
    return { status: "SUCCESS", data: { results } };
  } catch {
    return { status: "SUCCESS", data: { results: [] } };
  }
}

export async function searchArtistCandidates(query, limit = 20, requireAllNameTerms = true) {
  try {
    const terms = searchTerms(query);
    if (!terms.length) return [];
    const artistQuery = terms.join(" ");
    const response = await Artist.search({ query: artistQuery, limit: Math.min(Math.max(Number(limit) || 20, 1), 30) });
    const candidates = (response.results || [])
      .map(mapArtist)
      .filter((artist) => artist?.id && (!requireAllNameTerms || terms.every((term) => normaliseSearchText(artist.name).includes(term))));
    if (!requireAllNameTerms) {
      const target = normaliseSearchText(query);
      const hasDirect = candidates.some((artist) => normaliseSearchText(artist.name) === target);
      if (!hasDirect) {
        // A few established artists are omitted by Saavn's artist search but
        // still appear in primary song credits. Resolve those IDs from songs.
        const songResponse = await searchSongs(artistQuery, 20);
        const credited = (songResponse?.data?.results || []).flatMap((song) => [
          ...(song.artists?.primary || []),
          ...(song.artists?.featured || []),
          ...(song.artists?.all || []),
        ]).map(mapArtist).filter((artist) => artist?.id);
        const exactCredits = credited.filter((artist) => normaliseSearchText(artist.name) === target);
        const nameCredits = exactCredits.length ? exactCredits : credited.filter((artist) => normaliseSearchText(artist.name).startsWith(`${target} `));
        candidates.push(...nameCredits);
      }
    }
    return [...new Map(candidates.map((artist) => [artist.id, artist])).values()];
  } catch {
    return [];
  }
}

export async function searchAlbums(query, limit = 20) {
  return cachedSearch("albums", query, limit, async (normalized) => {
    try {
      const res = await withTimeout(
        Album.search({ query: normalized, limit: Number(limit) }),
        SEARCH_PROVIDER_TIMEOUT_MS,
        "Saavn album search",
      );
      const results = (await Promise.all((res.results || []).map(mapAlbum))).filter(Boolean);
      return { status: "SUCCESS", data: { results } };
    } catch { return { status: "SUCCESS", data: { results: [] } }; }
  });
}

// Search the playable song catalogue first. Artist and album endpoints remain
// available separately so slower metadata providers cannot hold song results.
export async function searchCatalogue(query, limit = 30, songsOnly = false) {
  const normalized = normaliseSearchText(String(query || "").slice(0, MAX_SEARCH_QUERY_LENGTH));
  const cappedLimit = Math.min(Math.max(Number(limit) || 30, 1), 50);
  if ([...normalized].length < 2) {
    return { status: "SUCCESS", data: { query: "", intent: "general", songs: [], artists: [], albums: [] } };
  }

  if (songsOnly) {
    const songResponse = await searchSongs(normalized, cappedLimit);
    const songs = songResponse?.data?.results || [];
    return { status: "SUCCESS", data: {
      query: normalized,
      intent: "general",
      songs: rankResults(songs, "song", normalized, "general", cappedLimit),
      artists: [],
      albums: [],
    } };
  }

  const [songResponse, artistResponse, albumResponse] = await Promise.all([
    searchSongs(normalized, cappedLimit),
    searchArtists(normalized, 20),
    searchAlbums(normalized, 30),
  ]);
  const songs = songResponse?.data?.results || [];
  const artists = artistResponse?.data?.results || [];
  const albums = albumResponse?.data?.results || [];
  const intent = detectSearchIntent(normalized, artists, albums);

  return {
    status: "SUCCESS",
    data: {
      query: normalized,
      intent,
      songs: rankResults(songs, "song", normalized, intent, cappedLimit),
      artists: rankResults(artists, "artist", normalized, intent, 10),
      albums: rankResults(albums, "album", normalized, intent, 12),
    },
  };
}

export async function getAlbumDetails(albumId) {
  try {
    const album = await Album.getById({ albumId: String(albumId) });
    const mapped = await mapAlbum(album);
    return { status: "SUCCESS", data: mapped };
  } catch {
    try {
      const res = await saavnFetch(
        `${SAAVN_API_URL}?__call=content.getAlbumDetails&_format=json&albumid=${albumId}`
      );
      if (!res.ok) throw new Error("Raw album fetch failed");
      const rawData = await res.json();
      const mapped = await mapAlbum(rawData);
      return { status: "SUCCESS", data: mapped };
    } catch {
      return { status: "FAILED", data: null };
    }
  }
}

export async function getArtistDetails(artistId) {
  if (String(artistId).startsWith("curated:")) {
    try {
      const approved = await VerifiedArtist.findOne({ artistId: String(artistId) }).lean();
      if (!approved) return { status: "FAILED", data: null };
      const normalizedName = normaliseSearchText(approved.name);
      const songResponse = await searchSongs(approved.name, 50);
      const topSongs = (songResponse?.data?.results || []).filter((song) =>
        [...(song.artists?.primary || []), ...(song.artists?.featured || []), ...(song.artists?.all || [])]
          .some((artist) => normaliseSearchText(artist?.name) === normalizedName)
      );
      return {
        status: "SUCCESS",
        data: {
          id: approved.artistId,
          name: approved.name,
          image: approved.imageUrl ? [{ quality: "500x500", url: approved.imageUrl }] : [],
          followerCount: approved.followerCount || 0,
          isVerified: true,
          dominantLanguage: approved.dominantLanguage || "unknown",
          dominantType: "Artist",
          bio: "",
          topSongs,
          hasMoreSongs: Boolean(songResponse?.data?.hasMore),
          topAlbums: [],
        },
      };
    } catch {
      return { status: "FAILED", data: null };
    }
  }
  try {
    let data;
    try {
      const res = await saavnFetch(
        `${SAAVN_API_URL}?__call=artist.getArtistPageDetails&_format=json&artistId=${encodeURIComponent(artistId)}`
      );
      if (!res.ok) throw new Error("Raw artist fetch failed");
      data = await res.json();
      if (!data?.name) throw new Error("Artist data missing");
    } catch {
      // The legacy artist page endpoint can omit valid artists. The SDK uses
      // JioSaavn's normalized details response and includes songs/albums too.
      const artist = await Artist.getById({ artistId: String(artistId) });
      if (!artist?.name) throw new Error("Artist data missing");
      data = {
        artistId: artist.id || artistId,
        name: artist.name,
        image: artist.images || [],
        follower_count: artist.stats?.followerCount,
        fan_count: artist.stats?.fanCount,
        isVerified: artist.flags?.isVerified,
        dominantLanguage: artist.language?.primary,
        dominantType: artist.type || "Artist",
        bio: Array.isArray(artist.profile?.bio)
          ? artist.profile.bio.map((section) => section.text).filter(Boolean).join(" ")
          : "",
        topSongs: [ ...(artist.songs?.top || []), ...(artist.songs?.latest || []) ],
        topAlbums: [ ...(artist.albums?.top || []), ...(artist.albums?.singles || []), ...(artist.albums?.latest || []) ],
      };
    }

    const verifiedValue = data.isVerified ?? data.is_verified ?? data.verified;
    const mapped = {
      id: String(data.artistId || artistId),
      name: data.name || "Unknown Artist",
      image: mapImages(data.image),
      followerCount: Number(data.follower_count || data.fan_count) || 0,
      isVerified: verifiedValue === true || verifiedValue === 1 || String(verifiedValue).toLowerCase() === "true",
      dominantLanguage: data.dominantLanguage || "unknown",
      dominantType: data.dominantType || "Artist",
      bio: formatArtistBio(data.bio || data.description || data.about),
      topSongs: [],
      topAlbums: [],
    };

    let rawSongs = Array.isArray(data.topSongs?.songs)
      ? data.topSongs.songs
      : Array.isArray(data.topSongs)
      ? data.topSongs
      : [];

    if (!rawSongs.length && mapped.name) {
      const primaryName = mapped.name.split(/,|&/)[0].trim();
      const searchRes = await saavnFetch(
        `${SAAVN_API_URL}?__call=search.getResults&_format=json&p=1&n=15&q=${encodeURIComponent(primaryName)}`
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        rawSongs = searchData.results || [];
      }
    }

    let mappedSongs = uniqueSongs(
      (await Promise.all(rawSongs.map(mapSongWithFullAudio))).filter(Boolean)
    );

    // Artist page details commonly include only a small top-songs list. Merge
    // in the full search page of tracks credited to this artist (up to the
    // provider's 50-result search limit), without adding unrelated results.
    if (mappedSongs.length < 50 && mapped.name) {
      try {
        const searchRes = await saavnFetch(
          `${SAAVN_API_URL}?__call=search.getResults&_format=json&p=1&n=50&q=${encodeURIComponent(mapped.name)}`
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const additionalSongs = (searchData.results || []).filter((song) =>
            songIsCreditedToArtist(song, mapped.name, artistId)
          );
          mappedSongs = uniqueSongs([
            ...mappedSongs,
            ...(await Promise.all(additionalSongs.map(mapSongWithFullAudio))).filter(Boolean),
          ]);
        }
      } catch {
        // Keep the available top songs if the supplemental search is unavailable.
      }
    }

    mapped.topSongs = mappedSongs;
    mapped.hasMoreSongs = mappedSongs.length >= 50;

    let rawAlbums = Array.isArray(data.topAlbums?.albums)
      ? data.topAlbums.albums
      : Array.isArray(data.topAlbums)
      ? data.topAlbums
      : Array.isArray(data.albums)
      ? data.albums
      : [];

    if (!rawAlbums.length && artistId) {
      try {
        const albumsRes = await saavnFetch(
          `${SAAVN_API_URL}?__call=artist.getArtistAlbums&_format=json&artistId=${artistId}&n=20&p=1`
        );
        if (albumsRes.ok) {
          const albumsData = await albumsRes.json();
          rawAlbums = Array.isArray(albumsData.topAlbums?.albums)
            ? albumsData.topAlbums.albums
            : Array.isArray(albumsData.albums)
            ? albumsData.albums
            : Array.isArray(albumsData.results)
            ? albumsData.results
            : Array.isArray(albumsData)
            ? albumsData
            : [];
        }
      } catch {
        // ignore
      }
    }

    if (!rawAlbums.length && mapped.name) {
      try {
        const primaryName = mapped.name.split(/,|&/)[0].trim();
        const searchAlbumsRes = await saavnFetch(
          `${SAAVN_API_URL}?__call=search.getAlbumResults&_format=json&q=${encodeURIComponent(primaryName)}&n=20`
        );
        if (searchAlbumsRes.ok) {
          const searchData = await searchAlbumsRes.json();
          rawAlbums = searchData.results || searchData.albums || [];
        }
      } catch {
        // ignore
      }
    }

    mapped.topAlbums = (
      await Promise.all(rawAlbums.map(mapAlbum))
    ).filter((album) => album?.id);

    return { status: "SUCCESS", data: mapped };
  } catch {
    return { status: "FAILED", data: null };
  }
}

export async function getArtistSongs(artistId, page = 1, limit = 50) {
  try {
    let artistName = "";
    if (String(artistId).startsWith("curated:")) {
      const approved = await VerifiedArtist.findOne({ artistId: String(artistId) }).lean();
      artistName = approved?.name || "";
    } else {
      const artist = await Artist.getById({ artistId: String(artistId) }).catch(() => null);
      artistName = artist?.name || "";
    }
    if (!artistName) return { status: "SUCCESS", data: { songs: [], results: [], page: Number(page) || 1, hasMore: false } };
    const result = await searchSongs(artistName, limit, page);
    const songs = (result.data?.results || []).filter((song) => songIsCreditedToArtist(song, artistName, artistId));
    return {
      status: "SUCCESS",
      data: { songs, results: songs, page: result.data?.page || Number(page) || 1, hasMore: result.data?.hasMore || false, total: result.data?.total },
    };
  } catch {
    return { status: "SUCCESS", data: { songs: [], results: [], page: Number(page) || 1, hasMore: false } };
  }
}

export async function getArtistAlbums(artistId) {
  try {
    const res = await getArtistDetails(artistId);
    const albums = res.data?.topAlbums || [];
    return { status: "SUCCESS", data: { albums, results: albums } };
  } catch {
    return { status: "SUCCESS", data: { albums: [], results: [] } };
  }
}

export async function getSongLyrics(songId, lyricsId) {
  try {
    let targetLyricsId = lyricsId;
    if (!targetLyricsId && songId) {
      const detailsRes = await saavnFetch(
        `${SAAVN_API_URL}?__call=song.getDetails&pids=${songId}&_format=json`
      );
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        const songData = detailsData[songId] || detailsData.songs?.[0] || Object.values(detailsData)[0];
        targetLyricsId = songData?.lyrics_id || (songData?.has_lyrics === "true" ? songId : null);
      }
    }

    const queryId = targetLyricsId || songId;
    if (!queryId) return { status: "FAILED", data: null };

    const res = await saavnFetch(
      `${SAAVN_API_URL}?__call=lyrics.getLyrics&lyrics_id=${queryId}&ctx=web6dot0&api_version=4&_format=json&_marker=0`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.lyrics) {
        return { status: "SUCCESS", data: { lyrics: data.lyrics, snippet: data.snippet || "" } };
      }
    }

    // Fallback try with pids
    const resPid = await saavnFetch(
      `${SAAVN_API_URL}?__call=lyrics.getLyrics&pids=${queryId}&_format=json`
    );
    if (resPid.ok) {
      const dataPid = await resPid.json();
      if (dataPid?.lyrics) {
        return { status: "SUCCESS", data: { lyrics: dataPid.lyrics, snippet: dataPid.snippet || "" } };
      }
    }

    return { status: "FAILED", data: null };
  } catch {
    return { status: "FAILED", data: null };
  }
}
