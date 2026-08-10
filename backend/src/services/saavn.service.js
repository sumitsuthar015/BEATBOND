import { Song, Album, Artist, fetchFromSaavn } from "@saavn-labs/sdk";

const streamCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const searchResultCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

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

async function resolveFullStreamUrls(encUrl) {
  if (!encUrl || typeof encUrl !== "string") return [];

  const cached = streamCache.get(encUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.urls;
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

    const u320 = baseUrl.replace("_96.mp4", "_320.mp4").replace("_96.mp3", "_320.mp3") + query;
    const u160 = baseUrl.replace("_96.mp4", "_160.mp4").replace("_96.mp3", "_160.mp3") + query;

    const urls = [
      { quality: "320kbps", url: u320 },
      { quality: "160kbps", url: u160 },
      { quality: "96kbps", url: rawUrl },
    ];

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

export async function searchSongs(query, limit = 50) {
  return cachedSearch("songs", query, limit, async (normalized) => {
    try {
      const res = await Song.search({ query: normalized, limit: Number(limit) });
      const results = (await Promise.all((res.results || []).map(mapSongWithFullAudio))).filter((song) => song?.id);
      return { status: "SUCCESS", data: { results } };
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

export async function getAlbumDetails(albumId) {
  try {
    const album = await Album.getById({ albumId: String(albumId) });
    const mapped = await mapAlbum(album);
    return { status: "SUCCESS", data: mapped };
  } catch {
    try {
      const res = await fetch(
        `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&albumid=${albumId}`
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
    const res = await fetch(
      `https://www.jiosaavn.com/api.php?__call=artist.getArtistPageDetails&_format=json&artistId=${artistId}`
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
      const searchRes = await fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=15&q=${encodeURIComponent(primaryName)}`
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
        const searchRes = await fetch(
          `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&p=1&n=50&q=${encodeURIComponent(mapped.name)}`
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
        const albumsRes = await fetch(
          `https://www.jiosaavn.com/api.php?__call=artist.getArtistAlbums&_format=json&artistId=${artistId}&n=20&p=1`
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
        const searchAlbumsRes = await fetch(
          `https://www.jiosaavn.com/api.php?__call=search.getAlbumResults&_format=json&q=${encodeURIComponent(primaryName)}&n=20`
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
      const detailsRes = await fetch(
        `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${songId}&_format=json`
      );
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json();
        const songData = detailsData[songId] || detailsData.songs?.[0] || Object.values(detailsData)[0];
        targetLyricsId = songData?.lyrics_id || (songData?.has_lyrics === "true" ? songId : null);
      }
    }

    const queryId = targetLyricsId || songId;
    if (!queryId) return { status: "FAILED", data: null };

    const res = await fetch(
      `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&lyrics_id=${queryId}&ctx=web6dot0&api_version=4&_format=json&_marker=0`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.lyrics) {
        return { status: "SUCCESS", data: { lyrics: data.lyrics, snippet: data.snippet || "" } };
      }
    }

    // Fallback try with pids
    const resPid = await fetch(
      `https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics&pids=${queryId}&_format=json`
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
