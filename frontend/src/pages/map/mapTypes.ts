import type { AvatarConfig } from "@/lib/avatar";

export type LiveLocation = {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt?: string;
  isLive: boolean;
  isFriend: boolean;
  isOnline?: boolean;
  avatar?: AvatarConfig | null;
  user?: { fullName?: string; username?: string; imageUrl?: string; currentActivity?: string | null };
};

export type PlaceResult = {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
  bounds: [[number, number], [number, number]] | null;
  kind: string;
};

export type PeopleFilter = "all" | "friends" | "live";

// Matches the server: a sharing app checks in every minute, so three minutes
// of silence means it was closed. Re-checked locally as time passes.
const LIVE_WINDOW_MS = 3 * 60 * 1000;

export const isLiveNow = (person: LiveLocation, now: number) =>
  person.isLive && (!person.updatedAt || now - new Date(person.updatedAt).getTime() <= LIVE_WINDOW_MS);

export const displayName = (person: LiveLocation) => person.user?.fullName?.trim() || person.user?.username || "BeatBond listener";

// The picture each person chose for their profile (photo or avatar); none
// shows their initial instead.
export const personImage = (person: LiveLocation) => person.user?.imageUrl?.trim() || undefined;

/** "Playing Song by Artist" → "Song by Artist". */
export const nowPlaying = (activity: string | null | undefined) => activity?.replace(/^playing\s+/i, "").trim() || null;
