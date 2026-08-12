import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Camera, Loader2, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { useQueryClient } from "@tanstack/react-query";

type ProfileForm = { fullName: string; username: string; bio: string; imageUrl: string; email: string };

const emptyForm: ProfileForm = { fullName: "", username: "", bio: "", imageUrl: "", email: "" };

export function EditProfileDialog() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState<ProfileForm>(emptyForm);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    let isCurrent = true;
    const fallback: ProfileForm = {
      fullName: user.fullName || "",
      username: user.username || "",
      bio: "",
      imageUrl: user.imageUrl || "",
      email: user.primaryEmailAddress?.emailAddress || "",
    };
    setFormData(fallback);
    setIsFetching(true);
    axiosInstance.get(`/users/profile/${user.id}`)
      .then(({ data }) => isCurrent && setFormData({
        fullName: data.fullName || fallback.fullName,
        username: data.username || fallback.username,
        bio: data.bio || "",
        imageUrl: data.imageUrl || fallback.imageUrl,
        email: data.email || fallback.email,
      }))
      .catch(() => isCurrent && toast.error("Could not load the latest profile details."))
      .finally(() => isCurrent && setIsFetching(false));
    return () => { isCurrent = false; };
  }, [isOpen, user]);

  const initials = useMemo(() => formData.fullName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U", [formData.fullName]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Profile photos must be 5 MB or smaller."); return; }
    setIsUploadingPhoto(true);
    try {
      const upload = new FormData();
      upload.append("photo", file);
      const { data } = await axiosInstance.post<{ imageUrl: string }>("/users/profile/photo", upload, { headers: { "Content-Type": "multipart/form-data" } });
      setFormData((current) => ({ ...current, imageUrl: data.imageUrl }));
      await queryClient.invalidateQueries({ queryKey: ["myProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
      await queryClient.invalidateQueries({ queryKey: ["userFriends"] });
      toast.success("Profile photo uploaded");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not upload your photo.");
    } finally {
      setIsUploadingPhoto(false);
      event.target.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return toast.error("Please sign in again to update your profile.");
    if (!formData.fullName.trim()) return toast.error("Add your display name before saving.");
    if (formData.username && !/^[a-zA-Z0-9_]{3,30}$/.test(formData.username)) return toast.error("Username must be 3–30 letters, numbers, or underscores.");

    setIsLoading(true);
    try {
      await axiosInstance.put(`/users/profile/${user.id}`, {
        ...formData,
        fullName: formData.fullName.trim(),
        username: formData.username.trim(),
        bio: formData.bio.trim(),
        imageUrl: formData.imageUrl.trim(),
      });
      await user.update({
        firstName: formData.fullName.trim().split(" ")[0],
        lastName: formData.fullName.trim().split(" ").slice(1).join(" "),
        username: formData.username.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["myProfile", user.id] });
      await queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      await queryClient.invalidateQueries({ queryKey: ["friends"] });
      await queryClient.invalidateQueries({ queryKey: ["userFriends"] });
      toast.success("Profile updated");
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "We couldn’t save your profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogTrigger asChild><Button variant="outline" size="sm">Edit profile</Button></DialogTrigger>
    <DialogContent className="max-h-[min(720px,calc(100dvh-2rem))] overflow-y-auto p-0 sm:max-w-xl">
      <DialogHeader className="border-b bg-gradient-to-br from-primary/15 via-background to-background px-6 py-6 text-left">
        <DialogTitle>Shape your profile</DialogTitle>
        <DialogDescription>These details help friends recognize you across BeatBond.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6 px-6 pb-6">
        <div className="flex items-center gap-4 rounded-xl bg-secondary/40 p-4">
          <Avatar className="h-16 w-16 border-2 border-background shadow-sm"><AvatarImage src={formData.imageUrl} alt="Profile preview" /><AvatarFallback className="bg-primary/15 text-lg text-primary">{initials}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-medium"><Camera className="h-4 w-4 text-primary" /> Profile photo</div><p className="mt-1 text-xs text-muted-foreground">Choose a photo from your device or gallery. JPG, PNG, or WebP up to 5 MB.</p></div>
          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoSelect} disabled={isLoading || isUploadingPhoto} />
          <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={isLoading || isUploadingPhoto}>{isUploadingPhoto ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{isUploadingPhoto ? "Uploading" : "Upload"}</Button>
        </div>
        {isFetching ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…</div> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="fullName">Display name</Label><Input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} disabled={isLoading} maxLength={80} required /></div>
            <div className="space-y-2"><Label htmlFor="username">Username <span className="text-muted-foreground">(optional)</span></Label><Input id="username" name="username" value={formData.username} onChange={handleChange} disabled={isLoading} maxLength={30} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} disabled={isLoading} /></div>
          <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="bio">About you</Label><span className="text-xs text-muted-foreground">{formData.bio.length}/280</span></div><Textarea id="bio" name="bio" value={formData.bio} onChange={handleChange} disabled={isLoading} maxLength={280} placeholder="Tell listeners a little about yourself" className="min-h-28 resize-none" /></div>
        </>}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isLoading}>Cancel</Button><Button type="submit" disabled={isLoading || isFetching}>{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</> : <><Save className="mr-2 h-4 w-4" /> Save changes</>}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
