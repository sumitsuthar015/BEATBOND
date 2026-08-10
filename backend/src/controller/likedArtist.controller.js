import { LikedArtist } from "../models/likedArtist.model.js";
import { emitLikedArtistsUpdate } from "../lib/socket.js";

const list = (userId) => LikedArtist.find({ userId }).sort({ createdAt: -1 }).lean();

export const getLikedArtists = async (req, res, next) => {
  try { res.json(await list(req.auth.userId)); } catch (error) { next(error); }
};

export const toggleLikedArtist = async (req, res, next) => {
  try {
    const artistId = String(req.body.artistId || "").trim();
    const name = String(req.body.name || "").trim();
    if (!artistId || !name) return res.status(400).json({ message: "Artist id and name are required" });
    const existing = await LikedArtist.findOne({ userId: req.auth.userId, artistId });
    const liked = !existing;
    if (existing) await existing.deleteOne();
    else await LikedArtist.create({ userId: req.auth.userId, artistId, name: name.slice(0, 200), imageUrl: String(req.body.imageUrl || "").slice(0, 2000), followerCount: Number(req.body.followerCount) || 0, dominantLanguage: String(req.body.dominantLanguage || "").slice(0, 100) });
    const artists = await list(req.auth.userId);
    emitLikedArtistsUpdate(req.auth.userId, artists);
    res.json({ liked, artists });
  } catch (error) { next(error); }
};

export const syncLikedArtists = async (req, res, next) => {
  try {
    const artists = Array.isArray(req.body.artists) ? req.body.artists : [];
    const operations = artists
      .map((artist) => ({ artistId: String(artist?.id || "").trim(), name: String(artist?.name || "").trim(), imageUrl: String(artist?.image?.[2]?.url || artist?.image?.[1]?.url || artist?.image?.[0]?.url || ""), followerCount: Number(artist?.followerCount) || 0, dominantLanguage: String(artist?.dominantLanguage || "") }))
      .filter((artist) => artist.artistId && artist.name)
      .slice(0, 200)
      .map((artist) => ({ updateOne: { filter: { userId: req.auth.userId, artistId: artist.artistId }, update: { $setOnInsert: { userId: req.auth.userId, ...artist } }, upsert: true } }));
    if (operations.length) await LikedArtist.bulkWrite(operations, { ordered: false });
    const saved = await list(req.auth.userId);
    emitLikedArtistsUpdate(req.auth.userId, saved);
    res.json(saved);
  } catch (error) { next(error); }
};
