import { useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/clerk-react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { useQueryClient } from "@tanstack/react-query";
import ProfilePhotoPicker from "./ProfilePhotoPicker";

type ProfileForm = { fullName: string; username: string; bio: string; location: string; website: string };

const emptyForm: ProfileForm = { fullName: "", username: "", bio: "", location: "", website: "" };
const BIO_LIMIT = 280;

export function EditProfileDialog({ trigger }: { trigger?: ReactNode }) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [formData, setFormData] = useState<ProfileForm>(emptyForm);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  useEffect(() => {
    if (!isOpen || !user) return;
    let isCurrent = true;
    const fallback: ProfileForm = { ...emptyForm, fullName: user.fullName || "", username: user.username || "" };
    setFormData(fallback);
    setIsFetching(true);
    axiosInstance.get(`/users/profile/${user.id}`)
      .then(({ data }) => isCurrent && setFormData({
        fullName: data.fullName || fallback.fullName,
        username: data.username || fallback.username,
        bio: data.bio || "",
        location: data.location || "",
        website: data.website || "",
      }))
      .catch(() => isCurrent && toast.error("Could not load the latest profile details."))
      .finally(() => isCurrent && setIsFetching(false));
    return () => { isCurrent = false; };
  }, [isOpen, user]);

  const refreshProfiles = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["myProfile"] }),
      queryClient.invalidateQueries({ queryKey: ["userProfile"] }),
      queryClient.invalidateQueries({ queryKey: ["friends"] }),
      queryClient.invalidateQueries({ queryKey: ["userFriends"] }),
    ]);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return toast.error("Please sign in again to update your profile.");
    const fullName = formData.fullName.trim();
    const username = formData.username.trim();
    if (!fullName) return toast.error("Add your display name before saving.");
    if (username && !/^[a-zA-Z0-9_]{3,30}$/.test(username)) return toast.error("Username must be 3–30 letters, numbers, or underscores.");

    setIsLoading(true);
    try {
      await axiosInstance.put(`/users/profile/${user.id}`, {
        fullName,
        username,
        bio: formData.bio.trim(),
        location: formData.location.trim(),
        website: formData.website.trim(),
      });
      // Keep the sign-in account's name in step. BeatBond's own profile is
      // already saved, so a refusal here (e.g. usernames turned off in the
      // sign-in settings) must not report the whole save as failed.
      await user.update({
        firstName: fullName.split(" ")[0],
        lastName: fullName.split(" ").slice(1).join(" "),
        ...(username ? { username } : {}),
      }).catch(() => undefined);
      await refreshProfiles();
      toast.success("Profile updated");
      setIsOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "We couldn’t save your profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogTrigger asChild>{trigger ?? <Button variant="outline" size="sm">Edit profile</Button>}</DialogTrigger>
    <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] overflow-y-auto p-0 sm:max-w-xl">
      <DialogHeader className="border-b bg-gradient-to-br from-primary/15 via-background to-background px-6 py-6 text-left">
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>These details help friends recognise you across BeatBond.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6 px-6 pb-6">
        <ProfilePhotoPicker />
        {isFetching ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…</div> : <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="fullName">Display name</Label><Input id="fullName" name="fullName" value={formData.fullName} onChange={handleChange} disabled={isLoading} maxLength={80} required /></div>
            <div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" name="username" value={formData.username} onChange={handleChange} disabled={isLoading} maxLength={30} autoCapitalize="none" autoCorrect="off" /></div>
          </div>
          <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="bio">Bio</Label><span className="text-xs text-muted-foreground">{formData.bio.length}/{BIO_LIMIT}</span></div><Textarea id="bio" name="bio" value={formData.bio} onChange={handleChange} disabled={isLoading} maxLength={BIO_LIMIT} placeholder="Tell listeners a little about yourself" className="min-h-24 resize-none" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="location">Location</Label><Input id="location" name="location" value={formData.location} onChange={handleChange} disabled={isLoading} maxLength={60} placeholder="City, country" /></div>
            <div className="space-y-2"><Label htmlFor="website">Website</Label><Input id="website" name="website" value={formData.website} onChange={handleChange} disabled={isLoading} maxLength={200} placeholder="mysite.com" inputMode="url" autoCapitalize="none" /></div>
          </div>
          {email && <p className="text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{email}</span>. Change your email in Settings → Sign-in & security.</p>}
        </>}
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isLoading}>Cancel</Button><Button type="submit" disabled={isLoading || isFetching}>{isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving</> : <><Save className="mr-2 h-4 w-4" /> Save changes</>}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
