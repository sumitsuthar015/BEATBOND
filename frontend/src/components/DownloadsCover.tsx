import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Song } from "@/types";

/**
 * The Downloads playlist cover: a framed picture of what you've saved (a 2×2
 * grid once there are four covers) on a green backdrop with a download badge.
 */
export const DownloadsCover = ({ songs, className }: { songs: Song[]; className?: string }) => {
  const covers = [...new Set(songs.map((song) => song.imageUrl).filter(Boolean))].slice(0, 4);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-600 to-sky-800 shadow-lg", className)}>
      <span className="pointer-events-none absolute -left-1/4 -top-1/4 size-3/4 rounded-full bg-white/15 blur-2xl" aria-hidden />
      {/* Insets (not padding) so the frame scales with the cover itself: padding
          percentages follow the parent's width. */}
      <div className="absolute inset-[11%] overflow-hidden rounded-xl bg-black/25 shadow-[0_8px_24px_rgb(0_0_0/0.35)] ring-[3px] ring-white/80">
        {covers.length >= 4 ? (
          <div className="grid size-full grid-cols-2 grid-rows-2">
            {covers.map((cover) => <img key={cover} src={cover} alt="" className="size-full object-cover" />)}
          </div>
        ) : covers.length ? (
          <img src={covers[0]} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <ArrowDown className="size-1/2 text-white/90" strokeWidth={2.5} />
          </div>
        )}
      </div>
      {covers.length > 0 && (
        <span className="absolute bottom-[5%] right-[5%] grid size-[26%] place-items-center rounded-full bg-emerald-500 text-white shadow-lg ring-[3px] ring-white/90">
          <ArrowDown className="size-1/2" strokeWidth={3} />
        </span>
      )}
    </div>
  );
};
