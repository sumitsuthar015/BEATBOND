import { useEffect, useMemo, useState } from "react";
import { ListMusic, Loader2, Pause, Play, Trash2 } from "lucide-react";
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

const PlaylistDetailPage = ({ downloadsOnly = false }: { downloadsOnly?: boolean }) => {
  const { playlistId } = useParams();
  const playlists = usePlaylistStore((state) => state.playlists);
  const fetchPlaylistById = usePlaylistStore((state) => state.fetchPlaylistById);
  const removeSong = usePlaylistStore((state) => state.removeSongFromPlaylist);
  const downloads = useOfflineDownloads();
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const [isLoading, setIsLoading] = useState(false);
  const [isRemovingAll, setIsRemovingAll] = useState(false);

  const playlist = playlists.find((item) => item.id === playlistId);

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
                <SongListRow
                  key={`${song._id}-${index}`}
                  song={song}
                  index={index}
                  onPlay={() => play(index)}
                  downloaded={!downloadsOnly && downloadedIds.has(song._id)}
                  removeLabel={downloadsOnly ? `Remove ${song.title} from downloads` : `Remove ${song.title} from this playlist`}
                  onRemove={() => (downloadsOnly ? void removeDownloadedSong(song) : playlist && void removeSong(playlist.id, song._id))}
                />
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
