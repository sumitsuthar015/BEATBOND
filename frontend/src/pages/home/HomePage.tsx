import Topbar from "@/components/Topbar";
import { useMusicStore } from "@/stores/useMusicStore";
import { useEffect } from "react";
import FeaturedSection from "./components/FeaturedSection";
import SectionGrid from "./components/SectionGrid";
import { AnimatedText } from "@/components/ui/animated-text";
import AlbumGrid from "./components/AlbumGrid";
import ArtistGrid from "./components/ArtistGrid";

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
      // Prefer the local shelf cache for an immediate first paint. A missing
      // shelf still fetches normally, and normal store invalidations keep data fresh.
      isInitialAppLoad = false;
      void fetchFeaturedSongs();
      void fetchMadeForYouSongs();
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
          <FeaturedSection />

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
