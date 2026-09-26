// Profile rules shared by the profile endpoints: what a user may save about
// themselves, and the "music taste" summary shown on their profile.

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LIMITS = { fullName: 80, bio: 280, location: 60, website: 200 };

/** Accepts "mysite.com" or a full link; returns null if it isn't a web address. */
export const normalizeWebsite = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString().slice(0, LIMITS.website);
  } catch {
    return null;
  }
};

/**
 * Validates the fields a user sent to update their own profile. Only fields
 * that were sent are updated. Email belongs to the sign-in provider, so it is
 * never changed here.
 */
export const validateProfileUpdate = (body = {}) => {
  const updates = {};
  if (body.fullName !== undefined) {
    const fullName = String(body.fullName).trim();
    if (!fullName) return { error: "Add your display name before saving." };
    if (fullName.length > LIMITS.fullName) return { error: `Display name can be at most ${LIMITS.fullName} characters.` };
    updates.fullName = fullName;
  }
  if (body.username !== undefined && String(body.username).trim()) {
    const username = String(body.username).trim();
    if (!USERNAME_PATTERN.test(username)) return { error: "Username must be 3–30 letters, numbers, or underscores." };
    updates.username = username;
  }
  if (body.bio !== undefined) {
    const bio = String(body.bio).trim();
    if (bio.length > LIMITS.bio) return { error: `Bio can be at most ${LIMITS.bio} characters.` };
    updates.bio = bio;
  }
  if (body.location !== undefined) {
    const location = String(body.location).trim();
    if (location.length > LIMITS.location) return { error: `Location can be at most ${LIMITS.location} characters.` };
    updates.location = location;
  }
  if (body.website !== undefined) {
    const website = normalizeWebsite(body.website);
    if (website === null) return { error: "Enter a valid website link, like mysite.com." };
    updates.website = website;
  }
  // The photo is changed only through the photo endpoints (see photoStateOf).
  return { updates };
};

// ---- Profile photo ----
// imageUrl is what every screen shows. It is derived from the owner's choice:
// their Google photo ("provider"), a photo they uploaded, their avatar, or
// nothing. All three pictures are kept, so switching back is instant.
export const PHOTO_SOURCES = ["provider", "upload", "avatar", "none"];

const isUploadedPhoto = (url = "") => /res\.cloudinary\.com/i.test(url);

/** The photo fields of a user, including accounts from before photo choices existed. */
export const photoStateOf = (user = {}) => {
  const state = {
    photoSource: user.photoSource,
    photoUrl: user.photoUrl || "",
    providerImageUrl: user.providerImageUrl || "",
    avatarImageUrl: user.avatarImageUrl || "",
  };
  if (!PHOTO_SOURCES.includes(state.photoSource)) {
    // Older accounts only had imageUrl: either an uploaded photo or the Google one.
    if (isUploadedPhoto(user.imageUrl)) {
      state.photoSource = "upload";
      state.photoUrl ||= user.imageUrl;
    } else {
      state.photoSource = "provider";
      state.providerImageUrl ||= user.imageUrl || "";
    }
  }
  return state;
};

export const displayImageFor = ({ photoSource, photoUrl, providerImageUrl, avatarImageUrl }) => {
  if (photoSource === "none") return "";
  if (photoSource === "avatar") return avatarImageUrl || photoUrl || providerImageUrl;
  if (photoSource === "upload") return photoUrl || providerImageUrl;
  return providerImageUrl;
};

/** Whether a source can be chosen: its picture has to exist. */
export const photoSourceAvailable = (state, source) =>
  source === "none"
  || (source === "provider" && Boolean(state.providerImageUrl))
  || (source === "upload" && Boolean(state.photoUrl))
  || (source === "avatar" && Boolean(state.avatarImageUrl));

/** The fields to save for a photo state, with the image every screen shows. */
export const photoUpdate = (state) => ({ ...state, imageUrl: displayImageFor(state) });

const primaryArtist = (artist = "") => String(artist).split(/,|&|\bfeat\.?\b|\bft\.?\b| x /i)[0].trim();

/**
 * Turns listening history (newest first) into the artists someone plays the
 * most and the songs they played last, one entry per song.
 */
export const summarizeListening = (activities = [], { topLimit = 6, recentLimit = 8 } = {}) => {
  const artists = new Map();
  activities.forEach((activity, index) => {
    const name = primaryArtist(activity.artist);
    if (!name || /^unknown/i.test(name)) return;
    const entry = artists.get(name) ?? { name, plays: 0, imageUrl: activity.imageUrl || "", lastIndex: index };
    entry.plays += 1;
    artists.set(name, entry);
  });
  const topArtists = [...artists.values()]
    .sort((a, b) => b.plays - a.plays || a.lastIndex - b.lastIndex)
    .slice(0, topLimit)
    .map(({ name, plays, imageUrl }) => ({ name, plays, imageUrl }));

  const seen = new Set();
  const recent = [];
  for (const activity of activities) {
    if (recent.length >= recentLimit) break;
    if (!activity.songId || seen.has(activity.songId)) continue;
    seen.add(activity.songId);
    recent.push({
      _id: activity.songId,
      title: activity.title,
      artist: activity.artist,
      imageUrl: activity.imageUrl,
      audioUrl: activity.audioUrl,
      albumId: activity.albumId,
      genre: activity.genre,
      duration: activity.duration,
      playedAt: new Date(activity.playedAt).toISOString(),
      videoUrl: null,
    });
  }
  return { topArtists, recent };
};
