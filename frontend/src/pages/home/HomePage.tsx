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
    fetchArtists,
    isLoading,
  } = useMusicStore();

  useEffect(() => {
    if (isInitialAppLoad) {
      // Fresh app open or browser reload -> force load new fresh dynamic data
      isInitialAppLoad = false;
      void fetchFeaturedSongs(true);
      void fetchMadeForYouSongs(true);
      void fetchTrendingSongs(true);
      void fetchMadeForYouAlbums(true);
    } else {
      // Route switching / page toggling within the app -> use existing state without re-fetching
      if (!featuredSongs.length) void fetchFeaturedSongs();
      if (!madeForYouSongs.length) void fetchMadeForYouSongs();
      if (!trendingSongs.length) void fetchTrendingSongs();
      if (!madeForYouAlbums.length) void fetchMadeForYouAlbums();
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
    if (!trendingSongs.length || artists.length) return;
    const timer = window.setTimeout(() => void fetchArtists(), 400);
    return () => window.clearTimeout(timer);
  }, [trendingSongs.length, artists.length, fetchArtists]);

  const getGreetings = () => {
    const hour = new Date().getHours();
    if (hour < 12) return ["music", "vibes", "rhythm"];
    if (hour < 18) return ["groove", "beats", "tunes"];
    return ["chill", "vibe", "relax"];
  };

  return (
    <main className="rounded-lg h-full bg-gradient-to-b from-background via-background/95 to-background/90 backdrop-blur-sm">
      <Topbar showInstall />
      <div className="h-[calc(100vh-180px)] overflow-y-auto scrollbar-custom">
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
            />

            <SectionGrid
              title="Trending"
              songs={trendingSongs}
              isLoading={isLoading}
            />

            <AlbumGrid
              title="Featured Albums"
              albums={madeForYouAlbums}
              isLoading={isLoading}
            />

            <ArtistGrid
              title="Popular Artists"
              artists={artists}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export default HomePage;
