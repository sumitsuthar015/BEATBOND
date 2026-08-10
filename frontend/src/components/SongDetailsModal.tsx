import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Heart,
  Share2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Plus,
  ChevronLeft,
  Download,
  ListMusic,
  Mic2,
  X,
} from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMusicStore } from "@/stores/useMusicStore";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { Slider } from "./ui/slider";
import { useEffect, useState, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "react-hot-toast";
import { useLyricsStore } from "@/stores/useLyricsStore";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";

interface SongDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SongDetailsModal = ({ isOpen, onClose }: SongDetailsModalProps) => {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrevious = usePlayerStore((state) => state.playPrevious);
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const queue = usePlayerStore((state) => state.queue);
  const removeFromQueue = usePlayerStore((state) => state.removeFromQueue);
  const playFromQueue = usePlayerStore((state) => state.playFromQueue);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const toggleLike = useMusicStore((state) => state.toggleLike);
  const songs = useMusicStore((state) => state.songs);
  const [volume] = useState(75);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const {
    lyrics,
    isLoading: isLoadingLyrics,
    error: lyricsError,
    fetchLyrics,
  } = useLyricsStore();
  const [isDownloading, setIsDownloading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isLiked = currentSong
    ? songs.find((s) => s._id === currentSong._id)?.isLiked
    : false;

  useEffect(() => {
    audioRef.current = document.querySelector("audio");
    const audio = audioRef.current;
    if (!audio || !isOpen) return;

    const updateProgress = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };

    audio.volume = volume / 100;
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("seeking", updateProgress);
    audio.addEventListener("seeked", updateProgress);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", updateProgress);
      audio.removeEventListener("seeking", updateProgress);
      audio.removeEventListener("seeked", updateProgress);
    };
  }, [isOpen, setDuration, setProgress, volume]);

  useEffect(() => {
    if (!videoRef.current || !currentSong?.videoUrl || !isOpen) return;

    const video = videoRef.current;
    video.load();

    if (isPlaying) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setVideoError(false);
            setIsVideoLoaded(true);
          })
          .catch((error) => {
            console.error("Video playback failed:", error);
            setVideoError(true);
          });
      }
    } else {
      video.pause();
    }

    return () => {
      video.pause();
    };
  }, [currentSong, isPlaying, isOpen]);

  useEffect(() => {
    if (currentSong && showLyrics) {
      fetchLyrics(currentSong);
    }
  }, [currentSong, showLyrics, fetchLyrics]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setProgress(time);
    }
  };

  const handleDownload = async () => {
    if (!currentSong?.audioUrl) return;

    try {
      setIsDownloading(true);
      const response = await fetch(currentSong.audioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentSong.title} - ${currentSong.artist}.mp3`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Download started!");
    } catch (error) {
      console.error("Error downloading song:", error);
      toast.error("Failed to download song. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (!currentSong) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogTitle className="sr-only">
          Now Playing: {currentSong.title} by {currentSong.artist}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Music player controls and song details for {currentSong.title}
        </DialogDescription>

        <DialogContent className="flex h-[100dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-none border-0 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-0 sm:h-[100dvh] sm:rounded-none">
          {/* Video Background */}
          {currentSong?.videoUrl && !videoError && (
            <div className="absolute inset-0 overflow-hidden">
              <video
                ref={videoRef}
                className="absolute w-full h-full object-cover"
                loop
                muted
                playsInline
                onLoadedData={() => setIsVideoLoaded(true)}
                onError={() => setVideoError(true)}
                style={{
                  filter: "blur(15px) brightness(0.3)",
                  transform: "scale(1.15)",
                }}
              >
                <source src={currentSong.videoUrl} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
            </div>
          )}

          {/* Fallback Background */}
          {(!currentSong?.videoUrl || !isVideoLoaded) && (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: `url(${currentSong.imageUrl})`,
                  filter: "blur(25px) brightness(0.3)",
                  transform: "scale(1.2)",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/40" />
            </>
          )}

          {/* Header */}
          <div className="relative flex h-14 shrink-0 items-center justify-between px-3 sm:px-4 backdrop-blur-md bg-white/5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hover:bg-white/20 text-white hover:scale-110 transition-all duration-200"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-wide">
              Now Playing
            </h2>
            <Button
              variant="ghost"
              onClick={() => setShowQueue(true)}
              aria-label={`Open queue${queue.length ? `, ${queue.length} songs` : ""}`}
              className="now-playing-queue-button text-white hover:bg-white/20 hover:scale-105 transition-all duration-200"
            >
              <ListMusic className="h-6 w-6" />
              {queue.length > 0 && (
                <span className="now-playing-queue-count">
                  {queue.length}
                </span>
              )}
            </Button>
          </div>

          {/* Main Content */}
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-between gap-2 overflow-hidden px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
            {/* Album Art */}
            <div className="relative group">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 blur-xl opacity-75 group-hover:opacity-100 animate-pulse transition-opacity duration-300" />

              <div
                className={cn(
                  "relative h-[min(36vh,15rem)] w-[min(36vh,15rem)] rounded-full overflow-hidden shadow-2xl ring-4 ring-white/20 transition-all duration-500 sm:h-[min(38vh,18rem)] sm:w-[min(38vh,18rem)]",
                  isPlaying && "animate-spin-slow"
                )}
              >
                {currentSong?.videoUrl && !videoError ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    loop
                    muted
                    playsInline
                    onError={() => setVideoError(true)}
                  >
                    <source src={currentSong.videoUrl} type="video/mp4" />
                  </video>
                ) : (
                  <img
                    src={currentSong.imageUrl}
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <button
                onClick={togglePlay}
                className="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-md opacity-0 transition-all duration-300 hover:scale-110 hover:bg-white/20 group-hover:opacity-100"
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8 text-white fill-white" />
                ) : (
                  <Play className="ml-1 h-8 w-8 text-white fill-white" />
                )}
              </button>
            </div>

            {/* Song Info */}
            <div className="max-w-md space-y-1 text-center sm:space-y-1.5">
              <h1 className="line-clamp-2 text-2xl font-bold text-white drop-shadow-lg sm:text-3xl">
                {currentSong.title}
              </h1>
              <p className="text-sm font-medium text-white/80 drop-shadow sm:text-base">
                {currentSong.artist}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-2xl space-y-1.5 px-2 sm:px-0">
              <Slider
                value={[progress]}
                max={duration || 100}
                step={1}
                onValueChange={handleSeek}
                className="cursor-pointer [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-2 [&_[role=slider]]:border-green-500 [&_[role=slider]]:bg-white [&_[role=slider]]:shadow-lg [&_[role=slider]]:transition-transform hover:[&_[role=slider]]:scale-125"
              />
              <div className="flex justify-between text-xs sm:text-sm text-white/70 font-medium">
                <span>{formatTime(progress)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white/70 transition-all duration-200 hover:scale-110 hover:bg-white/10 hover:text-white"
              >
                <Shuffle className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={playPrevious}
                className="h-10 w-10 text-white transition-all duration-200 hover:scale-110 hover:bg-white/10"
              >
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button
                variant="default"
                size="icon"
                onClick={togglePlay}
                className="h-16 w-16 rounded-full bg-white text-black shadow-2xl transition-all duration-200 hover:scale-105 hover:bg-white/90 active:scale-95 sm:h-[4.5rem] sm:w-[4.5rem]"
              >
                {isPlaying ? (
                  <Pause className="h-7 w-7 sm:h-8 sm:w-8" />
                ) : (
                  <Play className="ml-1 h-7 w-7 sm:h-8 sm:w-8" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={playNext}
                className="h-10 w-10 text-white transition-all duration-200 hover:scale-110 hover:bg-white/10"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white/70 transition-all duration-200 hover:scale-110 hover:bg-white/10 hover:text-white"
              >
                <Repeat className="h-4 w-4" />
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="grid w-full max-w-2xl grid-cols-5 gap-1 px-1 sm:gap-2 sm:px-0">
              <Button
                variant="ghost"
                onClick={() => toggleLike(currentSong._id)}
                className={cn(
                  "h-auto flex flex-col items-center gap-1 py-1.5 text-xs hover:bg-white/10 transition-all duration-200 hover:scale-105 sm:py-2",
                  isLiked ? "text-green-500" : "text-white/80"
                )}
              >
                <Heart
                  className={cn("h-5 w-5", isLiked && "fill-current")}
                />
                <span className="text-xs font-medium">Like</span>
              </Button>

              <Button
                variant="ghost"
                onClick={handleDownload}
                disabled={isDownloading}
                className="h-auto flex flex-col items-center gap-1 py-1.5 text-xs text-white/80 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-white disabled:opacity-50 sm:py-2"
              >
                <Download className="h-5 w-5" />
                <span className="text-xs font-medium">
                  {isDownloading ? "..." : "Save"}
                </span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-auto flex flex-col items-center gap-1 py-1.5 text-xs text-white/80 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-white sm:py-2"
                  >
                    <Plus className="h-5 w-5" />
                    <span className="text-xs font-medium">Add</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-zinc-900/95 backdrop-blur-md border-white/10">
                  <DropdownMenuItem
                    onClick={() => toggleLike(currentSong._id)}
                    className="text-white hover:bg-white/10"
                  >
                    <Heart className="mr-2 h-4 w-4" />
                    Add to Liked Songs
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-white hover:bg-white/10">
                    <ListMusic className="mr-2 h-4 w-4" />
                    Add to Playlist
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {currentSong && (
                <ShareToMessageDialog
                  message={`Check out ${currentSong.title} by ${currentSong.artist} on BeatBond:\n${window.location.href}`}
                  sharedContent={{
                    type: "song",
                    title: currentSong.title,
                    subtitle: currentSong.artist,
                    imageUrl: currentSong.imageUrl,
                    href: "/",
                    song: currentSong,
                  }}
                  trigger={
                    <Button
                      variant="ghost"
                      className="h-auto flex flex-col items-center gap-1 py-1.5 text-xs text-white/80 transition-all duration-200 hover:scale-105 hover:bg-white/10 hover:text-white sm:py-2"
                    >
                      <Share2 className="h-5 w-5" />
                      <span className="text-xs font-medium">Share</span>
                    </Button>
                  }
                />
              )}

              <Button
                variant="ghost"
                onClick={() => setShowLyrics(!showLyrics)}
                className={cn(
                  "col-span-1 h-auto flex flex-col items-center gap-1 py-1.5 text-xs hover:bg-white/10 transition-all duration-200 hover:scale-105 sm:py-2",
                  showLyrics ? "text-green-500" : "text-white/80"
                )}
              >
                <Mic2 className="h-5 w-5" />
                <span className="text-xs font-medium">Lyrics</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lyrics Sheet */}
      <Sheet open={showLyrics} onOpenChange={setShowLyrics}>
        <SheetContent
          side="bottom"
          className="h-[85vh] sm:h-[90vh] bg-gradient-to-b from-zinc-900 to-black border-t border-white/10 backdrop-blur-xl"
        >
          <SheetHeader className="pb-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl sm:text-2xl text-white font-bold">
                {currentSong?.title} - Lyrics
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowLyrics(false)}
                className="text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </SheetHeader>

          {isLoadingLyrics ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
              <p className="text-white/70 text-sm">Loading lyrics...</p>
            </div>
          ) : lyricsError ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6 px-4">
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 max-w-md w-full">
                <p className="text-red-400 font-semibold text-center mb-2">
                  Failed to load lyrics
                </p>
                <p className="text-white/60 text-sm text-center">{lyricsError}</p>
              </div>
              <Button
                onClick={() => currentSong && fetchLyrics(currentSong)}
                className="bg-green-500 hover:bg-green-600 text-white transition-all duration-200"
              >
                Try Again
              </Button>
            </div>
          ) : lyrics ? (
            <ScrollArea className="h-[calc(85vh-8rem)] sm:h-[calc(90vh-8rem)] pr-4">
              <div className="space-y-4 py-4">
                {lyrics.split("\n").map((line, index) => (
                  <p
                    key={index}
                    className="text-white/90 text-base sm:text-lg leading-relaxed text-center hover:text-white transition-colors duration-200"
                  >
                    {line || "\u00A0"}
                  </p>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-6 px-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 max-w-md w-full">
                <Mic2 className="h-12 w-12 text-white/40 mx-auto mb-4" />
                <p className="text-white/70 font-semibold text-center mb-2">
                  No lyrics available
                </p>
                <p className="text-white/50 text-sm text-center">
                  We couldn't find lyrics for this song
                </p>
              </div>
              <Button
                onClick={() => currentSong && fetchLyrics(currentSong)}
                className="bg-green-500 hover:bg-green-600 text-white transition-all duration-200"
              >
                Try Again
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Queue Sheet */}
      <Sheet open={showQueue} onOpenChange={setShowQueue}>
        <SheetContent
          side="right"
          className="w-full sm:w-[400px] bg-gradient-to-b from-zinc-900 to-black border-l border-white/10 backdrop-blur-xl"
        >
          <SheetHeader className="pb-4 border-b border-white/10">
            <SheetTitle className="text-xl sm:text-2xl text-white font-bold flex items-center gap-2">
              <ListMusic className="h-6 w-6 text-primary" />
              Queue ({queue.length})
            </SheetTitle>
          </SheetHeader>

          {queue.length > 0 ? (
            <ScrollArea className="h-[calc(100vh-8rem)] mt-4">
              <div className="space-y-2 pr-4">
                {queue.map((song, index) => {
                  const isCurrent = currentSong?._id === song._id && currentIndex === index;
                  return (
                    <div
                      key={`${song._id}-${index}`}
                      onClick={() => playFromQueue(index)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 group border",
                        isCurrent
                          ? "bg-primary/20 border-primary/40 text-primary font-medium"
                          : "bg-white/5 border-transparent hover:bg-white/10 text-white"
                      )}
                    >
                      <div className="relative flex-shrink-0">
                        <img
                          src={song.imageUrl}
                          alt={song.title}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                        <div
                          className={cn(
                            "absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center transition-opacity",
                            isCurrent ? "opacity-100 bg-black/60" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          {isCurrent && isPlaying ? (
                            <div className="flex items-end gap-0.5 h-4">
                              <span className="w-1 bg-primary rounded-full animate-[bounce_1s_infinite_100ms] h-full" />
                              <span className="w-1 bg-primary rounded-full animate-[bounce_1s_infinite_300ms] h-2/3" />
                              <span className="w-1 bg-primary rounded-full animate-[bounce_1s_infinite_200ms] h-full" />
                            </div>
                          ) : (
                            <Play className="h-5 w-5 text-white fill-current" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-medium text-sm truncate", isCurrent ? "text-primary" : "text-white")}>
                          {song.title}
                        </p>
                        <p className="text-white/60 text-xs truncate">{song.artist}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(index);
                        }}
                        className="text-white/60 hover:text-red-400 hover:bg-red-400/10 flex-shrink-0 transition-all duration-200"
                        title="Remove from queue"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-4 py-12">
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 max-w-sm">
                <ListMusic className="h-16 w-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/70 font-semibold text-center mb-2">
                  No songs in queue
                </p>
                <p className="text-white/50 text-sm text-center">
                  Add songs to your queue to see them here
                </p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <style>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }
      `}</style>
    </>
  );
};
