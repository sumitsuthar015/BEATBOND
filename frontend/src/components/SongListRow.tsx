import { ArrowDownCircle, Pause, Play, Trash2 } from "lucide-react";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";

type SongListRowProps = {
  song: Song;
  index: number;
  /** Plays this song, or pauses/resumes it when it's the one playing. */
  onPlay: () => void;
  /** Shows a small mark for songs saved for offline. */
  downloaded?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
};

/** A song in a list (downloads, liked songs, playlists). */
export const SongListRow = ({ song, index, onPlay, downloaded, onRemove, removeLabel }: SongListRowProps) => {
  const isCurrent = usePlayerStore((state) => state.currentSong?._id === song._id);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playingNow = isCurrent && isPlaying;

  return (
    <div className={cn("flex min-h-[68px] items-center gap-3 border-b px-3 transition-colors last:border-0", isCurrent && "bg-primary/[.06]")}>
      <span className="grid w-5 shrink-0 place-items-center text-xs text-muted-foreground">
        {playingNow ? <span className="now-playing-bars" aria-label="Playing"><i /><i /><i /></span> : index + 1}
      </span>
      <button type="button" onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <img src={song.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
        <span className="min-w-0">
          <span className={cn("block truncate text-sm font-semibold", isCurrent && "text-primary")}>{song.title}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {downloaded && <ArrowDownCircle className="size-3.5 shrink-0 text-green-500" aria-label="Downloaded" />}
            <span className="truncate">{song.artist}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onPlay}
        aria-label={playingNow ? `Pause ${song.title}` : `Play ${song.title}`}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full transition-colors",
          isCurrent ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-primary hover:bg-secondary",
        )}
      >
        {playingNow ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${song.title}`}
          title={removeLabel}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
      <SongOptionsMenu song={song} />
    </div>
  );
};
