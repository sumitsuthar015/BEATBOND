import { useMusicStore } from "@/stores/useMusicStore";
import PlayButton from "./PlayButton";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";

const FeaturedSection = () => {
  const { featuredSongs, isLoading } = useMusicStore();
  const playAlbum = usePlayerStore((state) => state.playAlbum);

  if (isLoading && (!featuredSongs || featuredSongs.length === 0)) {
    return (
      <div className="mb-6 sm:mb-8">
        <div className="h-6 sm:h-7 w-32 bg-secondary/50 rounded mb-3 sm:mb-4 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i} 
              className="flex items-center gap-2.5 sm:gap-3 lg:gap-4 bg-secondary/50 rounded-lg 
                       p-2.5 sm:p-3 lg:p-4 hover:bg-secondary/70 transition-all cursor-pointer 
                       group animate-pulse"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-secondary rounded flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="h-3.5 sm:h-4 bg-secondary rounded mb-2 w-3/4" />
                <div className="h-3 bg-secondary rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const topSongs = featuredSongs.slice(0, 6);

  return (
    <div className="mb-6 sm:mb-8">
      <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground tracking-tight mb-3 sm:mb-4">
        Featured
      </h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
        {topSongs.map((song, index) => (
          <div
            key={song._id}
            onClick={() => playAlbum(topSongs, index)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => event.key === "Enter" && playAlbum(topSongs, index)}
            className="flex items-center gap-2.5 sm:gap-3 lg:gap-4 bg-card/50 rounded-lg 
                     p-2.5 sm:p-3 lg:p-4 hover:bg-secondary/50 transition-all duration-200 
                     cursor-pointer group border border-border/50 shadow-sm hover:shadow-md relative"
          >
            {/* Album Art */}
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 flex-shrink-0">
              <img
                src={song.imageUrl}
                alt={song.title}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover rounded shadow-md"
              />
              {/* Play Button for Featured */}
              <div className="absolute inset-0 flex items-center justify-center 
                            bg-black/40 opacity-0 group-hover:opacity-100 
                            transition-opacity rounded">
                <PlayButton song={song} size="small" />
              </div>
            </div>

            {/* Song Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate text-xs sm:text-sm lg:text-base leading-tight">
                {song.title}
              </h3>
              <p className="text-[10px] sm:text-xs lg:text-sm text-muted-foreground truncate mt-0.5 sm:mt-1">
                {song.artist}
              </p>
            </div>

            {/* Options Menu */}
            <div className="ml-auto flex-shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
              <SongOptionsMenu song={song} buttonClassName="grid size-8 place-items-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeaturedSection;
