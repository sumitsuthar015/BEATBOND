import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchLyricsForSong, toLines } from "@/lib/lyrics";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface LyricsPanelProps {
  className?: string;
  showHeader?: boolean;
}

/** A compact, Spotify-inspired lyrics card that follows the native audio element. */
export const LyricsPanel = ({ className, showHeader = true }: LyricsPanelProps) => {
  const song = usePlayerStore((state) => state.currentSong);
  const [lyrics, setLyrics] = useState("");
  const [hasTiming, setHasTiming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const activeLineRef = useRef<HTMLParagraphElement | null>(null);
  const lyricRequestRef = useRef(0);

  const fetchLyrics = useCallback(async () => {
    if (!song) return;
    const requestId = ++lyricRequestRef.current;
    setLoading(true);
    setError("");

    try {
      const result = await fetchLyricsForSong(song);
      if (requestId !== lyricRequestRef.current) return;
      setLyrics(result.text);
      setHasTiming(result.synced);
    } catch (err) {
      if (requestId !== lyricRequestRef.current) return;
      setError(err instanceof Error ? err.message : "Unable to load lyrics. Please try again.");
    } finally {
      if (requestId === lyricRequestRef.current) setLoading(false);
    }
  }, [song]);

  useEffect(() => { void fetchLyrics(); }, [fetchLyrics]);

  useEffect(() => {
    const audio = document.getElementById("global-audio-player") as HTMLAudioElement | null;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    updateTime();
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("seeked", updateTime);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("seeked", updateTime);
    };
  }, [song?._id]);

  const lines = useMemo(() => toLines(lyrics, hasTiming), [lyrics, hasTiming]);
  const activeIndex = useMemo(() => {
    // Without timestamps any highlight is a guess that rarely matches the
    // singing, so unsynced lyrics are shown as plain text instead.
    if (!hasTiming || !lines.length) return -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if ((lines[index].time ?? Infinity) <= currentTime) return index;
    }
    return -1;
  }, [currentTime, hasTiming, lines]);

  // Keep the current line in view in every LyricsPanel instance (desktop
  // sidebar and mobile now-playing). Users no longer need to chase lyrics.
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, song?._id]);

  return (
    <section id="lyrics-panel" className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 text-white backdrop-blur", className)}>
      {showHeader && (
        <header className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Lyrics</h2>
          <p className="mt-0.5 truncate text-xs text-zinc-400">
            {song ? `${song.title} · ${song.artist}` : "Choose a song to view lyrics"}
          </p>
        </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-custom">
        {!song ? (
          <p className="py-8 text-center text-sm text-zinc-400">Play a song to see its lyrics.</p>
        ) : loading ? (
          <div className="flex flex-col items-center py-10 text-sm text-zinc-400">
            <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
            Loading lyrics…
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</p>
            <Button onClick={fetchLyrics} variant="outline" className="w-full border-zinc-700 bg-zinc-800 text-white hover:bg-zinc-700">Try again</Button>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {!hasTiming && lines.length > 0 && (
              <p className="text-xs text-zinc-400">These lyrics aren't time-synced, so they won't follow the song.</p>
            )}
            {lines.map((line, index) => (
              <p
                key={`${line.text}-${index}`}
                ref={index === activeIndex ? activeLineRef : null}
                className={cn(
                  "text-base font-semibold leading-6 transition-colors duration-300 sm:text-lg sm:leading-7",
                  index === activeIndex ? "text-green-500" : "text-white"
                )}
              >
                {line.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
