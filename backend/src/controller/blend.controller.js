import { User } from "../models/user.model.js";
import { ListeningActivity } from "../models/listeningActivity.model.js";
import { canSeeListeningHistory } from "../services/privacy.service.js";

const keyFor = (play) => `${String(play.title || "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")}|${String(play.artist || "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")}`;
const playable = (play) => ({ _id: play.songId, title: play.title, artist: play.artist, imageUrl: play.imageUrl, audioUrl: play.audioUrl, duration: play.duration || 0, albumId: play.albumId || "", genre: play.genre || "Unknown", playedAt: play.playedAt });

export const getBlend = async (req, res, next) => {
  try {
    const viewerId = req.auth().userId;
    const friendId = String(req.params.friendId || "").slice(0, 200);
    if (!friendId || friendId === viewerId) return res.status(400).json({ message: "Choose a friend to blend with." });
    const [viewer, friend] = await Promise.all([
      User.findOne({ clerkId: viewerId }).select("friends blockedUsers").lean(),
      User.findOne({ clerkId: friendId }).select("clerkId fullName imageUrl friends blockedUsers musicHiddenFrom historyPrivacy").lean(),
    ]);
    if (!friend || !viewer?.friends?.includes(friendId) || friend.blockedUsers?.includes(viewerId) || viewer.blockedUsers?.includes(friendId)) return res.status(404).json({ message: "Blend is available between friends only." });
    if (!canSeeListeningHistory(friend, viewerId)) return res.status(403).json({ message: "Your friend has hidden their listening history." });
    const [mine, theirs] = await Promise.all([
      ListeningActivity.find({ userId: viewerId }).sort({ playedAt: -1 }).limit(100).lean(),
      ListeningActivity.find({ userId: friendId }).sort({ playedAt: -1 }).limit(100).lean(),
    ]);
    const mineByKey = new Map(); mine.forEach((play) => { if (!mineByKey.has(keyFor(play))) mineByKey.set(keyFor(play), play); });
    const theirsByKey = new Map(); theirs.forEach((play) => { if (!theirsByKey.has(keyFor(play))) theirsByKey.set(keyFor(play), play); });
    const union = new Set([...mineByKey.keys(), ...theirsByKey.keys()]);
    const shared = [...mineByKey.keys()].filter((key) => theirsByKey.has(key)).map((key) => mineByKey.get(key));
    const blended = [];
    const seen = new Set();
    const append = (list) => list.forEach((play) => { const key = keyFor(play); if (play.audioUrl && !seen.has(key) && blended.length < 40) { seen.add(key); blended.push(playable(play)); } });
    append(shared);
    for (let index = 0; blended.length < 40 && (index < mine.length || index < theirs.length); index += 1) {
      if (mine[index]) append([mine[index]]);
      if (theirs[index]) append([theirs[index]]);
    }
    res.json({ friend: { clerkId: friend.clerkId, fullName: friend.fullName, imageUrl: friend.imageUrl }, tasteMatch: union.size ? Math.round(shared.length / union.size * 100) : 0, sharedSongCount: shared.length, playlist: blended });
  } catch (error) { next(error); }
};
