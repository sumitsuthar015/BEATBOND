import { User } from "../models/user.model.js";
import { UserLocation } from "../models/userLocation.model.js";
import { Avatar } from "../models/avatar.model.js";
import { emitLocationToFriends, isUserOnline } from "../lib/socket.js";
import {
  LAST_LOCATION_MAX_AGE_MS, areaNameFrom, createTtlCache, distanceMeters, isLiveLocation,
  parseAccuracy, parseNominatimResults, parsePhotonResults, roundCoordinate,
} from "../services/geo.service.js";

const parseLocation = (body) => ({ latitude: Number(body.latitude), longitude: Number(body.longitude) });
const valid = ({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
const locationVisibilities = new Set(["everyone", "friends"]);
const parseVisibility = (value) => locationVisibilities.has(value) ? value : null;

const GEO_HEADERS = { Accept: "application/json", "User-Agent": "BeatBond/1.0 (https://beatbond-75ns.onrender.com)" };
const contextCache = createTtlCache({ maxEntries: 1000, ttlMs: 30 * 60 * 1000 });
const searchCache = createTtlCache({ maxEntries: 500, ttlMs: 60 * 60 * 1000 });

const fetchGeoJson = async (url) => {
  const response = await fetch(url, { headers: GEO_HEADERS, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`${new URL(url).host} responded ${response.status}`);
  return response.json();
};

// External map providers must be called by the server, never from the browser:
// Overpass and Nominatim do not consistently allow cross-origin requests.
export const getMapContext = async (req, res, next) => {
  try {
    const location = { latitude: Number(req.query.lat), longitude: Number(req.query.lng) };
    if (!valid(location)) return res.status(400).json({ message: "Invalid coordinates" });

    // ~110 m cells: everyone on the same street shares one lookup.
    const key = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
    let areaName = contextCache.get(key);
    if (areaName === undefined) {
      try {
        const address = await fetchGeoJson(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=en&lat=${location.latitude}&lon=${location.longitude}`);
        areaName = areaNameFrom(address);
        contextCache.set(key, areaName);
      } catch {
        areaName = "";
      }
    }
    res.json({ areaName, places: [] });
  } catch (error) { next(error); }
};

// Photon is built for search-as-you-type and ranks places near the viewer
// first; Nominatim is the fallback when Photon is down or finds nothing.
export const searchMapPlace = async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim().slice(0, 160);
    if (!query) return res.status(400).json({ message: "Search query is required" });
    const near = { latitude: Number(req.query.lat), longitude: Number(req.query.lng) };
    // A city-sized bias: nearby places rank first, but a well-known
    // neighbourhood still beats a bus stop with the same name.
    const bias = valid(near) ? `&lat=${near.latitude.toFixed(2)}&lon=${near.longitude.toFixed(2)}&zoom=10&location_bias_scale=0.5` : "";
    const key = `${query.toLowerCase()}|${bias}`;

    let results = searchCache.get(key);
    if (!results) {
      results = await fetchGeoJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en${bias}`)
        .then((payload) => parsePhotonResults(payload).slice(0, 6))
        .catch(() => []);
      if (!results.length) {
        results = await fetchGeoJson(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=${encodeURIComponent(query)}`)
          .then(parseNominatimResults)
          .catch(() => []);
      }
      if (results.length) searchCache.set(key, results);
    }
    // The first match is also spread at the top level for app versions that
    // still expect a single { lat, lng, name } result.
    res.json({ ...(results[0] ?? {}), results });
  } catch (error) { next(error); }
};

export const updateMyLocation = async (req, res, next) => {
  try {
    const location = parseLocation(req.body);
    if (!valid(location)) return res.status(400).json({ message: "Invalid coordinates" });
    const userId = req.auth.userId;
    const sharingEnabled = Boolean(req.body.sharingEnabled);
    const visibility = parseVisibility(req.body.visibility) || "everyone";
    const saved = {
      latitude: roundCoordinate(location.latitude),
      longitude: roundCoordinate(location.longitude),
      accuracy: parseAccuracy(req.body.accuracy),
      sharingEnabled,
      visibility,
      updatedAt: new Date(),
    };
    const previous = await UserLocation.findOneAndUpdate({ userId }, saved, { new: false, upsert: true, runValidators: true }).lean();
    // A phone that hasn't moved still checks in every minute so its pin stays
    // live. Viewers pick that up on their regular refresh; only real changes
    // are pushed to them straight away.
    const changed = !previous
      || previous.sharingEnabled !== sharingEnabled
      || previous.visibility !== visibility
      || !isLiveLocation(previous)
      || distanceMeters(previous, saved) >= 10;
    if (changed) {
      // Moving from everyone to friends-only must also reach non-friends, so
      // their maps drop the pin.
      const audience = previous?.visibility === "everyone" || visibility === "everyone" ? "everyone" : "friends";
      await emitLocationToFriends(userId, { visibility: audience });
    }
    res.json({ userId, ...saved });
  } catch (error) { next(error); }
};

export const getMyLocationPreference = async (req, res, next) => {
  try {
    const location = await UserLocation.findOne({ userId: req.auth.userId }).select("sharingEnabled visibility").lean();
    res.json({ sharingEnabled: Boolean(location?.sharingEnabled), visibility: location?.visibility || "everyone" });
  } catch (error) { next(error); }
};

export const updateMyLocationVisibility = async (req, res, next) => {
  try {
    const visibility = parseVisibility(req.body.visibility);
    if (!visibility) return res.status(400).json({ message: "Visibility must be everyone or friends" });
    const saved = await UserLocation.findOneAndUpdate(
      { userId: req.auth.userId },
      // Only who can see it changes; the pin keeps its own timestamp.
      { visibility },
      { new: true }
    );
    // Broadcast a refresh signal (never coordinates) so a privacy change is
    // reflected immediately for viewers who should no longer see this pin.
    await emitLocationToFriends(req.auth.userId, { visibility: "everyone" });
    res.json({ sharingEnabled: Boolean(saved?.sharingEnabled), visibility });
  } catch (error) { next(error); }
};

const loadViewer = (viewerId) => User.findOne({ clerkId: viewerId }).select("friends blockedUsers").lean();
const lastLocationCutoff = () => new Date(Date.now() - LAST_LOCATION_MAX_AGE_MS);

// Applies the visibility rules to raw location records. A viewer never sees
// people who blocked them, friends-only pins of non-friends, or activity the
// owner keeps private.
const presentLocations = async (viewerId, viewer, locations) => {
  const userIds = locations.map((location) => location.userId);
  if (!userIds.length) return [];
  const [users, avatars] = await Promise.all([
    User.find({ clerkId: { $in: userIds } }).select("clerkId fullName username imageUrl currentActivity musicPrivacy blockedUsers").lean(),
    Avatar.find({ userId: { $in: userIds } }).select("userId gender options").lean(),
  ]);
  const usersById = new Map(users.map((user) => [user.clerkId, user]));
  const avatarsByUserId = new Map(avatars.map((avatar) => [avatar.userId, avatar]));
  const friends = new Set(viewer?.friends ?? []);
  const now = Date.now();

  return locations.flatMap((location) => {
    const user = usersById.get(location.userId);
    // Hide people who have blocked the viewer as well as malformed/orphaned
    // location records.
    if (!user || user.blockedUsers?.includes(viewerId)) return [];
    const isFriend = friends.has(location.userId);
    if (location.visibility === "friends" && !isFriend) return [];
    const canSeeActivity = user.musicPrivacy === "everyone" || (user.musicPrivacy === "friends" && isFriend);
    return [{
      userId: location.userId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? null,
      updatedAt: location.updatedAt,
      // Live means sharing is on and the app checked in recently; a pin left
      // behind by a closed app shows as a last location instead.
      isLive: isLiveLocation(location, now),
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
  });
};

// The map returns only accounts that have shared a location in the last week.
// A viewer never receives their own record.
export const getLiveLocations = async (req, res, next) => {
  try {
    const viewerId = req.auth.userId;
    const viewer = await loadViewer(viewerId);
    const locations = await UserLocation.find({
      userId: { $nin: [viewerId, ...(viewer?.blockedUsers ?? [])] },
      updatedAt: { $gte: lastLocationCutoff() },
    }).sort({ updatedAt: -1 }).limit(250).lean();
    res.json(await presentLocations(viewerId, viewer, locations));
  } catch (error) { next(error); }
};

// One person's pin, for refreshing a single marker after a socket signal
// instead of reloading everyone. Null means the viewer may no longer see it.
export const getLiveLocation = async (req, res, next) => {
  try {
    const viewerId = req.auth.userId;
    const userId = String(req.params.userId || "").slice(0, 200);
    if (!userId || userId === viewerId) return res.json(null);
    const viewer = await loadViewer(viewerId);
    if (viewer?.blockedUsers?.includes(userId)) return res.json(null);
    const location = await UserLocation.findOne({ userId, updatedAt: { $gte: lastLocationCutoff() } }).lean();
    const [visible] = location ? await presentLocations(viewerId, viewer, [location]) : [];
    res.json(visible ?? null);
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
    const saved = await UserLocation.findOneAndUpdate(
      { userId: req.auth.userId },
      { sharingEnabled: false, updatedAt: new Date() },
      { new: true }
    );
    await emitLocationToFriends(req.auth.userId, saved);
    res.status(204).end();
  } catch (error) { next(error); }
};
