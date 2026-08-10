import { Artist } from "@/stores/useMusicStore";
import { useNavigate } from "react-router-dom";
import PlayButton from "./PlayButton";

type ArtistGridProps = {
  title: string;
  artists: Artist[];
  isLoading: boolean;
};

const ArtistGrid = ({ title, artists, isLoading }: ArtistGridProps) => {
  const navigate = useNavigate();

  const handleArtistClick = (artistId: string) => {
    navigate(`/artist/${artistId}`);
  };

  if (isLoading && (!artists || artists.length === 0)) {
    return (
      <div className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4 px-1">{title}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="bg-zinc-800/40 p-2 sm:p-3 md:p-4 rounded-lg animate-pulse"
            >
              <div className="aspect-square rounded-full bg-zinc-700 mb-2 sm:mb-3 md:mb-4" />
              <div className="h-3 sm:h-4 bg-zinc-700 rounded mb-1 sm:mb-2" />
              <div className="h-2 sm:h-3 bg-zinc-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!artists || artists.length === 0) {
    return (
      <div className="mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4 px-1">{title}</h2>
        <p className="text-zinc-400 text-sm sm:text-base">No artists found</p>
      </div>
    );
  }

  return (
    <div className="mb-6 sm:mb-8">
      <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4 px-1">{title}</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
        {artists.map((artist) => (
          <div
            key={artist.id}
            onClick={() => handleArtistClick(artist.id)}
            className="bg-zinc-800/40 p-2 sm:p-3 md:p-4 rounded-lg hover:bg-zinc-700/40 transition-all cursor-pointer group"
          >
            <div className="relative mb-2 sm:mb-3 md:mb-4">
              <img
                src={artist.imageUrl || artist.image?.[2]?.url || artist.image?.[1]?.url || artist.image?.[0]?.url || "/default-image.png"}
                alt={artist.name}
                className="aspect-square w-full object-cover rounded-full shadow-lg group-hover:scale-105 transition-transform"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/default-image.png";
                }}
              />
              {artist.topSongs?.[0] && (
                <PlayButton song={artist.topSongs[0]} size="small" />
              )}
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-xs sm:text-sm md:text-base truncate mb-0.5 sm:mb-1">
                {artist.name}
              </h3>
              <p className="text-[10px] sm:text-xs text-zinc-500 capitalize truncate">
                {artist.role}
              </p>
              {artist.topSongs && artist.topSongs.length > 0 && (
                <p className="mt-1 text-[9px] sm:text-[10px] text-zinc-400 line-clamp-2">
                  {artist.topSongs.slice(0, 2).map((song) => song.title).join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ArtistGrid;
