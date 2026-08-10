import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Album } from "@/types";
import { Button } from "@/components/ui/button";
import { AlbumOptionsMenu } from "@/components/AlbumOptionsMenu";

type AlbumGridProps = {
    title: string;
    albums: Album[];
    isLoading: boolean;
};

const AlbumGrid = ({ title, albums, isLoading }: AlbumGridProps) => {
    const navigate = useNavigate();

    if (isLoading && (!albums || albums.length === 0)) {
        return (
            <div className="mb-6 sm:mb-8">
                <div className="h-6 sm:h-7 w-40 sm:w-48 bg-secondary/50 rounded mb-3 sm:mb-4 animate-pulse" />
                <div className="flex gap-3 lg:grid lg:grid-cols-4 xl:grid-cols-5 overflow-hidden">
                    {[...Array(5)].map((_, i) => (
                        <div
                            key={i}
                            className="flex-shrink-0 w-32 sm:w-40 lg:w-auto"
                        >
                            <div className="bg-secondary/50 rounded-lg p-3 sm:p-4 animate-pulse">
                                <div className="aspect-square bg-secondary rounded mb-2" />
                                <div className="h-4 bg-secondary rounded mb-2" />
                                <div className="h-3 bg-secondary rounded w-2/3" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

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
                {albums.map((album, index) => (
                    <motion.div
                        key={album.id}
                        initial={{ opacity: 0 }}
                        whileInView={{
                            opacity: 1,
                            transition: {
                                duration: 0.5,
                                delay: index * 0.1
                            }
                        }}
                        viewport={{ once: true, amount: 0.3 }}
                        className="bg-card/50 p-3 lg:p-4 rounded-lg cursor-pointer hover:bg-secondary/50
                                 transition-all duration-200 group border border-border/50 
                                 shadow-sm hover:shadow-md relative"
                        onClick={() => navigate(`/album/${album.id}`)}
                    >
                        <div className="relative mb-2 lg:mb-3 aspect-square rounded-lg overflow-hidden 
                                      shadow-lg bg-background">
                            <img
                                src={album.image?.[2]?.url || album.imageUrl}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover transition-transform 
                                         duration-300 group-hover:scale-105"
                            />
                            <div className="absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                              <AlbumOptionsMenu album={album} buttonClassName="grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur-md hover:bg-black hover:scale-105 shadow-md border border-white/10 transition-all" />
                            </div>
                        </div>
                        <p className="font-medium truncate text-foreground mb-1 text-sm lg:text-base">
                            {album.name || album.title}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                            {album.year || album.releaseYear}
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
                    {albums.map((album) => (
                        <div
                            key={album.id}
                            className="bg-card/50 p-2.5 sm:p-3 rounded-lg cursor-pointer hover:bg-secondary/50
                                     transition-all duration-200 group border border-border/50 
                                     shadow-sm hover:shadow-md flex-shrink-0 w-32 sm:w-40 touch-manipulation relative"
                            onClick={() => navigate(`/album/${album.id}`)}
                        >
                            <div className="relative mb-2 aspect-square rounded-lg overflow-hidden 
                                          shadow-lg bg-background">
                                <img
                                    src={album.image?.[2]?.url || album.imageUrl}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover transition-transform 
                                             duration-300 group-hover:scale-105"
                                />
                                <div className="absolute top-1.5 right-1.5 z-20" onClick={(e) => e.stopPropagation()}>
                                  <AlbumOptionsMenu album={album} buttonClassName="grid size-7 place-items-center rounded-full bg-black/70 text-white backdrop-blur-md hover:bg-black hover:scale-105 shadow-md border border-white/10 transition-all" />
                                </div>
                            </div>
                            <p className="font-medium truncate text-foreground text-xs sm:text-sm mb-1">
                                {album.name || album.title}
                            </p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                                {album.year || album.releaseYear}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AlbumGrid;