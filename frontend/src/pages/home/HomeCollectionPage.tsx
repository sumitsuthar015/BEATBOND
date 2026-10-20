import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";
import { AlbumOptionsMenu } from "@/components/AlbumOptionsMenu";
import { mapSaavnAlbum, mapSaavnSong, searchSaavnAlbums, searchSaavnSongs } from "@/lib/saavn";
import { axiosInstance } from "@/lib/axios";
import { Album, Song } from "@/types";
import { PageBackButton } from "@/components/PageBackButton";

const collections = {
  "made-for-you": { title: "Made For You", subtitle: "A collection picked for your next listening session.", type: "songs" },
  trending: { title: "Trending", subtitle: "The tracks listeners are playing right now.", type: "songs" },
  "featured-albums": { title: "Featured Albums", subtitle: "Full albums worth spending time with.", type: "albums" },
} as const;

const HomeCollectionPage = () => {
  const { collectionId } = useParams();
  const collection = collections[collectionId as keyof typeof collections];
  const madeForYouSongs = useMusicStore((state) => state.madeForYouSongs);
  const trendingSongs = useMusicStore((state) => state.trendingSongs);
  const madeForYouAlbums = useMusicStore((state) => state.madeForYouAlbums);
  const fetchMadeForYouSongs = useMusicStore((state) => state.fetchMadeForYouSongs);
  const fetchTrendingSongs = useMusicStore((state) => state.fetchTrendingSongs);
  const fetchMadeForYouAlbums = useMusicStore((state) => state.fetchMadeForYouAlbums);
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const previewSongs = collectionId === "trending" ? trendingSongs : madeForYouSongs;
  const previewAlbums = madeForYouAlbums;
  const [catalogueSongs, setCatalogueSongs] = useState<Song[]>([]);
  const [catalogueAlbums, setCatalogueAlbums] = useState<Album[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueError, setCatalogueError] = useState(false);

  const songs = useMemo(() => {
    const byId = new Map<string, Song>();
    const trackKeys = new Set<string>();
    for (const song of [...previewSongs, ...catalogueSongs]) {
      const key = `${song.title.trim().toLowerCase()}::${song.artist.trim().toLowerCase()}`;
      if (byId.has(song._id) || trackKeys.has(key)) continue;
      byId.set(song._id, song);
      trackKeys.add(key);
    }
    return [...byId.values()];
  }, [previewSongs, catalogueSongs]);
  const albums = useMemo(() => [...new Map(
    [...previewAlbums, ...catalogueAlbums].map((album) => [album.id || album._id, album]),
  ).values()], [previewAlbums, catalogueAlbums]);

  useEffect(() => {
    if (collectionId === "made-for-you" && !madeForYouSongs.length) void fetchMadeForYouSongs();
    if (collectionId === "trending" && !trendingSongs.length) void fetchTrendingSongs();
    if (collectionId === "featured-albums" && !madeForYouAlbums.length) void fetchMadeForYouAlbums();
  }, [collectionId, madeForYouSongs.length, trendingSongs.length, madeForYouAlbums.length, fetchMadeForYouSongs, fetchTrendingSongs, fetchMadeForYouAlbums]);

  useEffect(() => {
    let active = true;
    setCatalogueSongs([]);
    setCatalogueAlbums([]);
    setCatalogueError(false);
    if (!collectionId || !collections[collectionId as keyof typeof collections]) return;

    setCatalogueLoading(true);
    const loadCatalogue = async () => {
      if (collectionId === "trending") {
        const { data } = await axiosInstance.get<any[]>("/songs/trending");
        if (!active) return;
        const trending = (Array.isArray(data) ? data : [])
          .map((song) => mapSaavnSong(song))
          .filter((song): song is Song => Boolean(song?._id && song.audioUrl));
        setCatalogueSongs(trending);
        setCatalogueError(!trending.length);
        return;
      }

      const queries = collectionId === "made-for-you"
        ? ["popular Hindi songs", "popular Punjabi songs", "popular English songs"]
        : ["Bollywood albums", "Punjabi albums", "English pop albums"];
      const settled = await Promise.allSettled(collectionId === "featured-albums"
        ? queries.map((query) => searchSaavnAlbums(query, 30))
        : queries.map((query) => searchSaavnSongs(query, 30)));
      if (!active) return;
      const fulfilled = settled.filter((result): result is PromiseFulfilledResult<any[]> => result.status === "fulfilled");
      if (fulfilled.length === 0 || fulfilled.every((result) => !result.value.length)) setCatalogueError(true);
      if (collectionId === "featured-albums") {
        setCatalogueAlbums(fulfilled.flatMap((result) => result.value.map(mapSaavnAlbum).filter(Boolean) as Album[]));
      } else {
        setCatalogueSongs(fulfilled.flatMap((result) => result.value.map((song) => mapSaavnSong(song)).filter(Boolean) as Song[]));
      }
    };

    void loadCatalogue().catch(() => {
      if (active) setCatalogueError(true);
    }).finally(() => {
      if (active) setCatalogueLoading(false);
    });

    return () => { active = false; };
  }, [collectionId]);

  const artwork = useMemo(() => collection?.type === "albums" ? albums[0]?.image?.[2]?.url || albums[0]?.imageUrl : songs[0]?.imageUrl, [collection?.type, albums, songs]);
  if (!collection) return <main className="grid h-full place-items-center p-6 text-center"><div><Music2 className="mx-auto mb-3 size-9 text-muted-foreground" /><h1 className="text-xl font-bold">Collection not found</h1><Link to="/"><Button className="mt-4">Back home</Button></Link></div></main>;

  return <main className="h-full overflow-y-auto bg-gradient-to-b from-primary/20 via-background to-background px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pb-8"><div className="mx-auto max-w-5xl"><PageBackButton /><header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end"><div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-violet-800 shadow-2xl sm:size-52">{artwork ? <img src={artwork} alt="" className="size-full object-cover" /> : <Music2 className="size-14 text-white/80" />}</div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Home collection</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">{collection.title}</h1><p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">{collection.subtitle}</p><p className="mt-4 text-sm font-medium">{collection.type === "songs" ? `${songs.length} songs` : `${albums.length} albums`}</p></div></header>{catalogueLoading && <p className="mb-4 text-sm text-muted-foreground">Finding more from the music catalogue…</p>}{catalogueError && <p className="mb-4 text-sm text-muted-foreground">Could not load extra catalogue results. Showing available collection items.</p>}{collection.type === "songs" ? <section className="overflow-hidden rounded-2xl border bg-card/60">{catalogueLoading && !songs.length ? <p className="p-8 text-sm text-muted-foreground">Loading collection…</p> : songs.length ? songs.map((song, index) => (
            <div key={`${song._id}-${index}`} className="group flex items-center gap-3 border-b p-3 last:border-0 hover:bg-secondary/70">
              <button type="button" onClick={() => playAlbum(songs, index)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">{index + 1}</span>
                <img src={song.imageUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{song.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{song.artist}</span>
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{song.albumName || "Single"}</span>
              </button>
              <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
                <SongOptionsMenu song={song} buttonClassName="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary" />
              </span>
            </div>
          )) : <p className="p-8 text-center text-sm text-muted-foreground">No songs are available right now.</p>}</section> : <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{catalogueLoading && !albums.length ? <p className="col-span-full py-8 text-sm text-muted-foreground">Loading collection…</p> : albums.length ? albums.map((album) => <Link key={album.id} to={`/album/${album.id}`} className="group rounded-2xl bg-card/70 p-3 transition-colors hover:bg-secondary"><div className="relative aspect-square overflow-hidden rounded-xl"><img src={album.image?.[2]?.url || album.imageUrl} alt={album.name} className="size-full object-cover transition-transform duration-300 group-hover:scale-105" /><span onClick={(event) => event.preventDefault()} className="absolute right-2 top-2"><AlbumOptionsMenu album={album} buttonClassName="grid size-8 place-items-center rounded-full bg-black/70 text-white" /></span></div><p className="mt-3 truncate font-semibold">{album.name || album.title}</p><p className="truncate text-sm text-muted-foreground">{album.artist}</p></Link>) : <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No albums are available right now.</p>}</section>}</div></main>;
};
export default HomeCollectionPage;
