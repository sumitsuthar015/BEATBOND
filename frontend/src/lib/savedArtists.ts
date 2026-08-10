import type { ArtistDetail } from "@/types";
import { axiosInstance } from "@/lib/axios";

export type SavedArtist = Pick<ArtistDetail, "id" | "name" | "image" | "followerCount" | "dominantLanguage">;
export const LIKED_ARTISTS_UPDATED_EVENT = "beatbond:liked-artists-updated";

export const publishSavedArtists = (artists: SavedArtist[]) => {
  window.dispatchEvent(new CustomEvent<SavedArtist[]>(LIKED_ARTISTS_UPDATED_EVENT, { detail: artists }));
};

const storageKey = (userId?: string) => `beatbond:saved-artists:${userId || "guest"}`;

export const getSavedArtists = (userId?: string): SavedArtist[] => {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const toggleSavedArtist = (artist: ArtistDetail, userId?: string) => {
  const saved = getSavedArtists(userId);
  const exists = saved.some((item) => item.id === artist.id);
  const next = exists
    ? saved.filter((item) => item.id !== artist.id)
    : [{ id: artist.id, name: artist.name, image: artist.image, followerCount: artist.followerCount, dominantLanguage: artist.dominantLanguage }, ...saved];
  localStorage.setItem(storageKey(userId), JSON.stringify(next));
  return { saved: !exists, artists: next };
};

const fromApi = (artist: any): SavedArtist => ({
  id: String(artist.artistId || artist.id), name: artist.name,
  image: artist.image || (artist.imageUrl ? [{ quality: "500x500", url: artist.imageUrl }] : []),
  followerCount: artist.followerCount, dominantLanguage: artist.dominantLanguage,
});
export const fetchSavedArtists = async (userId?: string) => {
  const remote = (await axiosInstance.get("/users/liked-artists")).data;
  if (remote.length || !userId) return remote.map(fromApi) as SavedArtist[];
  // Migrate likes saved by the earlier local-storage implementation once the
  // account reaches the server-backed version.
  const legacy = getSavedArtists(userId);
  if (!legacy.length) return [];
  return (await axiosInstance.post("/users/liked-artists/sync", { artists: legacy })).data.map(fromApi) as SavedArtist[];
};
export const toggleSavedArtistRemote = async (artist: ArtistDetail) => {
  const { data } = await axiosInstance.post("/users/liked-artists/toggle", { artistId: artist.id, name: artist.name, imageUrl: artist.image?.[2]?.url || artist.image?.[1]?.url || artist.image?.[0]?.url || "", followerCount: artist.followerCount, dominantLanguage: artist.dominantLanguage });
  return { saved: data.liked as boolean, artists: data.artists.map(fromApi) as SavedArtist[] };
};
export const savedArtistsFromSocket = (artists: any[]) => artists.map(fromApi);
