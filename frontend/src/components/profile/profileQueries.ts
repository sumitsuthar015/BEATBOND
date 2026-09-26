import { useQuery } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";

export type PersonSummary = { clerkId: string; fullName: string; username?: string; imageUrl?: string };

export const blockedUsersQueryKey = ["blockedUsers"];
export const hiddenListenersQueryKey = ["hiddenListeners"];
export const profileMusicQueryKey = (userId: string) => ["profileMusic", userId];

export const useBlockedUsers = (enabled = true) =>
  useQuery<PersonSummary[]>({
    queryKey: blockedUsersQueryKey,
    queryFn: async () => (await axiosInstance.get("/users/blocked")).data,
    enabled,
    staleTime: 30_000,
  });

/** People who never see your listening, whatever your privacy settings say. */
export const useHiddenListeners = (enabled = true) =>
  useQuery<PersonSummary[]>({
    queryKey: hiddenListenersQueryKey,
    queryFn: async () => (await axiosInstance.get("/users/music-hidden")).data,
    enabled,
    staleTime: 30_000,
  });
