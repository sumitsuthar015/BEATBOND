import { Playlist } from "../models/playlist.model.js";

const songPayload = (song) => ({
  _id: String(song._id || song.id || ""),
  title: String(song.title || song.name || "").trim(),
  artist: String(song.artist || "").trim(),
  imageUrl: String(song.imageUrl || ""),
  audioUrl: String(song.audioUrl || ""),
  duration: Number(song.duration) || 0,
  albumId: song.albumId || null,
  albumName: song.albumName || null,
});

const present = (playlist) => ({
  id: playlist._id.toString(),
  name: playlist.name,
  description: playlist.description,
  songs: playlist.songs || [],
  ownerId: playlist.ownerId,
  downloadedAt: playlist.downloadedAt || null,
  createdAt: playlist.createdAt,
  updatedAt: playlist.updatedAt,
});

export const getMyPlaylists = async (req, res, next) => {
  try {
    res.json(
      (
        await Playlist.find({ ownerId: req.auth().userId })
          .sort({ updatedAt: -1 })
          .lean()
      ).map(present),
    );
  } catch (error) {
    next(error);
  }
};

export const getPlaylistById = async (req, res, next) => {
  try {
    const playlist = await Playlist.findOne({ _id: req.params.playlistId, ownerId: req.auth().userId }).lean();
    if (!playlist) {
      return res.status(404).json({ message: "Playlist not found" });
    }
    res.json(present(playlist));
  } catch (error) {
    next(error);
  }
};
export const createPlaylist = async (req, res, next) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name)
      return res.status(400).json({ message: "A playlist name is required" });
    if (name.length > 100 || (req.body.description !== undefined && (typeof req.body.description !== "string" || req.body.description.length > 500))) {
      return res.status(400).json({ message: "Playlist name or description is too long." });
    }
    const playlist = await Playlist.create({
      ownerId: req.auth().userId,
      name,
      description: String(req.body.description || "").trim(),
    });
    res.status(201).json(present(playlist));
  } catch (error) {
    next(error);
  }
};
export const updatePlaylist = async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || req.body.name.length > 100) return res.status(400).json({ message: "Playlist name must be under 100 characters." });
      const name = req.body.name.trim();
      if (!name)
        return res.status(400).json({ message: "A playlist name is required" });
      updates.name = name;
    }
    if (req.body.description !== undefined) {
      if (typeof req.body.description !== "string" || req.body.description.length > 500) return res.status(400).json({ message: "Playlist description must be under 500 characters." });
      updates.description = req.body.description.trim();
    }
    const playlist = await Playlist.findOneAndUpdate(
      { _id: req.params.playlistId, ownerId: req.auth().userId },
      updates,
      { new: true, runValidators: true },
    );
    if (!playlist)
      return res.status(404).json({ message: "Playlist not found" });
    res.json(present(playlist));
  } catch (error) {
    next(error);
  }
};
export const deletePlaylist = async (req, res, next) => {
  try {
    const result = await Playlist.deleteOne({
      _id: req.params.playlistId,
      ownerId: req.auth().userId,
    });
    if (!result.deletedCount)
      return res.status(404).json({ message: "Playlist not found" });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
export const setPlaylistDownloaded = async (req, res, next) => {
  try {
    if (typeof req.body?.downloaded !== "boolean") return res.status(400).json({ message: "downloaded must be a boolean" });
    const downloaded = req.body.downloaded;
    const playlist = await Playlist.findOneAndUpdate(
      { _id: req.params.playlistId, ownerId: req.auth().userId },
      { downloadedAt: downloaded ? new Date() : null },
      { new: true },
    );
    if (!playlist)
      return res.status(404).json({ message: "Playlist not found" });
    res.json(present(playlist));
  } catch (error) {
    next(error);
  }
};
export const addSong = async (req, res, next) => {
  try {
    const song = songPayload(req.body.song || {});
    if (!song._id || !song.title || !song.audioUrl)
      return res
        .status(400)
        .json({ message: "A complete playable song is required" });
    if (song.title.length > 200 || song.artist.length > 200 || song.imageUrl.length > 2_000 || song.audioUrl.length > 2_000 || !/^https:\/\//i.test(song.audioUrl)) {
      return res.status(400).json({ message: "Song details are invalid or too long." });
    }
    const playlist = await Playlist.findOne({
      _id: req.params.playlistId,
      ownerId: req.auth().userId,
    });
    if (!playlist)
      return res.status(404).json({ message: "Playlist not found" });
    if (playlist.songs.some((item) => String(item._id) === song._id))
      return res
        .status(409)
        .json({ message: "Song is already in this playlist" });
    playlist.songs.push(song);
    await playlist.save();
    res.json(present(playlist));
  } catch (error) {
    next(error);
  }
};
export const removeSong = async (req, res, next) => {
  try {
    const playlist = await Playlist.findOne({
      _id: req.params.playlistId,
      ownerId: req.auth().userId,
    });
    if (!playlist)
      return res.status(404).json({ message: "Playlist not found" });
    const initial = playlist.songs.length;
    playlist.songs = playlist.songs.filter(
      (item) => String(item._id) !== req.params.songId,
    );
    if (initial === playlist.songs.length)
      return res.status(404).json({ message: "Song not found in playlist" });
    await playlist.save();
    res.json(present(playlist));
  } catch (error) {
    next(error);
  }
};
