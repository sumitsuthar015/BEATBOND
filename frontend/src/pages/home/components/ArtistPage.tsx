import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Clock3, Heart, Music2, Pause, Play, Share2 } from "lucide-react";
import Topbar from "@/components/Topbar";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { beginBackNavigation } from "@/lib/routeHistory";
import { useUser } from "@clerk/clerk-react";
import { fetchSavedArtists, publishSavedArtists, toggleSavedArtistRemote } from "@/lib/savedArtists";
import { useChatStore } from "@/stores/useChatStore";
import { isVerifiedValidSong } from "@/lib/songUtils";
import toast from "react-hot-toast";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";

type Tab = "overview" | "songs" | "albums";
type Sort = "popular" | "name" | "date";

const ArtistPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const socket = useChatStore((state) => state.socket);
  const [tab, setTab] = useState<Tab>("overview");
  const [sort, setSort] = useState<Sort>("popular");
  const loadedArtist = useMusicStore((state) => state.currentArtist);
  const routeArtist = (location.state as { artist?: { id: string; name: string; imageUrl: string; isVerified?: boolean; followerCount?: number } } | null)?.artist;
  const artist = loadedArtist?.id === id ? loadedArtist : routeArtist ? { id: routeArtist.id, name: routeArtist.name, image: routeArtist.imageUrl ? [{ quality: "500x500", url: routeArtist.imageUrl }] : [], isVerified: routeArtist.isVerified, followerCount: routeArtist.followerCount, topSongs: [], topAlbums: [] } : null;
  const loading = useMusicStore((state) => state.artistDetailLoading);
  const fetchArtistById = useMusicStore((state) => state.fetchArtistById);
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => { if (id) fetchArtistById(id); }, [id, fetchArtistById]);
  useEffect(() => { if (artist?.id && user) void fetchSavedArtists(user.id).then((artists) => setIsSaved(artists.some((item) => item.id === artist.id))).catch(() => undefined); }, [artist?.id, user]);
  useEffect(() => { const update = (artists: any[]) => { if (artist?.id) setIsSaved(artists.some((item) => String(item.artistId || item.id) === artist.id)); }; socket.on("liked_artists_updated", update); return () => { socket.off("liked_artists_updated", update); }; }, [artist?.id, socket]);

  const songs = useMemo(() => {
    const seenIds = new Set<string>();
    const seenTracks = new Set<string>();
    const items = (artist?.topSongs || []).filter((song) => {
      if (!isVerifiedValidSong(song)) return false;
      const id = String(song._id || "").trim();
      const trackKey = `${String(song.title || "").trim().toLowerCase()}::${String(song.artist || "").trim().toLowerCase()}`;
      if ((id && seenIds.has(id)) || (trackKey !== "::" && seenTracks.has(trackKey))) return false;
      if (id) seenIds.add(id);
      if (trackKey !== "::") seenTracks.add(trackKey);
      return true;
    });
    if (sort === "name") return items.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "date") return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return items;
  }, [artist?.topSongs, sort]);
  const duration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  const playAll = () => {
    if (!songs.length) return;
    const currentIndex = songs.findIndex((song) => song._id === currentSong?._id);
    if (currentIndex !== -1) togglePlay();
    else playAlbum(songs, 0);
  };
  const saveArtist = async () => {
    if (!artist) return;
    try { const result = await toggleSavedArtistRemote(artist); setIsSaved(result.saved); publishSavedArtists(result.artists); toast.success(result.saved ? `${artist.name} saved to Liked artists` : `${artist.name} removed from Liked artists`); } catch { toast.error("Could not update liked artists."); }
  };

  if (loading) return <div className="h-full overflow-auto bg-[#101010]"><Topbar /><div className="mx-auto max-w-7xl animate-pulse p-6"><div className="h-56 rounded-2xl bg-zinc-800" /><div className="mt-6 h-8 w-1/3 rounded bg-zinc-800" /><div className="mt-8 h-80 rounded-xl bg-zinc-800/60" /></div></div>;
  if (!artist) return <div className="h-full bg-[#101010]"><Topbar /><div className="flex h-3/4 items-center justify-center text-zinc-400">Artist not found.</div></div>;

  const image = artist.image?.[2]?.url || artist.image?.[1]?.url || artist.image?.[0]?.url || "/default-image.png";
  const tabs: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "songs", label: `Songs (${songs.length})` }, { id: "albums", label: "Albums" }];
  const collectionSummary = `${artist.name}'s BeatBond profile includes ${artist.topSongs?.length || "a selection of"} popular ${artist.topSongs?.length === 1 ? "track" : "tracks"} and ${artist.topAlbums?.length || "a collection of"} ${artist.topAlbums?.length === 1 ? "album" : "albums"} to explore.${artist.dominantLanguage && artist.dominantLanguage.toLowerCase() !== "unknown" ? ` The collection highlights ${artist.dominantLanguage} music.` : ""}${artist.fanCount || artist.followerCount ? ` Follow the profile to keep up with music enjoyed by ${artist.fanCount || artist.followerCount?.toLocaleString()} listeners.` : ""}`;
  const aboutText = artist.bio ? `${artist.bio} ${collectionSummary}` : collectionSummary;

  return <div className="h-full overflow-hidden bg-[#101010] text-white"><Topbar />
    <main className="h-[calc(100vh-124px)] overflow-y-auto pb-28">
      <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-primary/30 via-[#1b1b1b] to-[#101010]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:px-8 sm:py-12">
          <button onClick={() => navigate(beginBackNavigation(), { replace: true })} className="absolute left-4 top-4 rounded-full bg-black/40 p-2 text-white sm:hidden"><ChevronLeft className="size-5" /></button>
          <img src={image} alt={artist.name} className="mx-auto size-40 rounded-full object-cover shadow-2xl ring-4 ring-white/10 sm:mx-0 sm:size-52" onError={(e) => { (e.target as HTMLImageElement).src = "/default-image.png"; }} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="mb-2 text-sm font-medium text-white/70">Artist</p>
            <h1 className="truncate text-4xl font-black tracking-tight sm:text-6xl">{artist.name}</h1>
            <p className="mt-3 text-sm text-white/70">{artist.fanCount || artist.followerCount?.toLocaleString() || ""} {artist.fanCount || artist.followerCount ? "listeners" : ""}{artist.dominantLanguage ? ` · ${artist.dominantLanguage}` : ""}</p>
            <div className="mt-6 flex items-center justify-center gap-3 sm:justify-start"><button onClick={playAll} className="flex min-w-32 items-center justify-center gap-2 rounded-full bg-primary px-7 py-3 font-bold text-primary-foreground transition hover:scale-105">{isPlaying && currentSong && artist.topSongs?.some((song) => song._id === currentSong._id) ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />} {isPlaying && currentSong && artist.topSongs?.some((song) => song._id === currentSong._id) ? "Pause" : "Play"}</button><button onClick={saveArtist} aria-label={isSaved ? "Remove from liked artists" : "Save artist"} title={isSaved ? "Remove from liked artists" : "Save artist"} className={`rounded-full border p-3 transition ${isSaved ? "border-primary bg-primary text-primary-foreground" : "border-white/25 text-white/80 hover:bg-white/10"}`}><Heart className={`size-5 ${isSaved ? "fill-current" : ""}`} /></button><ShareToMessageDialog message={`Check out ${artist.name} on BeatBond`} sharedContent={{ type: "artist", title: artist.name, subtitle: artist.dominantLanguage ? `${artist.dominantLanguage} artist` : "Artist", imageUrl: image, href: `/artist/${artist.id}` }} trigger={<button type="button" aria-label={`Share ${artist.name}`} title="Share artist" className="rounded-full border border-white/25 p-3 text-white/80 transition hover:bg-white/10"><Share2 className="size-5" /></button>} /></div>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="flex gap-6 border-b border-white/10">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`border-b-2 py-5 text-sm font-semibold transition ${tab === item.id ? "border-primary text-primary" : "border-transparent text-zinc-400 hover:text-white"}`}>{item.label}</button>)}</div>
        {(tab === "overview" || tab === "songs") && <div className="py-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-bold">{tab === "overview" ? "Popular songs" : "All songs"}</h2><div className="flex gap-2">{(["popular", "date", "name"] as Sort[]).map((value) => <button key={value} onClick={() => setSort(value)} className={`rounded-full px-4 py-2 text-sm capitalize ${sort === value ? "bg-white text-black" : "bg-white/10 text-zinc-300"}`}>{value}</button>)}</div></div>
          <div className="hidden grid-cols-[36px_minmax(240px,2fr)_minmax(160px,1fr)_minmax(150px,1fr)_48px] gap-4 border-b border-white/10 px-3 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500 lg:grid"><span>#</span><span>Title</span><span>Artist</span><span>Album</span><Clock3 className="size-4" /></div>
          <div>{songs.map((song, index) => { const active = currentSong?._id === song._id; return <button key={song._id} onClick={() => playAlbum(songs, index)} className={`grid w-full grid-cols-[30px_minmax(0,1fr)_45px] items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-white/10 lg:grid-cols-[36px_minmax(240px,2fr)_minmax(160px,1fr)_minmax(150px,1fr)_48px] lg:gap-4 ${active ? "bg-primary/15" : ""}`}><span className="text-center text-sm text-zinc-400">{active && isPlaying ? <Music2 className="mx-auto size-4 text-primary" /> : index + 1}</span><span className="flex min-w-0 items-center gap-3"><img src={song.imageUrl || image} alt="" className="size-11 rounded object-cover" /><span className="min-w-0"><span className={`block truncate font-semibold ${active ? "text-primary" : "text-white"}`}>{song.title}</span><span className="block truncate text-xs text-zinc-400 lg:hidden">{song.artist}</span></span></span><span className="hidden truncate text-sm text-zinc-400 lg:block">{song.artist}</span><span className="hidden truncate text-sm text-zinc-400 lg:block">{(song as any).albumName || "Single"}</span><span className="text-right text-xs text-zinc-400">{duration(song.duration)}</span></button>; })}</div>
          {!songs.length && <p className="py-10 text-center text-zinc-400">No playable songs are available from this artist yet.</p>}</div>}
        {(tab === "overview" || tab === "albums") && (
          <div className="pb-10">
            <h2 className="mb-5 text-2xl font-bold">Albums</h2>
            {artist.topAlbums && artist.topAlbums.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6">
                {artist.topAlbums.map((album) => (
                  <button
                    key={album._id || album.id}
                    onClick={() => navigate(`/album/${album._id || album.id}`)}
                    className="text-left group bg-white/5 p-3 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
                    aria-label={`Open album ${album.title}`}
                  >
                    <img
                      src={album.imageUrl || "/default-image.png"}
                      alt={album.title}
                      className="aspect-square w-full rounded-md object-cover shadow-lg transition group-hover:scale-[1.02]"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/default-image.png"; }}
                    />
                    <p className="mt-3 truncate font-semibold text-sm">{album.title}</p>
                    <p className="mt-1 truncate text-xs text-zinc-400">{album.artist || artist.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{album.year || "Album"}{album.songCount ? ` · ${album.songCount} songs` : ""}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-6 text-sm text-zinc-400">No albums available for this artist.</p>
            )}
          </div>
        )}
        {tab === "overview" && (
          <div className="border-t border-white/10 py-8">
            <h2 className="mb-3 text-2xl font-bold">About {artist.name}</h2>
            <p className="max-w-3xl text-sm leading-7 text-zinc-300 line-clamp-5">{aboutText}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {artist.dominantType && <span className="rounded-full bg-white/10 px-3 py-1.5 text-zinc-200">{artist.dominantType}</span>}
              {artist.isVerified && <span className="rounded-full bg-primary/20 px-3 py-1.5 text-primary">Verified artist</span>}
              {artist.dominantLanguage && artist.dominantLanguage.toLowerCase() !== "unknown" && <span className="rounded-full bg-white/10 px-3 py-1.5 text-zinc-200">{artist.dominantLanguage} music</span>}
              {(artist.fanCount || artist.followerCount) && <span className="rounded-full bg-white/10 px-3 py-1.5 text-zinc-200">{artist.fanCount || artist.followerCount?.toLocaleString()} listeners</span>}
            </div>
          </div>
        )}
      </section>
    </main>
  </div>;
};

export default ArtistPage;
