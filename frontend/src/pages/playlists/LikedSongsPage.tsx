import { Heart, Pause, Play } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlayerStore } from "@/stores/usePlayerStore";

const LikedSongsPage = () => {
  const likedSongs = useMusicStore((state) => state.likedSongs);
  const fetchLikedSongs = useMusicStore((state) => state.fetchLikedSongs);
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const isActive = likedSongs.some((song) => song._id === currentSong?._id);

  useEffect(() => { void fetchLikedSongs(); }, [fetchLikedSongs]);

  const play = (index = 0) => {
    if (!likedSongs[index]) return;
    if (likedSongs[index]._id === currentSong?._id) togglePlay();
    else playAlbum(likedSongs, index);
  };

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 sm:pt-8 md:pb-8">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-3xl border bg-card/80 p-5 shadow-sm sm:p-7">
          <div className="flex items-end gap-4">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 via-primary to-secondary shadow-lg sm:size-32">
              <Heart className="size-10 fill-current text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your playlist</p>
              <h1 className="mt-1 truncate text-2xl font-bold sm:text-3xl">Liked Songs</h1>
              <p className="mt-1 text-sm text-muted-foreground">{likedSongs.length} {likedSongs.length === 1 ? "song" : "songs"} you have liked</p>
            </div>
          </div>
          {likedSongs.length > 0 && <Button onClick={() => isActive ? togglePlay() : play()} className="mt-5 rounded-full px-6">{isActive && isPlaying ? <Pause className="mr-2 size-4 fill-current" /> : <Play className="mr-2 size-4 fill-current" />}{isActive && isPlaying ? "Pause" : "Play all"}</Button>}
        </header>

        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold">Songs</h2>
          {likedSongs.length ? <div className="overflow-hidden rounded-2xl border bg-card">{likedSongs.map((song, index) => <div key={`${song._id}-${index}`} className="flex min-h-[68px] items-center gap-3 border-b px-3 last:border-0"><span className="w-4 text-center text-xs text-muted-foreground">{index + 1}</span><button onClick={() => play(index)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><img src={song.imageUrl} alt="" className="size-10 rounded-lg object-cover" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{song.title}</span><span className="block truncate text-xs text-muted-foreground">{song.artist}</span></span></button><button onClick={() => play(index)} aria-label={`Play ${song.title}`} className="grid size-9 place-items-center rounded-full text-primary hover:bg-secondary"><Play className="size-4 fill-current" /></button></div>)}</div> : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Like songs to build this playlist.</div>}
        </section>
      </div>
    </main>
  );
};

export default LikedSongsPage;
