import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";
import { AlbumOptionsMenu } from "@/components/AlbumOptionsMenu";

const collections = {
  "made-for-you": { title: "Made For You", subtitle: "A collection picked for your next listening session.", type: "songs" },
  trending: { title: "Trending", subtitle: "The tracks listeners are playing right now.", type: "songs" },
  "featured-albums": { title: "Featured Albums", subtitle: "Full albums worth spending time with.", type: "albums" },
} as const;

const HomeCollectionPage = () => {
  const { collectionId } = useParams();
  const collection = collections[collectionId as keyof typeof collections];
  const store = useMusicStore();
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const songs = collectionId === "trending" ? store.trendingSongs : store.madeForYouSongs;
  const albums = store.madeForYouAlbums;

  useEffect(() => {
    if (collectionId === "made-for-you" && !songs.length) void store.fetchMadeForYouSongs();
    if (collectionId === "trending" && !songs.length) void store.fetchTrendingSongs();
    if (collectionId === "featured-albums" && !albums.length) void store.fetchMadeForYouAlbums();
  }, [collectionId, songs.length, albums.length, store]);

  const artwork = useMemo(() => collection?.type === "albums" ? albums[0]?.image?.[2]?.url || albums[0]?.imageUrl : songs[0]?.imageUrl, [collection?.type, albums, songs]);
  if (!collection) return <main className="grid h-full place-items-center p-6 text-center"><div><Music2 className="mx-auto mb-3 size-9 text-muted-foreground" /><h1 className="text-xl font-bold">Collection not found</h1><Link to="/"><Button className="mt-4">Back home</Button></Link></div></main>;

  return <main className="h-full overflow-y-auto bg-gradient-to-b from-primary/20 via-background to-background px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pb-8"><div className="mx-auto max-w-5xl"><header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end"><div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-violet-800 shadow-2xl sm:size-52">{artwork ? <img src={artwork} alt="" className="size-full object-cover" /> : <Music2 className="size-14 text-white/80" />}</div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Home collection</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{collection.title}</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">{collection.subtitle}</p><p className="mt-4 text-sm font-medium">{collection.type === "songs" ? `${songs.length} songs` : `${albums.length} albums`}</p></div></header>{collection.type === "songs" ? <section className="overflow-hidden rounded-2xl border bg-card/60">{store.isLoading && !songs.length ? <p className="p-8 text-sm text-muted-foreground">Loading collection…</p> : songs.map((song, index) => <button key={`${song._id}-${index}`} type="button" onClick={() => playAlbum(songs, index)} className="flex w-full items-center gap-3 border-b p-3 text-left last:border-0 hover:bg-secondary/70"><span className="w-6 text-center text-sm text-muted-foreground">{index + 1}</span><img src={song.imageUrl} alt="" className="size-12 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{song.title}</span><span className="block truncate text-sm text-muted-foreground">{song.artist}</span></span><span className="hidden text-xs text-muted-foreground sm:block">{song.albumName || "Single"}</span><span onClick={(event) => event.stopPropagation()}><SongOptionsMenu song={song} buttonClassName="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary" /></span></button>)}</section> : <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{store.isLoading && !albums.length ? <p className="col-span-full py-8 text-sm text-muted-foreground">Loading collection…</p> : albums.map((album) => <Link key={album.id} to={`/album/${album.id}`} className="group rounded-2xl bg-card/70 p-3 transition-colors hover:bg-secondary"><div className="relative aspect-square overflow-hidden rounded-xl"><img src={album.image?.[2]?.url || album.imageUrl} alt={album.name} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" /><span onClick={(event) => event.preventDefault()} className="absolute right-2 top-2"><AlbumOptionsMenu album={album} buttonClassName="grid size-8 place-items-center rounded-full bg-black/70 text-white" /></span></div><p className="mt-3 truncate font-semibold">{album.name || album.title}</p><p className="truncate text-sm text-muted-foreground">{album.artist}</p></Link>)}</section>}</div></main>;
};
export default HomeCollectionPage;
