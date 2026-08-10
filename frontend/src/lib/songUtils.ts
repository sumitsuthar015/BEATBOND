import { Song } from "@/types";

/**
 * Validates if a song has a verified title, non-generic artist name, and playable audio URL.
 * Filters out unknown artists/songs like "Unknown Artist", empty strings, or unplayable tracks.
 */
export const isVerifiedValidSong = (song: Song | null | undefined): boolean => {
  if (!song) return false;

  // Validate Audio URL
  const audioUrl = song.audioUrl;
  if (!audioUrl || typeof audioUrl !== "string" || !audioUrl.trim()) {
    return false;
  }
  const cleanAudioUrl = audioUrl.trim();
  if (!cleanAudioUrl.startsWith("http://") && !cleanAudioUrl.startsWith("https://") && !cleanAudioUrl.startsWith("blob:")) {
    return false;
  }

  // Validate Title
  const title = song.title;
  if (!title || typeof title !== "string" || !title.trim()) {
    return false;
  }
  const titleLower = title.trim().toLowerCase();
  if (
    titleLower === "unknown" ||
    titleLower === "unknown track" ||
    titleLower === "untitled" ||
    titleLower === "undefined" ||
    titleLower === "null"
  ) {
    return false;
  }

  // Validate Artist
  const artist = song.artist;
  if (!artist || typeof artist !== "string" || !artist.trim()) {
    return false;
  }
  const artistLower = artist.trim().toLowerCase();
  if (
    artistLower === "unknown artist" ||
    artistLower === "unknown" ||
    artistLower === "undefined" ||
    artistLower === "null" ||
    artistLower === "various artists"
  ) {
    return false;
  }

  return true;
};
