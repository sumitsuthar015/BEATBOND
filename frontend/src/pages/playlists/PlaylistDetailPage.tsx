import { useEffect, useState } from "react";
import { Download, ListMusic, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { removeDownloadedSong } from "@/lib/offlineDownloads";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import type { Song } from "@/types";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";

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

  const playlist = playlists.find((item) => item.id === playlistId);

  useEffect(() => {
    if (!downloadsOnly && playlistId && !playlist) {
      setIsLoading(true);
      void fetchPlaylistById(playlistId).finally(() => setIsLoading(false));
    }
  }, [playlistId, playlist, downloadsOnly, fetchPlaylistById]);

  const songs: Song[] = downloadsOnly ? downloads : (playlist?.songs || []);
  const title = downloadsOnly ? "Downloads" : playlist?.name || "Playlist";
  const description = downloadsOnly ? "Available offline" : playlist?.description || "Your saved music";
  const active = songs.some((song) => song._id === currentSong?._id);
  const play = (index = 0) => {
    if (!songs[index]) return;
    if (songs[index]._id === currentSong?._id) togglePlay();
    else playAlbum(songs, index);
  };

  if (isLoading && !songs.length) {
    return (
      <main className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-5 animate-spin text-primary" />
          <span>Loading playlist...</span>
        </div>
      </main>
    );
  }

  return <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 sm:pt-8 md:pb-8"><div className="mx-auto max-w-3xl">
    <header className="rounded-3xl border bg-card/80 p-5 shadow-sm sm:p-7"><div className="flex items-end gap-4"><div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary/70 via-primary/25 to-secondary shadow-lg sm:size-32">{songs[0]?.imageUrl ? <img src={songs[0].imageUrl} alt="" className="h-full w-full object-cover" /> : downloadsOnly ? <Download className="size-10 text-primary-foreground" /> : <ListMusic className="size-10 text-primary-foreground" />}</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-primary">{downloadsOnly ? "Offline library" : "Playlist"}</p><h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{songs.length} {songs.length === 1 ? "song" : "songs"} · {description}</p></div></div>{songs.length > 0 && <Button onClick={() => active ? togglePlay() : play()} className="mt-5 rounded-full px-6">{active && isPlaying ? <Pause className="mr-2 size-4 fill-current" /> : <Play className="mr-2 size-4 fill-current" />}{active && isPlaying ? "Pause" : "Play all"}</Button>}</header>
    <section className="mt-6"><h2 className="mb-3 text-lg font-bold">Songs</h2>{songs.length ? <div className="overflow-hidden rounded-2xl border bg-card">{songs.map((song, index) => <div key={`${song._id}-${index}`} className="flex min-h-[68px] items-center gap-3 border-b px-3 last:border-0"><span className="w-4 text-center text-xs text-muted-foreground">{index + 1}</span><button onClick={() => play(index)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><img src={song.imageUrl} alt="" className="size-10 rounded-lg object-cover" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{song.title}</span><span className="block truncate text-xs text-muted-foreground">{song.artist}</span></span></button><button onClick={() => play(index)} aria-label={`Play ${song.title}`} className="grid size-9 place-items-center rounded-full text-primary hover:bg-secondary"><Play className="size-4 fill-current" /></button><button onClick={() => downloadsOnly ? void removeDownloadedSong(song) : playlist && void removeSong(playlist.id, song._id)} aria-label={`Remove ${song.title}`} className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button><SongOptionsMenu song={song} /></div>)}</div> : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{downloadsOnly ? "Downloaded songs will appear here and play without internet." : "This playlist has no songs yet."}</div>}</section>
  </div></main>;
};

export default PlaylistDetailPage;
