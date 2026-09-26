import { useRef } from "react";
import { useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, ImageOff, Loader2, Sparkles, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { avatarUrl, type AvatarConfig } from "@/lib/avatar";
import { axiosInstance } from "@/lib/axios";
import { cn } from "@/lib/utils";
import { useMyProfile, type PhotoSource } from "@/hooks/useMyProfile";
import { usePhotoActions } from "./usePhotoActions";

const SOURCE_LABEL: Record<PhotoSource, string> = {
  provider: "Showing your Google photo",
  upload: "Showing your photo",
  avatar: "Showing your avatar",
  none: "No profile photo",
};

type Option = { source: PhotoSource; label: string; image: string; onSelect?: () => void; to?: string };

/** Choose what everyone sees as your profile photo. */
const ProfilePhotoPicker = () => {
  const { user } = useUser();
  const { data: profile } = useMyProfile();
  const { data: avatar } = useQuery<AvatarConfig | null>({
    queryKey: ["myAvatar"],
    queryFn: async () => (await axiosInstance.get("/avatars/me")).data,
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
  const { busy, uploadPhoto, setAvatarAsPhoto, chooseSource } = usePhotoActions();
  const fileRef = useRef<HTMLInputElement>(null);

  const photo = profile?.photo;
  const source = photo?.source ?? "provider";
  const name = profile?.fullName || user?.fullName || "";
  const initials = name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
  const hasAvatar = Boolean(avatar && Object.keys(avatar.options ?? {}).length);

  const options: Option[] = [
    ...(photo?.providerUrl ? [{ source: "provider" as const, label: "Google", image: photo.providerUrl, onSelect: () => void chooseSource("provider") }] : []),
    ...(photo?.uploadedUrl ? [{ source: "upload" as const, label: "Your photo", image: photo.uploadedUrl, onSelect: () => void chooseSource("upload") }] : []),
    hasAvatar
      ? { source: "avatar", label: "Avatar", image: avatarUrl(avatar, user?.id), onSelect: () => void setAvatarAsPhoto(avatar!) }
      : { source: "avatar", label: "Create avatar", image: "", to: "/avatar" },
    { source: "none", label: "No photo", image: "", onSelect: () => void chooseSource("none") },
  ];

  return (
    <div className="rounded-xl bg-secondary/40 p-4">
      <div className="flex items-center gap-4">
        <Avatar className="size-16 border-2 border-background shadow-sm">
          <AvatarImage src={profile?.imageUrl ?? user?.imageUrl} alt="Your profile photo" />
          <AvatarFallback className="bg-primary/15 text-lg text-primary">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground">{SOURCE_LABEL[source]}</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadPhoto(file);
            event.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Upload
        </Button>
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto pb-1" role="radiogroup" aria-label="Profile photo">
        {options.map((option) => {
          const selected = source === option.source && !option.to;
          const face = (
            <>
              <span className={cn(
                "relative grid size-14 place-items-center overflow-hidden rounded-full border-2 bg-background transition-colors",
                selected ? "border-primary" : option.to ? "border-dashed border-muted-foreground/40" : "border-transparent",
              )}>
                {option.image ? (
                  <img src={option.image} alt="" className="size-full object-cover" />
                ) : option.to ? (
                  <Sparkles className="size-5 text-violet-400" />
                ) : (
                  <ImageOff className="size-5 text-muted-foreground" />
                )}
                {busy === option.source && <span className="absolute inset-0 grid place-items-center bg-black/50"><Loader2 className="size-5 animate-spin text-white" /></span>}
                {selected && busy !== option.source && <span className="absolute bottom-0 right-0 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
              </span>
              <span className={cn("text-xs", selected ? "font-semibold text-foreground" : "text-muted-foreground")}>{option.label}</span>
            </>
          );
          return option.to ? (
            <Link key={option.source} to={option.to} className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">{face}</Link>
          ) : (
            <button
              key={option.source}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy !== null}
              onClick={() => !selected && option.onSelect?.()}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center disabled:opacity-70"
            >
              {face}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProfilePhotoPicker;
