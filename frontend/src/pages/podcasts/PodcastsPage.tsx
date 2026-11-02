import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Headphones, Loader2, MoreHorizontal, Play, Search, UserRoundMinus, UserRoundPlus } from "lucide-react";
import toast from "react-hot-toast";
import { PageBackButton } from "@/components/PageBackButton";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { axiosInstance } from "@/lib/axios";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import type { Song } from "@/types";

type Podcast = { collectionId: string; title: string; artist: string; imageUrl: string; episodeCount: number; platform?: "rss" | "youtube"; videoId?: string };
type Episode = { id: string; title: string; description: string; audioUrl: string; duration: number; publishedAt: string; imageUrl: string; progressSeconds?: number; completed?: boolean; chapters?: Array<{ startTime: number; title: string }> };
type Subscription = Podcast & { _id: string; feedUrl: string };
type SavedEpisode = { episode: { _id: string; title: string; audioUrl: string; duration: number; publishedAt?: string; chapters?: Array<{ startTime: number; title: string }> }; podcast: { _id: string; catalogId?: string; title: string; author: string; coverImage: string }; progress?: { positionSeconds: number; completed: boolean } };

const PodcastsPage = () => {
  const { user } = useUser();
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const setPodcastPlaybackSpeed = usePreferencesStore((state) => state.setPodcastPlaybackSpeed);
  const [query, setQuery] = useState("");
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [newPodcasts, setNewPodcasts] = useState<Podcast[]>([]);
  const [trendingPodcasts, setTrendingPodcasts] = useState<Podcast[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [continueListening, setContinueListening] = useState<SavedEpisode[]>([]);
  const [newEpisodes, setNewEpisodes] = useState<SavedEpisode[]>([]);
  const [selected, setSelected] = useState<Podcast | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const refreshSubscriptions = async () => {
    const { data } = await axiosInstance.get<Subscription[]>("/podcasts/subscriptions");
    setSubscriptions(data);
  };
  useEffect(() => {
    if (!user) return;
    void refreshSubscriptions().catch(() => toast.error("Could not load subscriptions."));
    void Promise.all([
      axiosInstance.get<SavedEpisode[]>("/v1/podcasts/me/continue-listening"),
      axiosInstance.get<SavedEpisode[]>("/v1/podcasts/me/new-episodes"),
    ]).then(([continuing, recent]) => {
      setContinueListening(continuing.data);
      setNewEpisodes(recent.data);
    }).catch(() => undefined);
    setDiscoverLoading(true);
    void axiosInstance.get<{ newPodcasts: Podcast[]; trendingPodcasts: Podcast[] }>("/podcasts/discover")
      .then(({ data }) => { setNewPodcasts(data.newPodcasts); setTrendingPodcasts(data.trendingPodcasts); })
      .catch((cause: any) => setError(cause.response?.data?.message || "Podcast suggestions are unavailable right now."))
      .finally(() => setDiscoverLoading(false));
  }, [user]);
  useEffect(() => {
    if (!user) return;
    void axiosInstance.get<{ speed: number }>("/v1/podcasts/me/playback-preference")
      .then(({ data }) => setPodcastPlaybackSpeed(data.speed))
      .catch(() => undefined);
  }, [setPodcastPlaybackSpeed, user]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true); setSelected(null); setEpisodes([]);
    try { setPodcasts((await axiosInstance.get<{ podcasts: Podcast[] }>("/podcasts/search", { params: { q: query.trim() } })).data.podcasts); }
    catch (cause: any) { setError(cause.response?.data?.message || "Podcast search is unavailable right now."); }
    finally { setLoading(false); }
  };

  const openPodcast = async (podcast: Podcast) => {
    setSelected(podcast); setEpisodes([]); setLoading(true); setError("");
    if (podcast.platform === "youtube") {
      setLoading(false);
      return;
    }
    try {
      const { data } = await axiosInstance.get<{ episodes: Episode[] }>(`/podcasts/${podcast.collectionId}/episodes`);
      setEpisodes(data.episodes);
    }
    catch (cause: any) { setError(cause.response?.data?.message || "Could not load this podcast's episodes."); }
    finally { setLoading(false); }
  };

  const subscribe = async (podcast: Podcast) => {
    setBusyId(podcast.collectionId);
    try { await axiosInstance.post("/podcasts/subscriptions", { collectionId: podcast.collectionId, platform: "rss" }); await refreshSubscriptions(); toast.success("Podcast added to your library."); }
    catch (cause: any) { toast.error(cause.response?.data?.message || "Could not subscribe to this podcast."); }
    finally { setBusyId(""); }
  };

  const unsubscribe = async (podcast: Podcast) => {
    setBusyId(podcast.collectionId);
    try { await axiosInstance.delete(`/podcasts/subscriptions/${podcast.collectionId}`); setSubscriptions((current) => current.filter((item) => item.collectionId !== podcast.collectionId)); toast.success("Podcast removed from your library."); }
    catch (cause: any) { toast.error(cause.response?.data?.message || "Could not unsubscribe."); }
    finally { setBusyId(""); }
  };

  const markEpisode = async (episode: Episode, mark: "played" | "unplayed") => {
    try {
      await axiosInstance.patch(`/v1/podcasts/episodes/${episode.id}/progress`, { mark });
      setEpisodes((current) => current.map((item) => item.id === episode.id ? { ...item, completed: mark === "played", progressSeconds: mark === "played" ? item.duration : 0 } : item));
    } catch (cause: any) { toast.error(cause.response?.data?.message || "Could not update episode progress."); }
  };

  const play = (episode: Episode, podcast: Podcast) => {
    const queue = episodes.map((item): Song => ({
      _id: `podcast:${item.id}`.slice(0, 200), title: item.title, artist: podcast.artist || podcast.title,
      genre: "Podcast", language: "", videoUrl: null, playedAt: "", userId: undefined,
      imageUrl: item.imageUrl || podcast.imageUrl, audioUrl: item.audioUrl, albumId: podcast.collectionId,
      albumName: podcast.title, duration: item.duration || 0, createdAt: item.publishedAt || "", updatedAt: "",
      podcastEpisodeId: item.id, podcastShowId: podcast.collectionId, podcastResumePosition: item.progressSeconds || 0,
      podcastChapters: item.chapters,
    }));
    const index = queue.findIndex((song) => song.podcastEpisodeId === episode.id);
    if (index >= 0) playAlbum(queue, index);
  };

  const playSavedEpisode = (item: SavedEpisode) => {
    const { episode, podcast, progress } = item;
    const song: Song = {
      _id: `podcast:${episode._id}`.slice(0, 200), title: episode.title, artist: podcast.author || podcast.title,
      genre: "Podcast", language: "", videoUrl: null, playedAt: "", userId: undefined,
      imageUrl: podcast.coverImage, audioUrl: episode.audioUrl, albumId: podcast.catalogId || podcast._id,
      albumName: podcast.title, duration: episode.duration || 0, createdAt: episode.publishedAt || "", updatedAt: "",
      podcastEpisodeId: episode._id, podcastShowId: podcast._id, podcastResumePosition: progress?.positionSeconds || 0,
      podcastChapters: episode.chapters,
    };
    playAlbum([song]);
  };

  if (!user) return <main className="grid h-full place-items-center p-6 text-center"><div><Headphones className="mx-auto mb-3 size-8 text-muted-foreground" /><h1 className="text-xl font-bold">Sign in to listen to podcasts</h1></div></main>;

  const isSubscribed = (id: string) => subscriptions.some((item) => item.collectionId === id);
  return <main className="h-full overflow-y-auto bg-black px-4 py-5 pb-24 text-white sm:px-6"><div className="mx-auto max-w-[1440px] space-y-8">
    <PageBackButton />
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-primary">Listen beyond music</p><h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Podcasts</h1><p className="mt-2 max-w-xl text-sm text-zinc-400">Find new voices, catch up on episodes, and listen with the BeatBond player.</p></div>
      <form onSubmit={(event) => void search(event)} className="flex w-full gap-2 sm:max-w-md"><label htmlFor="podcast-search" className="sr-only">Search podcasts</label><Input id="podcast-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={100} placeholder="Search podcasts and episodes" required className="h-11 rounded-full border-zinc-800 bg-zinc-950 px-5 text-white placeholder:text-zinc-500" /><Button type="submit" aria-label="Search podcasts" disabled={loading || query.trim().length < 2} className="size-11 shrink-0 rounded-full">{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</Button></form>
    </header>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {continueListening.length > 0 && <SavedEpisodeSection title="Continue listening" items={continueListening} onPlay={playSavedEpisode} showProgress />}
    {newEpisodes.length > 0 && <SavedEpisodeSection title="New episodes" items={newEpisodes} onPlay={playSavedEpisode} />}
    {selected && selected.platform !== "youtube" && <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6"><div className="flex items-center gap-3"><img src={selected.imageUrl} alt="" className="size-12 rounded-xl object-cover sm:size-14" /><div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{selected.title}</h2><p className="truncate text-sm text-zinc-400">{selected.artist}</p></div><Button variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" onClick={() => void (isSubscribed(selected.collectionId) ? unsubscribe(selected) : subscribe(selected))}>{isSubscribed(selected.collectionId) ? <UserRoundMinus className="mr-1.5 size-4" /> : <UserRoundPlus className="mr-1.5 size-4" />}{isSubscribed(selected.collectionId) ? "Remove" : "Follow"}</Button><Button variant="ghost" size="sm" className="text-zinc-400" onClick={() => { setSelected(null); setEpisodes([]); }}>Close</Button></div>
      <div className="divide-y divide-zinc-800">{episodes.map((episode) => <div key={episode.id} className="flex items-start gap-3 py-3"><Button size="icon" variant="outline" aria-label={`Play ${episode.title}`} onClick={() => play(episode, selected)}><Play className="size-4" /></Button><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{episode.title}</p><p className="truncate text-xs text-zinc-500">{episode.publishedAt}{episode.duration ? ` · ${Math.floor(episode.duration / 60)} min` : ""}{episode.progressSeconds ? ` · Resume at ${Math.floor(episode.progressSeconds / 60)}:${String(Math.floor(episode.progressSeconds % 60)).padStart(2, "0")}` : ""}</p>{episode.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{episode.description}</p>}{episode.duration > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-primary" style={{ width: `${episode.completed ? 100 : Math.min(100, (episode.progressSeconds || 0) / episode.duration * 100)}%` }} /></div>}</div><Button size="sm" variant="ghost" className="shrink-0 text-xs text-zinc-400" onClick={() => void markEpisode(episode, episode.completed ? "unplayed" : "played")}>{episode.completed ? "Mark unplayed" : "Mark played"}</Button></div>)}{loading && <p className="py-8 text-center text-sm text-zinc-500"><Loader2 className="mr-2 inline size-4 animate-spin" />Loading episodes…</p>}{!loading && episodes.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">No playable episodes were found in this feed.</p>}</div></section>}
    {selected?.platform === "youtube" && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300"><span className="flex-1">This saved item is a YouTube video and can’t play in audio-only mode.</span><Button size="sm" variant="outline" onClick={() => void unsubscribe(selected)}>Remove saved video</Button></div>}
    {subscriptions.length > 0 && <PodcastSection title="Your podcasts" subtitle="Shows you follow" podcasts={subscriptions} selectedId={selected?.collectionId} busyId={busyId} isSubscribed={isSubscribed} onOpen={(item) => void openPodcast(item)} onSubscribe={(item) => void unsubscribe(item)} />}
    {podcasts.length > 0 && <PodcastSection title="Search results" subtitle={`Results for “${query.trim()}”`} podcasts={podcasts} selectedId={selected?.collectionId} busyId={busyId} isSubscribed={isSubscribed} onOpen={(item) => void openPodcast(item)} onSubscribe={(item) => void (isSubscribed(item.collectionId) ? unsubscribe(item) : subscribe(item))} />}
    {podcasts.length === 0 && <>
      <PodcastSection title="New podcasts" subtitle="Fresh picks from the podcast catalog" podcasts={newPodcasts} selectedId={selected?.collectionId} busyId={busyId} isSubscribed={isSubscribed} onOpen={(item) => void openPodcast(item)} onSubscribe={(item) => void (isSubscribed(item.collectionId) ? unsubscribe(item) : subscribe(item))} loading={discoverLoading} />
      <PodcastSection title="Trending now" subtitle="Popular shows on Apple Podcasts" podcasts={trendingPodcasts} selectedId={selected?.collectionId} busyId={busyId} isSubscribed={isSubscribed} onOpen={(item) => void openPodcast(item)} onSubscribe={(item) => void (isSubscribed(item.collectionId) ? unsubscribe(item) : subscribe(item))} loading={discoverLoading} />
    </>}
    {podcasts.length === 0 && newPodcasts.length === 0 && trendingPodcasts.length === 0 && !discoverLoading && subscriptions.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400"><Headphones className="mx-auto mb-2 size-7" />Search for a show or episode to get started.</div>}
  </div></main>;
};

const PodcastSection = ({ title, subtitle, podcasts, selectedId, busyId, isSubscribed, onOpen, onSubscribe, loading = false }: { title: string; subtitle: string; podcasts: Podcast[]; selectedId?: string; busyId: string; isSubscribed: (id: string) => boolean; onOpen: (podcast: Podcast) => void; onSubscribe: (podcast: Podcast) => void; loading?: boolean }) => <section className="space-y-4"><div><h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2><p className="mt-1 text-sm text-zinc-500">{subtitle}</p></div>{loading && podcasts.length === 0 ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="animate-pulse space-y-3 rounded-xl border border-zinc-900 bg-zinc-950 p-3"><div className="aspect-square rounded-lg bg-zinc-900" /><div className="h-4 w-3/4 rounded bg-zinc-900" /><div className="h-3 w-1/2 rounded bg-zinc-900" /></div>)}</div> : podcasts.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">No suggestions are available right now. Try searching for a podcast.</p> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{podcasts.map((podcast) => <PodcastCard key={podcast.collectionId} podcast={podcast} selected={selectedId === podcast.collectionId} busy={busyId === podcast.collectionId} subscribed={isSubscribed(podcast.collectionId)} onOpen={() => onOpen(podcast)} onSubscribe={() => onSubscribe(podcast)} />)}</div>}</section>;

const SavedEpisodeSection = ({ title, items, onPlay, showProgress = false }: { title: string; items: SavedEpisode[]; onPlay: (item: SavedEpisode) => void; showProgress?: boolean }) => <section className="space-y-3"><h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.slice(0, 6).map((item) => {
  const position = item.progress?.positionSeconds || 0;
  const duration = item.episode.duration || 0;
  return <article key={item.episode._id} className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"><img src={item.podcast.coverImage} alt="" className="size-12 shrink-0 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.episode.title}</p><p className="truncate text-xs text-zinc-500">{item.podcast.title}{showProgress && duration > 0 ? ` · ${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, "0")} left` : ""}</p>{showProgress && duration > 0 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-primary" style={{ width: `${Math.min(100, position / duration * 100)}%` }} /></div>}</div><Button size="icon" variant="ghost" aria-label={`Play ${item.episode.title}`} onClick={() => onPlay(item)}><Play className="size-4" /></Button></article>;
})}</div></section>;

const PodcastCard = ({ podcast, selected, busy, onOpen, onSubscribe, subscribed }: { podcast: Podcast; selected: boolean; busy: boolean; onOpen: () => void; onSubscribe: () => void; subscribed: boolean }) => <article className={`group min-w-0 rounded-xl border p-3 transition-colors ${selected ? "border-primary/70 bg-zinc-900" : "border-zinc-900 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900/70"}`}><div className="relative aspect-square overflow-hidden rounded-lg bg-zinc-900"><button type="button" onClick={onOpen} aria-label={`Play ${podcast.title} by ${podcast.artist}`} className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"><img src={podcast.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /><span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/25"><span className="grid size-12 translate-y-2 place-items-center rounded-full bg-white text-black opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"><Play className="ml-0.5 size-5 fill-current" /></span></span></button><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`More options for ${podcast.title}`} className="absolute right-2 top-2 z-10 size-9 rounded-full bg-black/75 text-white backdrop-blur hover:bg-black"><MoreHorizontal className="size-5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="border-zinc-800 bg-zinc-900 text-white"><DropdownMenuItem onSelect={onOpen}><Play className="mr-2 size-4" />Play podcast</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={onSubscribe}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : subscribed ? <UserRoundMinus className="mr-2 size-4" /> : <UserRoundPlus className="mr-2 size-4" />}{subscribed ? "Remove from your podcasts" : "Follow podcast"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><button type="button" onClick={onOpen} className="mt-3 block w-full min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="block truncate text-sm font-semibold text-white sm:text-base">{podcast.title}</span><span className="mt-1 block truncate text-sm text-zinc-400">{podcast.artist}</span></button></article>;

export default PodcastsPage;
