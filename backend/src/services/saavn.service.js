
import { Song, Album, Artist, fetchFromSaavn, setFetchConfig } from "@saavn-labs/sdk";
import CryptoJS from "crypto-js";

// JioSaavn tailors its catalogue to the caller's country, and outside India it
// hides many licensed originals (e.g. international hits). When the backend is
// hosted abroad, set SAAVN_API_BASE to a relay running in India (see
// saavn-relay/README.md) so every provider call leaves from an Indian IP.
const SAAVN_API_BASE = (process.env.SAAVN_API_BASE || "https://www.jiosaavn.com").replace(/\/+$/, "");
const SAAVN_API_URL = `${SAAVN_API_BASE}/api.php`;
const SAAVN_HEADERS = process.env.SAAVN_RELAY_KEY ? { "x-relay-key": process.env.SAAVN_RELAY_KEY } : {};
if (process.env.SAAVN_API_BASE) {
  setFetchConfig({ baseUrl: SAAVN_API_BASE, defaultHeaders: SAAVN_HEADERS });
}

const saavnFetch = (url, init = {}) =>
  fetch(url, { ...init, headers: { ...SAAVN_HEADERS, ...(init.headers || {}) } });

const streamCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const searchResultCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

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
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ");

const SEARCH_NOISE_WORDS = new Set([
  "song", "songs", "music", "official", "video", "audio", "lyrics",
  "full", "new", "latest", "download", "listen", "play",
]);

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
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
};

const fuzzyScore = (query, fields) => {
  if (query.length < 4) return 0;
  const words = fields.searchableText.split(" ").filter(Boolean);
  const queryWords = tokenizeQuery(query);
  const close = queryWords.filter((term) => words.some((word) => Math.abs(word.length - term.length) <= 2 && editDistance(term, word) <= (term.length >= 7 ? 2 : 1))).length;
  return close === queryWords.length ? 80 : close ? close * 15 : 0;
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
      score += fuzzyScore(normalized, fields);
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

// Search responses are read-heavy and identical queries are common while a
// user refines text. Cache the already-shaped payload, not the raw provider
// response, so clients receive the smallest possible object immediately.
const cachedSearch = async (kind, query, limit, fetcher) => {
  const normalized = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
  const key = `${kind}:${normalized}:${limit}`;
  const cached = searchResultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetcher(normalized);
  searchResultCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, value });
  return value;
};

// The SDK occasionally returns an empty collection for newer Indian releases
// and international tracks even though they are present in JioSaavn's web
// catalogue. Use JioSaavn's own web search response as a server-side fallback.
// It also avoids making browsers depend on a third-party CORS policy.
const searchJioSaavnWebSongs = async (query, limit) => {
  try {
    const params = new URLSearchParams({
      __call: "search.getResults",
      _format: "json",
      _marker: "0",
      api_version: "4",
      ctx: "web6dot0",
      p: "1",
      n: String(Math.min(Math.max(Number(limit) || 20, 1), 50)),
      q: query,
    });
    const response = await saavnFetch(`${SAAVN_API_URL}?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "BeatBond/1.0" },
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
  const verifiedValue = artist.isVerified ?? artist.is_verified ?? artist.verified;
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
    followerCount: Number(artist.followerCount || artist.follower_count || 0),
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
      const providerLimit = Math.min(safeLimit * safePage, 50);
      // Always merge the web catalogue: the SDK can return a non-empty but
      // incomplete list (for example a remix) while missing the official song.
      // Both lookups are independent, so run them side by side.
      const [sdkResponse, webResults] = await Promise.all([
        Song.search({ query: normalized, limit: providerLimit }).catch(() => ({ results: [] })),
        searchJioSaavnWebSongs(normalized, providerLimit),
      ]);
      const sdkResults = sdkResponse?.results || [];
      const sourceResults = uniqueSongsById([...sdkResults, ...webResults]);
      const results = (await Promise.all(sourceResults.map(mapSongWithFullAudio))).filter((song) => song?.id);
      // Some SDK results contain metadata but no playable stream, while the
      // web catalogue does. Retry against it before giving up on the query.
      if (!results.length && !webResults.length) {
        const retryWebResults = await searchJioSaavnWebSongs(normalized, limit);
        return { status: "SUCCESS", data: { results: (await Promise.all(retryWebResults.map(mapSongWithFullAudio))).filter((song) => song?.id) } };
      }
      const start = (safePage - 1) * safeLimit;
      return { status: "SUCCESS", data: { results: results.slice(start, start + safeLimit), page: safePage, limit: safeLimit, hasMore: results.length > start + safeLimit } };
    } catch { return { status: "SUCCESS", data: { results: [] } }; }
  });
}

export async function searchArtists(query, limit = 10) {
  return cachedSearch("artists", query, limit, async (normalized) => {
    try {
      const res = await Artist.search({ query: normalized, limit: Number(limit) });
      return { status: "SUCCESS", data: { results: (res.results || []).map(mapArtist).filter(Boolean) } };
    } catch { return { status: "SUCCESS", data: { results: [] } }; }
  });
}

export async function searchAlbums(query, limit = 20) {
  return cachedSearch("albums", query, limit, async (normalized) => {
    try {
      const res = await Album.search({ query: normalized, limit: Number(limit) });
      const results = (await Promise.all((res.results || []).map(mapAlbum))).filter(Boolean);
      return { status: "SUCCESS", data: { results } };
    } catch { return { status: "SUCCESS", data: { results: [] } }; }
  });
}

// The search page and the top-bar need one consistent view of a query. Fetch
// all JioSaavn entity types first, then score and cap them together rather
// than trusting whichever provider endpoint happened to respond first.
export async function searchCatalogue(query, limit = 30) {
  const normalized = normaliseSearchText(query);
  const cappedLimit = Math.min(Math.max(Number(limit) || 30, 1), 30);
  if (!normalized) {
    return { status: "SUCCESS", data: { query: "", intent: "general", songs: [], artists: [], albums: [] } };
  }

  const [songResponse, artistResponse, albumResponse] = await Promise.all([
    searchSongs(normalized, 50),
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
  try {
    const res = await saavnFetch(
      `${SAAVN_API_URL}?__call=artist.getArtistPageDetails&_format=json&artistId=${artistId}`
    );
    if (!res.ok) throw new Error("Raw artist fetch failed");
    const data = await res.json();
    if (!data || !data.name) throw new Error("Artist data missing");

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

    // Artist page details commonly include only a small top-songs list. Fill
    // it from the song search endpoint so the page can show up to 15 unique,
    // credited tracks without adding unrelated search results.
    if (mappedSongs.length < 15 && mapped.name) {
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

    mapped.topSongs = mappedSongs.slice(0, 15);

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

export async function getArtistSongs(artistId) {
  try {
    const res = await getArtistDetails(artistId);
    const songs = res.data?.topSongs || [];
    return { status: "SUCCESS", data: { songs, results: songs } };
  } catch {
    return { status: "SUCCESS", data: { songs: [], results: [] } };
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
