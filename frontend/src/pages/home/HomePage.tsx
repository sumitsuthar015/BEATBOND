import Topbar from "@/components/Topbar";
import { useMusicStore } from "@/stores/useMusicStore";
import { useEffect } from "react";
import FeaturedSection from "./components/FeaturedSection";
import SectionGrid from "./components/SectionGrid";
import { AnimatedText } from "@/components/ui/animated-text";
import AlbumGrid from "./components/AlbumGrid";
import ArtistGrid from "./components/ArtistGrid";
import { Link } from "react-router-dom";
import { ArrowUpRight, Headphones, UsersRound } from "lucide-react";
import MusicStories from "@/components/MusicStories";
import TrendingNearYou from "@/components/TrendingNearYou";

// Persists in JS memory across route changes. Resets to true only on page reload / fresh app open.
let isInitialAppLoad = true;
let initialAlbumFetchTimer: number | null = null;

const HomePage = () => {
  const {
    featuredSongs,
    fetchFeaturedSongs,
    madeForYouSongs,
    fetchMadeForYouSongs,
    trendingSongs,
    fetchTrendingSongs,
    madeForYouAlbums,
    fetchMadeForYouAlbums,
    artists,
    artistsLoading,
    fetchArtists,
    isLoading,
  } = useMusicStore();

  useEffect(() => {
    if (isInitialAppLoad) {
      // Refresh once per app launch. The shelf actions paint local cache
      // immediately, then replace it with a fresh server selection. The module
      // flag keeps route changes within this app session stable.
      isInitialAppLoad = false;
      void fetchFeaturedSongs(true);
      void fetchMadeForYouSongs(true);
      void fetchTrendingSongs();
      // Songs paint first; album discovery can make several upstream requests,
      // so start it just after the initial shelf requests have had a head start.
      initialAlbumFetchTimer = window.setTimeout(() => {
        initialAlbumFetchTimer = null;
        void fetchMadeForYouAlbums(true);
      }, 900);
    } else {
      // Route switching / page toggling within the app -> use existing state without re-fetching
      if (!featuredSongs.length) void fetchFeaturedSongs();
      if (!madeForYouSongs.length) void fetchMadeForYouSongs();
      if (!trendingSongs.length) void fetchTrendingSongs();
      if (!madeForYouAlbums.length && initialAlbumFetchTimer === null) void fetchMadeForYouAlbums();
    }
  }, [
    featuredSongs.length,
    madeForYouSongs.length,
    trendingSongs.length,
    madeForYouAlbums.length,
    fetchFeaturedSongs,
    fetchMadeForYouSongs,
    fetchTrendingSongs,
    fetchMadeForYouAlbums,
  ]);

  useEffect(() => {
    // Refresh the chart while the app remains open. The backend shares a
    // 30-minute provider cache, so this gets the latest chart without making
    // an upstream request for every client render or route change.
    const timer = window.setInterval(() => void fetchTrendingSongs(true), 31 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [fetchTrendingSongs]);

  useEffect(() => {
    if (artists.length) return;
    const timer = window.setTimeout(() => void fetchArtists(), 1_500);
    return () => window.clearTimeout(timer);
  }, [artists.length, fetchArtists]);

  const getGreetings = () => {
    const hour = new Date().getHours();
    if (hour < 12) return ["music", "vibes", "rhythm"];
    if (hour < 18) return ["groove", "beats", "tunes"];
    return ["chill", "vibe", "relax"];
  };

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg bg-gradient-to-b from-background via-background/95 to-background/90 backdrop-blur-sm">
      <Topbar showInstall />
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-custom">
        <div className="px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">
          {/* Greeting Section */}
          <div className="mb-5 sm:mb-6 lg:mb-8">
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
              <AnimatedText
                staticText="One spot for"
                texts={getGreetings()}
                interval={4000}
              />
            </h1>
          </div>

          {/* Featured Section */}
          <MusicStories />
          <TrendingNearYou />
          <FeaturedSection />

          {/* Group listening */}
          <section className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card/80 to-card p-5 shadow-sm sm:mb-8 sm:p-6" aria-labelledby="group-listening-title">
            <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <UsersRound className="size-6" aria-hidden="true" />
                </div>
                <div className="max-w-2xl">
                  <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    <Headphones className="size-3.5" aria-hidden="true" /> Listen together
                  </p>
                  <h2 id="group-listening-title" className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Make it a shared session</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    Friends join a shared room and playback stays in sync over Socket.IO. The host controls play, pause and seek, and every listener follows in real time.
                  </p>
                </div>
              </div>
              <Link to="/group-listening" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-primary/25 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 sm:self-center">
                Start a group <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          {/* Content Sections */}
          <div className="space-y-5 sm:space-y-6 lg:space-y-8 pb-4">
            <SectionGrid
              title="Made For You"
              songs={madeForYouSongs}
              isLoading={isLoading}
              collectionId="made-for-you"
            />

            <SectionGrid
              title="Trending"
              songs={trendingSongs}
              isLoading={isLoading}
              collectionId="trending"
            />

            <AlbumGrid
              title="Featured Albums"
              albums={madeForYouAlbums}
              isLoading={isLoading}
              collectionId="featured-albums"
            />

            <ArtistGrid
              title="Popular Artists"
              artists={artists}
              isLoading={artistsLoading}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export default HomePage;
