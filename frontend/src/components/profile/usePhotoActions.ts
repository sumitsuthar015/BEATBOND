import { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import type { AvatarConfig } from "@/lib/avatar";
import { avatarToPng } from "@/lib/avatarImage";
import { axiosInstance } from "@/lib/axios";
import { myProfileQueryKey, type MyProfile, type PhotoChoice, type PhotoSource } from "@/hooks/useMyProfile";

type PhotoResult = { imageUrl: string; photo: PhotoChoice };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const upload = async (endpoint: string, file: Blob, name: string) => {
  const form = new FormData();
  form.append("photo", file, name);
  return (await axiosInstance.post<PhotoResult>(endpoint, form, { headers: { "Content-Type": "multipart/form-data" } })).data;
};

/** Changing your profile photo: upload one, use your avatar, or pick a kept one. */
export const usePhotoActions = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<PhotoSource | null>(null);

  const run = async (source: PhotoSource, task: () => Promise<PhotoResult>, success: string | null) => {
    setBusy(source);
    try {
      const result = await task();
      queryClient.setQueryData<MyProfile>(myProfileQueryKey(user?.id), (current) => current && { ...current, imageUrl: result.imageUrl, photo: result.photo });
      // Your picture also appears on profile pages, friends lists and chats.
      await Promise.all([["userProfile"], ["friends"], ["userFriends"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (success) toast.success(success);
      return true;
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || "Could not update your profile photo. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const uploadPhoto = (file: File) => {
    if (!file.type.startsWith("image/")) return void toast.error("Please choose an image file.");
    if (file.size > MAX_PHOTO_BYTES) return void toast.error("Profile photos must be 5 MB or smaller.");
    return run("upload", () => upload("/users/profile/photo", file, file.name), "Profile photo updated");
  };

  const setAvatarAsPhoto = (config: AvatarConfig, success: string | null = "Your avatar is now your profile photo") =>
    run("avatar", async () => upload("/users/profile/avatar-photo", await avatarToPng(config, user!.id), "avatar.png"), success);

  const chooseSource = (source: PhotoSource) =>
    run(source, async () => (await axiosInstance.patch<PhotoResult>("/users/profile/photo-source", { source })).data, source === "none" ? "Profile photo removed" : "Profile photo updated");

  return { busy, uploadPhoto, setAvatarAsPhoto, chooseSource };
};
