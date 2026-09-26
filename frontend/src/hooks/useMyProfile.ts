import { useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";

export type MusicPrivacy = "everyone" | "friends" | "none";

/** Where your profile picture comes from. */
export type PhotoSource = "provider" | "upload" | "avatar" | "none";

export type PhotoChoice = {
  source: PhotoSource;
  /** Your Google (sign-in) photo. */
  providerUrl: string;
  /** A photo you uploaded. */
  uploadedUrl: string;
  /** The picture of your avatar. */
  avatarUrl: string;
};

export type ChatSettings = {
  /** Off: friends don't see when you've read their messages, and you don't see theirs. */
  readReceipts: boolean;
  /** Off: friends don't see you online or your last seen, and you don't see theirs. */
  showActivityStatus: boolean;
  messageNotifications: boolean;
};

export type MyProfile = {
  fullName: string;
  username: string;
  /** The picture everyone sees: your chosen photo, or empty for none. */
  imageUrl: string;
  bio?: string;
  location?: string;
  website?: string;
  joinedDate?: string;
  /** Who sees the song you are playing right now. */
  musicPrivacy?: MusicPrivacy;
  /** Who sees your top artists and recently played songs. */
  historyPrivacy?: MusicPrivacy;
  photo?: PhotoChoice;
  chatSettings?: ChatSettings;
};

export const myProfileQueryKey = (userId: string | undefined) => ["myProfile", userId];

/** The database profile is the source of truth for user-uploaded photos. */
export const useMyProfile = () => {
  const { user } = useUser();
  return useQuery<MyProfile>({
    queryKey: myProfileQueryKey(user?.id),
    queryFn: async () => (await axiosInstance.get(`/users/profile/${user!.id}`)).data,
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
};

/**
 * Your picture as everyone sees it. "No photo" is an empty string, so screens
 * show your initial rather than falling back to the Google photo.
 */
export const useMyPicture = () => {
  const { user } = useUser();
  const { data: profile } = useMyProfile();
  // Until the profile loads, the sign-in photo stands in.
  return profile ? profile.imageUrl : user?.imageUrl ?? "";
};
