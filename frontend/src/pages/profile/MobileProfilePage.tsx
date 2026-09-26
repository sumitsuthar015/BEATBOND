import { useEffect } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Heart, History, Library, ListMusic, LogOut, Play, Plus, Settings, Share2, Users } from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import ProfileDetails from "@/components/profile/ProfileDetails";
import ProfileMusic from "@/components/profile/ProfileMusic";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";
import type { Song } from "@/types";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useChatStore } from "@/stores/useChatStore";

type Profile = { fullName: string; username: string; imageUrl: string; bio: string; friendsCount: number; currentActivity?: string | null; location?: string; website?: string; joinedDate?: string };
type Connection = { clerkId: string };
const stat = (value: number, label: string, to: string) => <Link to={to} className="rounded-2xl bg-secondary/70 px-3 py-3 text-center transition-colors hover:bg-secondary"><p className="text-lg font-bold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></Link>;

const MobileProfilePage = () => {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { playlists, fetchPlaylists, createPlaylist } = usePlaylistStore();
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentActivity = useChatStore((state) => state.currentActivity);
  const { data: profile, isLoading } = useQuery<Profile>({ queryKey: ["myProfile", user?.id], queryFn: async () => (await axiosInstance.get(`/users/profile/${user!.id}`)).data, enabled: Boolean(user?.id), staleTime: 60_000 });
  const { data: history = [] } = useQuery<Song[]>({ queryKey: ["myListeningHistory"], queryFn: async () => (await axiosInstance.get("/users/listening-history?limit=6")).data, enabled: Boolean(user?.id), staleTime: 30_000 });
  const { data: likedSongs = [] } = useQuery<Song[]>({ queryKey: ["myLikedSongs"], queryFn: async () => (await axiosInstance.get("/songs/liked")).data, enabled: Boolean(user?.id), staleTime: 30_000 });
  const { data: connections = [] } = useQuery<Connection[]>({ queryKey: ["friends"], queryFn: async () => (await axiosInstance.get("/friends")).data, enabled: Boolean(user?.id), staleTime: 30_000 });
  useEffect(() => { if (user?.id) void fetchPlaylists(); }, [user?.id, fetchPlaylists]);
  // The picture they chose (photo, avatar or none) is already in imageUrl.
  const profileImage = profile ? profile.imageUrl : user?.imageUrl;
  const shareMessage = `Shared ${profile?.fullName || user?.fullName || "my"} profile`;
  const shareContent = { type: "profile" as const, title: profile?.fullName || user?.fullName || "My BeatBond profile", subtitle: profile?.bio || "BeatBond profile", imageUrl: profileImage || user?.imageUrl, href: `/profile/${user?.id}` };
  const addPlaylist = () => { const name = window.prompt("Name your playlist"); if (name?.trim()) void createPlaylist(name.trim()); };
  const sections = [{ icon: ListMusic, label: "My playlists", detail: `${playlists.length} playlists`, to: "/playlists" }, { icon: Heart, label: "Liked songs", detail: `${likedSongs.length} saved songs`, to: "/liked-songs" }, { icon: History, label: "Listening history", detail: `${history.length} recent tracks`, to: "/dashboard" }];
  const connectionCount = connections.length;
  const profileTrack = history[0];
  const liveTrack = isPlaying && currentSong ? currentSong : null;

  if (!user) return <main className="grid h-full place-items-center p-6 text-center"><div><h1 className="text-xl font-bold">Sign in to see your profile</h1><p className="mt-2 text-sm text-muted-foreground">Your playlists and listening activity live here.</p></div></main>;
  return <main className="h-full overflow-y-auto bg-gradient-to-b from-emerald-500/20 via-background to-background px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pb-8"><div className="mx-auto max-w-xl">
    <div className="mb-5 flex items-center justify-between"><p className="text-sm font-semibold">Profile</p><div className="flex gap-1"><ShareToMessageDialog message={shareMessage} sharedContent={shareContent} trigger={<Button variant="ghost" size="icon" aria-label="Share profile"><Share2 className="size-5" /></Button>} /><Link to="/settings"><Button variant="ghost" size="icon" aria-label="Profile settings"><Settings className="size-5" /></Button></Link><Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" className="text-destructive hover:text-destructive" onClick={() => void signOut({ redirectUrl: "/" })}><LogOut className="size-5" /></Button></div></div>
    <section className="rounded-3xl border border-white/10 bg-card/80 p-5 shadow-xl backdrop-blur"><div className="flex items-start gap-4"><Avatar className="size-20 border-2 border-emerald-400/50"><AvatarImage src={profileImage} /><AvatarFallback>{(profile?.fullName || user.fullName || "U")[0]}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><h1 className="truncate text-xl font-bold">{isLoading ? "Loading…" : profile?.fullName || user.fullName}</h1><p className="truncate text-sm text-muted-foreground">@{profile?.username || user.username}</p>{profile?.bio && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{profile.bio}</p>}</div></div><div className="mt-3"><ProfileDetails location={profile?.location} website={profile?.website} joinedDate={profile?.joinedDate} /></div><div className="mt-5 grid grid-cols-3 gap-2">{stat(connectionCount, "Connections", `/profile/${user.id}/friends`)}{stat(playlists.length, "Playlists", "/playlists")}{stat(likedSongs.length, "Liked songs", "/liked-songs")}</div><div className="mt-4 grid grid-cols-2 gap-2"><EditProfileDialog /><ShareToMessageDialog message={shareMessage} sharedContent={shareContent} trigger={<Button className="w-full">Share profile</Button>} /></div></section>
    {(liveTrack || currentActivity || profileTrack) && <section className="mt-5 overflow-hidden rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-3"><p className="px-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">{liveTrack || currentActivity ? "Listening now" : "Recently played"}</p>{liveTrack || profileTrack ? <button type="button" onClick={() => playAlbum([liveTrack || profileTrack!])} className="mt-2 flex w-full items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-emerald-400/10"><img src={(liveTrack || profileTrack)!.imageUrl} alt="" className="size-12 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{(liveTrack || profileTrack)!.title}</span><span className="block truncate text-xs text-muted-foreground">{(liveTrack || profileTrack)!.artist}</span></span><span className="grid size-9 place-items-center rounded-full bg-emerald-400 text-black"><Play className="ml-0.5 size-4 fill-current" /></span></button> : <p className="mt-1 px-1 truncate text-sm font-semibold">{currentActivity}</p>}</section>}
    <section className="mt-7"><ProfileMusic userId={user.id} name={user.firstName ?? "You"} isOwnProfile showRecent={false} /></section>
    <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Your library</h2><Button variant="ghost" size="sm" onClick={addPlaylist}><Plus className="mr-1 size-4" />New</Button></div><div className="overflow-hidden rounded-2xl border bg-card">{sections.map(({ icon: Icon, label, detail, to }) => <Link key={label} to={to} className="flex min-h-16 items-center gap-3 border-b px-4 last:border-0 hover:bg-secondary/50"><span className="grid size-9 place-items-center rounded-xl bg-secondary"><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>)}</div></section>
    <section className="mt-7"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Recently played</h2><Link to="/dashboard" className="text-sm font-semibold text-primary">See all</Link></div>{history.length ? <div className="space-y-2">{history.slice(0, 4).map((song, index) => <div key={`${song._id}-${index}`} onClick={() => playAlbum([song])} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-card p-2 transition-colors hover:bg-secondary/50"><img src={song.imageUrl} alt="" className="size-11 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{song.title}</p><p className="truncate text-xs text-muted-foreground">{song.artist}</p></div><button onClick={(e) => { e.stopPropagation(); playAlbum([song]); }} aria-label={`Play ${song.title}`} className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><Play className="ml-0.5 size-4 fill-current" /></button></div>)}</div> : <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground"><Library className="mx-auto mb-2 size-6" />Your recently played songs will appear here.</div>}</section>
    <Link to="/settings" className="mt-7 flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-4 hover:bg-secondary/50"><span className="grid size-9 place-items-center rounded-xl bg-secondary"><Users className="size-4" /></span><span className="flex-1"><span className="block text-sm font-semibold">Settings & privacy</span><span className="block text-xs text-muted-foreground">Privacy, playback, theme and account</span></span><ChevronRight className="size-4 text-muted-foreground" /></Link>
  </div></main>;
};
export default MobileProfilePage;
