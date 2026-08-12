import { useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";

export type MyProfile = { fullName: string; username: string; imageUrl: string; bio?: string };

/** The database profile is the source of truth for user-uploaded photos. */
export const useMyProfile = () => {
  const { user } = useUser();
  return useQuery<MyProfile>({
    queryKey: ["myProfile", user?.id],
    queryFn: async () => (await axiosInstance.get(`/users/profile/${user!.id}`)).data,
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
};
