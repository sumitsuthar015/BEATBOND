import { User } from "../models/user.model.js";
import { UserLocation } from "../models/userLocation.model.js";
import { Avatar } from "../models/avatar.model.js";
import { emitLocationToFriends, isUserOnline } from "../lib/socket.js";

const parseLocation = (body) => ({ latitude: Number(body.latitude), longitude: Number(body.longitude) });
const valid = ({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

// External map providers must be called by the server, never from the browser:
// Overpass and Nominatim do not consistently allow cross-origin requests.
export const getMapContext = async (req, res, next) => {
  try {
    const location = { latitude: Number(req.query.lat), longitude: Number(req.query.lng) };
    if (!valid(location)) return res.status(400).json({ message: "Invalid coordinates" });

    const reverse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.latitude}&lon=${location.longitude}`, {
      headers: { Accept: "application/json", "User-Agent": "BeatBond/1.0 (map context)" },
    });
    const address = reverse.ok ? await reverse.json() : null;
    const area = address?.address || {};
    res.json({
      areaName: area.neighbourhood || area.suburb || area.city || area.town || address?.display_name || "",
      places: [],
    });
  } catch (error) { next(error); }
};

export const searchMapPlace = async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 160);
    if (!query) return res.status(400).json({ message: "Search query is required" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json", "User-Agent": "BeatBond/1.0 (map search)" },
    });
    const [result] = response.ok ? await response.json() : [];
    if (!result) return res.status(404).json({ message: "No place found" });
    res.json({ lat: Number(result.lat), lng: Number(result.lon), name: result.display_name || query });
  } catch (error) { next(error); }
};

export const updateMyLocation = async (req, res, next) => {
  try {
    const location = parseLocation(req.body);
    if (!valid(location)) return res.status(400).json({ message: "Invalid coordinates" });
    const sharingEnabled = Boolean(req.body.sharingEnabled);
    const saved = await UserLocation.findOneAndUpdate({ userId: req.auth.userId }, { ...location, sharingEnabled, visibility: "everyone", updatedAt: new Date() }, { new: true, upsert: true, runValidators: true });
    if (sharingEnabled) await emitLocationToFriends(req.auth.userId, saved);
    res.json(saved);
  } catch (error) { next(error); }
};

// The map deliberately returns only accounts that have opted in by turning
// location sharing on. Exact locations are never returned for a user who has
// disabled sharing, and a viewer never receives their own record.
export const getLiveLocations = async (req, res, next) => {
  try {
    const viewerId = req.auth.userId;
    const viewer = await User.findOne({ clerkId: viewerId }).select("friends blockedUsers").lean();
    const blockedIds = viewer?.blockedUsers ?? [];
    // Keep the latest saved pin after a user turns sharing off. The client
    // labels it as a last location, rather than presenting it as live.
    const locations = await UserLocation.find({
      userId: { $nin: [viewerId, ...blockedIds] },
    }).sort({ updatedAt: -1 }).limit(250).lean();
    const userIds = locations.map((location) => location.userId);
    const users = await User.find({ clerkId: { $in: userIds } })
      .select("clerkId fullName username imageUrl currentActivity musicPrivacy blockedUsers")
      .lean();
    const avatars = await Avatar.find({ userId: { $in: userIds } }).select("userId gender options").lean();
    const usersById = new Map(users.map((user) => [user.clerkId, user]));
    const avatarsByUserId = new Map(avatars.map((avatar) => [avatar.userId, avatar]));
    const friends = new Set(viewer?.friends ?? []);

    res.json(locations.flatMap((location) => {
      const user = usersById.get(location.userId);
      // Hide people who have blocked the viewer as well as malformed/orphaned
      // location records.
      if (!user || user.blockedUsers?.includes(viewerId)) return [];
      const isFriend = friends.has(location.userId);
      const canSeeActivity = user.musicPrivacy === "everyone" || (user.musicPrivacy === "friends" && isFriend);
      return [{
        userId: location.userId,
        latitude: location.latitude,
        longitude: location.longitude,
        updatedAt: location.updatedAt,
        isLive: location.sharingEnabled,
        isFriend,
        isOnline: isUserOnline(location.userId),
        avatar: avatarsByUserId.get(location.userId) || null,
        user: {
          fullName: user.fullName,
          username: user.username,
          imageUrl: user.imageUrl,
          currentActivity: canSeeActivity ? user.currentActivity : null,
        },
      }];
    }));
  } catch (error) { next(error); }
};

export const getFriendLocations = async (req, res, next) => {
  try {
    const me = await User.findOne({ clerkId: req.auth.userId }).select("friends").lean();
    const friendIds = me?.friends ?? [];
    const [locations, friends, avatars] = await Promise.all([
      UserLocation.find({ userId: { $in: friendIds }, sharingEnabled: true }).lean(),
      User.find({ clerkId: { $in: friendIds } }).select("clerkId fullName imageUrl lastSeen currentActivity musicPrivacy").lean(),
      Avatar.find({ userId: { $in: friendIds } }).lean(),
    ]);
    const users = new Map(friends.map((friend) => [friend.clerkId, friend]));
    const avatarByUser = new Map(avatars.map((avatar) => [avatar.userId, avatar]));
    res.json(locations.map((location) => {
      const friend = users.get(location.userId);
      const user = friend && { ...friend, currentActivity: friend.musicPrivacy === "none" ? null : friend.currentActivity };
      return { ...location, user, avatar: avatarByUser.get(location.userId), isOnline: isUserOnline(location.userId) };
    }));
  } catch (error) { next(error); }
};

export const disableMyLocation = async (req, res, next) => {
  try {
    await UserLocation.findOneAndUpdate({ userId: req.auth.userId }, { sharingEnabled: false, updatedAt: new Date() });
    await emitLocationToFriends(req.auth.userId, null);
    res.status(204).end();
  } catch (error) { next(error); }
};
