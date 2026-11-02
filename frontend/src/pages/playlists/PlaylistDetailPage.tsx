import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ListMusic, Loader2, Pause, Play, Trash2, UserPlus, X } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DownloadsCover } from "@/components/DownloadsCover";
import { SongListRow } from "@/components/SongListRow";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { removeAllDownloads, removeDownloadedSong } from "@/lib/offlineDownloads";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import type { Song } from "@/types";
import { PageBackButton } from "@/components/PageBackButton";
import { useAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";
import { Label } from "@/components/ui/label";

const PlaylistDetailPage = ({ downloadsOnly = false }: { downloadsOnly?: boolean }) => {
  const { userId } = useAuth();
  const { playlistId } = useParams();
  const playlists = usePlaylistStore((state) => state.playlists);
  const playlist = playlists.find((item) => item.id === playlistId);
  const fetchPlaylistById = usePlaylistStore((state) => state.fetchPlaylistById);
  const removeSong = usePlaylistStore((state) => state.removeSongFromPlaylist);
  const reorderSongs = usePlaylistStore((state) => state.reorderPlaylistSongs);
  const addCollaborator = usePlaylistStore((state) => state.addCollaborator);
  const removeCollaborator = usePlaylistStore((state) => state.removeCollaborator);
  const [collaboratorId, setCollaboratorId] = useState("");
  const { data: friends = [] } = useQuery<{ clerkId: string; fullName: string }[]>({
    queryKey: ["friends"], queryFn: async () => (await axiosInstance.get("/friends")).data,
    enabled: Boolean(playlist && userId === playlist.ownerId), staleTime: 30_000,
  });
  const downloads = useOfflineDownloads();
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingAll, setIsRemovingAll] = useState(false);

  const isOwner = Boolean(playlist && userId === playlist.ownerId);
  const canCollaborate = Boolean(isOwner || playlist?.collaborators?.some((item) => item.userId === userId));

  useEffect(() => {
    if (!downloadsOnly && playlistId && !playlist) {
      setIsLoading(true);
      void fetchPlaylistById(playlistId).finally(() => setIsLoading(false));
    }
  }, [playlistId, playlist, downloadsOnly, fetchPlaylistById]);

  const songs: Song[] = downloadsOnly ? downloads : (playlist?.songs || []);
  const downloadedIds = useMemo(() => new Set(downloads.map((song) => song._id)), [downloads]);
  const title = downloadsOnly ? "Downloads" : playlist?.name || "Playlist";
  const description = downloadsOnly ? "Plays without internet" : playlist?.description || "Your saved music";
  const active = songs.some((song) => song._id === currentSong?._id);

  const play = (index = 0) => {
    if (!songs[index]) return;
    if (songs[index]._id === currentSong?._id) togglePlay();
    else playAlbum(songs, index);
  };

  const removeAll = async () => {
    setIsRemovingAll(true);
    try {
      await removeAllDownloads();
      toast.success("All downloads removed");
    } catch {
      toast.error("Couldn't remove every download. Please try again.");
    } finally {
      setIsRemovingAll(false);
    }
  };

  if (isLoading && !songs.length) {
    return (
      <main className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span>Loading playlist...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 sm:pt-8 md:pb-8">
      <div className="mx-auto max-w-3xl">
        <PageBackButton />
        <header className="rounded-3xl border bg-card/80 p-5 shadow-sm sm:p-7">
          <div className="flex items-end gap-4">
            {downloadsOnly ? (
              <DownloadsCover songs={songs} className="size-24 shrink-0 sm:size-32" />
            ) : (
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/70 via-primary/25 to-secondary shadow-lg sm:size-32">
                {songs[0]?.imageUrl ? <img src={songs[0].imageUrl} alt="" className="size-full object-cover" /> : <ListMusic className="size-10 text-primary-foreground" />}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{downloadsOnly ? "Offline library" : "Playlist"}</p>
              <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{songs.length} {songs.length === 1 ? "song" : "songs"} · {description}</p>
            </div>
          </div>
          {!downloadsOnly && playlist && (
            <section className="mt-4 rounded-2xl border border-border bg-card/70 p-4" aria-label="Playlist collaborators">
              <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Collaborators</h2><p className="text-xs text-muted-foreground">Friends can add, remove and reorder songs.</p></div><span className="text-xs text-muted-foreground">{playlist.collaborators?.length ?? 0}/20</span></div>
              {isOwner && <div className="flex flex-wrap items-end gap-2"><div className="min-w-[190px] flex-1 space-y-1.5"><Label htmlFor="playlist-collaborator" className="text-xs">Invite a friend</Label><select id="playlist-collaborator" value={collaboratorId} onChange={(event) => setCollaboratorId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Choose a friend</option>{friends.filter((friend) => !playlist.collaborators?.some((member) => member.userId === friend.clerkId)).map((friend) => <option key={friend.clerkId} value={friend.clerkId}>{friend.fullName}</option>)}</select></div><Button type="button" variant="outline" disabled={!collaboratorId} onClick={() => { void addCollaborator(playlist.id, collaboratorId); setCollaboratorId(""); }}><UserPlus className="mr-2 size-4" /> Invite</Button></div>}
              {Boolean(playlist.collaborators?.length) && <ul className="mt-3 flex flex-wrap gap-2">{playlist.collaborators?.map((member) => { const friend = friends.find((item) => item.clerkId === member.userId); return <li key={member.userId} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs">{friend?.fullName || "Collaborator"}{isOwner && <button type="button" onClick={() => void removeCollaborator(playlist.id, member.userId)} aria-label={`Remove ${friend?.fullName || "collaborator"}`} className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button>}</li>; })}</ul>}
            </section>
          )}
          {songs.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button onClick={() => (active ? togglePlay() : play())} className="rounded-full px-6">
                {active && isPlaying ? <Pause className="mr-2 size-4 fill-current" /> : <Play className="mr-2 size-4 fill-current" />}
                {active && isPlaying ? "Pause" : active ? "Resume" : "Play all"}
              </Button>
              {downloadsOnly && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="rounded-full" disabled={isRemovingAll}>
                      {isRemovingAll ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                      Remove all
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove all downloads?</AlertDialogTitle>
                      <AlertDialogDescription>All {songs.length} songs will be deleted from this device and will need internet to play again. They stay in your playlists and liked songs.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void removeAll()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove all</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}
        </header>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold">Songs</h2>
          {songs.length ? (
            <div className="overflow-hidden rounded-2xl border bg-card">
              {songs.map((song, index) => (
                <div key={`${song._id}-${index}`} className="flex items-center">
                  <div className="min-w-0 flex-1"><SongListRow song={song} index={index} onPlay={() => play(index)} downloaded={!downloadsOnly && downloadedIds.has(song._id)} removeLabel={downloadsOnly ? `Remove ${song.title} from downloads` : `Remove ${song.title} from this playlist`} onRemove={() => (downloadsOnly ? void removeDownloadedSong(song) : playlist && void removeSong(playlist.id, song._id))} /></div>
                  {!downloadsOnly && canCollaborate && playlist && <div className="mr-2 flex shrink-0 flex-col"><button type="button" aria-label={`Move ${song.title} up`} disabled={index === 0} onClick={() => { const ids = songs.map((item) => item._id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; void reorderSongs(playlist.id, ids); }} className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"><ArrowUp className="size-4" /></button><button type="button" aria-label={`Move ${song.title} down`} disabled={index === songs.length - 1} onClick={() => { const ids = songs.map((item) => item._id); [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; void reorderSongs(playlist.id, ids); }} className="grid size-8 place-items-center rounded text-muted-foreground hover:bg-secondary disabled:opacity-30"><ArrowDown className="size-4" /></button></div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {downloadsOnly ? "Download songs from their ⋯ menu and they'll appear here, ready to play without internet." : "This playlist has no songs yet."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default PlaylistDetailPage;
