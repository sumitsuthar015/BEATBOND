import {
  searchSongs,
  searchArtists,
  searchAlbums,
  getAlbumDetails,
  getArtistDetails,
  getArtistSongs,
  getArtistAlbums,
  getSongLyrics,
} from "../services/saavn.service.js";

export const handleSearchSongs = async (req, res) => {
  const { query, limit } = req.query;
  const result = await searchSongs(query || "", limit || 50);
  res.status(200).json(result);
};

export const handleSearchArtists = async (req, res) => {
  const { query, limit } = req.query;
  const result = await searchArtists(query || "", limit || 10);
  res.status(200).json(result);
};

export const handleSearchAlbums = async (req, res) => {
  const { query, limit } = req.query;
  const result = await searchAlbums(query || "", limit || 20);
  res.status(200).json(result);
};

export const handleGetAlbumById = async (req, res) => {
  const albumId = req.query.id || req.params.id;
  if (!albumId) {
    return res.status(400).json({ status: "FAILED", message: "Album ID is required" });
  }
  const result = await getAlbumDetails(albumId);
  res.status(200).json(result);
};

export const handleGetArtistById = async (req, res) => {
  const { id } = req.params;
  const result = await getArtistDetails(id);
  res.status(200).json(result);
};

export const handleGetArtistSongs = async (req, res) => {
  const { id } = req.params;
  const result = await getArtistSongs(id);
  res.status(200).json(result);
};

export const handleGetArtistAlbums = async (req, res) => {
  const { id } = req.params;
  const result = await getArtistAlbums(id);
  res.status(200).json(result);
};

export const handleGetSongLyrics = async (req, res) => {
  const songId = req.params.id || req.query.songId || req.query.id;
  const lyricsId = req.query.lyricsId;
  const result = await getSongLyrics(songId, lyricsId);
  res.status(200).json(result);
};

