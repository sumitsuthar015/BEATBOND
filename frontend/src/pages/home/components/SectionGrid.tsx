import { Song } from "@/types";
import SectionGridSkeleton from "./SectionGridSkeleton";
import { Button } from "@/components/ui/button";
import PlayButton from "./PlayButton";
import { motion } from "framer-motion";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";

type SectionGridProps = {
  title: string;
  songs: Song[];
  isLoading: boolean;
};

const SectionGrid = ({ songs, title, isLoading }: SectionGridProps) => {
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  if (isLoading && (!songs || songs.length === 0)) return <SectionGridSkeleton />;

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground tracking-tight">
          {title}
        </h2>
        <Button
          variant="link"
          className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors p-0 h-auto"
        >
          Show all
        </Button>
      </div>

      {/* Desktop Grid (lg and above) */}
      <div className="hidden lg:grid lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
        {songs.map((song, index) => (
          <motion.div
            key={song._id}
            initial={{ opacity: 0 }}
            whileInView={{
              opacity: 1,
              transition: {
                duration: 0.5,
                delay: index * 0.1
              }
            }}
            viewport={{ once: true, amount: 0.3 }}
          onClick={() => playAlbum(songs, index)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => event.key === "Enter" && playAlbum(songs, index)}
          className="bg-card/50 p-3 lg:p-4 rounded-lg hover:bg-secondary/50
                     transition-all duration-200 group cursor-pointer
                     border border-border/50 shadow-sm hover:shadow-md relative"
          >
            <div className="relative mb-3 lg:mb-4">
              <div className="aspect-square rounded-lg shadow-lg overflow-hidden bg-background">
                <img
                  src={song.imageUrl}
                  alt={song.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover transition-transform duration-300 
                           group-hover:scale-105"
                />
              </div>
              <PlayButton song={song} />
              <div className="absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                <SongOptionsMenu song={song} buttonClassName="grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur-md hover:bg-black hover:scale-105 shadow-md border border-white/10 transition-all" />
              </div>
            </div>
            <h3 className="font-medium mb-1 lg:mb-2 truncate text-foreground text-sm lg:text-base">
              {song.title}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {song.artist}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Mobile & Tablet Horizontal Scroll */}
      <div className="lg:hidden">
        <div
          className="flex gap-2 sm:gap-3 pb-4 overflow-x-auto scroll-smooth 
                   scrollbar-custom horizontal-scroll-container"
        >
          {songs.map((song, index) => (
            <div
              key={song._id}
              onClick={() => playAlbum(songs, index)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && playAlbum(songs, index)}
              className="bg-card/50 p-2.5 sm:p-3 rounded-lg hover:bg-secondary/50 
                       transition-all duration-200 group cursor-pointer
                       border border-border/50 shadow-sm hover:shadow-md
                       flex-shrink-0 w-32 sm:w-40 touch-manipulation relative"
            >
              <div className="relative mb-2 sm:mb-3">
                <div className="aspect-square rounded-lg shadow-lg overflow-hidden bg-background">
                  <img
                    loading="lazy"
                    decoding="async"
                    src={song.imageUrl}
                    alt={song.title}
                    className="w-full h-full object-cover transition-transform duration-300 
                             group-hover:scale-105"
                  />
                </div>
                <PlayButton song={song} size="medium" />
                <div className="absolute top-1.5 right-1.5 z-20" onClick={(e) => e.stopPropagation()}>
                  <SongOptionsMenu song={song} buttonClassName="grid size-7 place-items-center rounded-full bg-black/70 text-white backdrop-blur-md hover:bg-black hover:scale-105 shadow-md border border-white/10 transition-all" />
                </div>
              </div>
              <h3 className="font-medium mb-1 truncate text-foreground text-xs sm:text-sm">
                {song.title}
              </h3>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                {song.artist}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SectionGrid;
