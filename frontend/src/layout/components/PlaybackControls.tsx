import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { usePlayerStore } from "@/stores/usePlayerStore";
import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  MoreHorizontal,
  Heart,
  ListPlus,
  ChevronDown,
  Mic2,
  X,
  Volume1,
  Plus,
  Download,
  CircleCheck,
  Loader2,
  ListVideo,
  ListMusic,
  MessageSquare,
  Disc3,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useCallback, useEffect, useState } from "react";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SongDetailsModal } from "@/components/SongDetailsModal";
import { SongCommentsModal } from "@/components/SongCommentsModal";
import { LyricsPanel } from "./LyricsPanel";
import { useSongDownload } from "@/hooks/useOfflineDownloads";
import { fetchLyricsForSong, lyricsAsPlainText } from "@/lib/lyrics";

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

// Extract dominant color from image
const extractColor = (imageUrl: string, callback: (color: string) => void) => {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = imageUrl;

  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx?.drawImage(img, 0, 0);

    try {
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData?.data;

      let r = 0, g = 0, b = 0;
      const pixelCount = data ? data.length / 4 : 0;

      for (let i = 0; data && i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }

      r = Math.floor(r / pixelCount);
      g = Math.floor(g / pixelCount);
      b = Math.floor(b / pixelCount);

      callback(`rgb(${r}, ${g}, ${b})`);
    } catch {
      callback('rgb(83, 83, 83)');
    }
  };

  img.onerror = () => {
    callback('rgb(83, 83, 83)');
  };
};

// Lyrics Modal Component
const LyricsModal = ({
  isOpen,
  onClose,
  song,
}: {
  isOpen: boolean;
  onClose: () => void;
  song: any;
}) => {
  const [lyrics, setLyrics] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLyrics = useCallback(async () => {
    if (!song) return;

    setLoading(true);
    setError("");
    setLyrics("");

    try {
      const result = await fetchLyricsForSong(song);
      // Synced lyrics carry [mm:ss] timestamps; this popup shows the words only.
      setLyrics(lyricsAsPlainText(result));
    } catch (err) {
      console.error("Lyrics fetch error:", err);
      setError(err instanceof Error ? err.message : "Unable to load lyrics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [song]);

  useEffect(() => {
    if (isOpen) {
      fetchLyrics();
    }
  }, [fetchLyrics, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center">
      <div className="bg-gradient-to-b from-zinc-900 to-black w-full md:w-[600px] md:max-h-[80vh] max-h-[90vh] rounded-t-2xl md:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-zinc-800">
          <div>
            <h2 className="text-2xl font-bold text-white">Lyrics</h2>
            <p className="text-sm text-zinc-400 mt-1">
              {song?.title} · {song?.artist}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)] md:max-h-[calc(80vh-80px)] scrollbar-custom">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-zinc-400">Loading lyrics...</p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
                {error}
              </div>
              <Button
                onClick={fetchLyrics}
                variant="outline"
                className="w-full bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
              >
                Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-6 text-white leading-relaxed">
                {lyrics.split("\n").map((line, idx) => (
                  <p key={idx} className="text-lg">
                    {line}
                  </p>
                ))}
              </div>
              <div className="pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-500">Lyrics provided by LRCLIB or JioSaavn</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const PlaybackControls = () => {
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const playNext = usePlayerStore((state) => state.playNext);
  const playPrevious = usePlayerStore((state) => state.playPrevious);
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const toggleShuffle = usePlayerStore((state) => state.toggleShuffle);
  const cycleRepeat = usePlayerStore((state) => state.cycleRepeat);
  const isShuffle = usePlayerStore((state) => state.isShuffle);
  const repeatMode = usePlayerStore((state) => state.repeatMode);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const addPlayNext = usePlayerStore((state) => state.addPlayNext);
  const queue = usePlayerStore((state) => state.queue);
  const currentIndex = usePlayerStore((state) => state.currentIndex);
  const playFromQueue = usePlayerStore((state) => state.playFromQueue);

  const playlists = usePlaylistStore((state) => state.playlists);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  const addSongToPlaylist = usePlaylistStore((state) => state.addSongToPlaylist);
  const fetchPlaylists = usePlaylistStore((state) => state.fetchPlaylists);

  const [volume, setVolume] = useState(75);
  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(75);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSongDetailsOpen, setIsSongDetailsOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [bgColor, setBgColor] = useState("rgb(83, 83, 83)");
  const isLiked = Boolean(currentSong?.isLiked);
  const handleLyricsOpen = () => {
    if (isMobile) setIsLyricsOpen(true);
    else document.getElementById("lyrics-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    void fetchPlaylists();
  }, [fetchPlaylists]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Extract color from album art
  useEffect(() => {
    if (currentSong?.imageUrl) {
      extractColor(currentSong.imageUrl, (color) => {
        setBgColor(color);
      });
    }
  }, [currentSong?.imageUrl]);

  // Player owns progress/duration; controls only issue commands to the one
  // persistent audio element.
  useEffect(() => {
    const audio = document.getElementById("global-audio-player") as HTMLAudioElement | null;
    if (audio) {
      audio.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted, currentSong]);

  const handleSeek = (value: number[]) => {
    const time = value[0];
    const audio = document.getElementById("global-audio-player") as HTMLAudioElement | null;
    if (audio) {
      audio.currentTime = time;
    }
    setProgress(time);
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (newVolume === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      handleVolumeChange([previousVolume]);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
      handleVolumeChange([0]);
    }
  };

  const handleAddToLikedSongs = () => {
    if (!currentSong) return;
    void useMusicStore.getState().toggleLike(currentSong._id, currentSong);
  };

  const handleCreateAndAddToPlaylist = () => {
    if (newPlaylistName.trim() && currentSong) {
      void createPlaylist(newPlaylistName.trim(), "", currentSong);
      setNewPlaylistName("");
      setIsDialogOpen(false);
    }
  };

  const handleAddToPlaylist = (playlistId: string) => {
    if (!currentSong) return;
    void addSongToPlaylist(playlistId, currentSong);
  };

  // Shared with the song menus: shows saved / saving and toggles the download.
  const download = useSongDownload(currentSong);
  const isDownloading = download.downloading;
  const handleDownload = () => void download.toggle();
  const downloadLabel = download.downloading ? "Downloading…" : download.downloaded ? "Remove download" : "Download";
  const downloadIcon = (className: string) => download.downloading
    ? <Loader2 className={`${className} animate-spin`} />
    : download.downloaded
      ? <CircleCheck className={`${className} text-primary`} />
      : <Download className={className} />;

  if (!currentSong) {
    return (
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 border-t border-zinc-800 bg-black px-4 py-6 md:bottom-0">
        <p className="text-zinc-500 text-center">No song playing</p>
      </div>
    );
  }

  // Mobile Expanded View (Full Screen)
  if (isMobile && isExpanded) {
    return (
      <div
        className="fixed inset-0 z-50 overflow-y-auto"
        style={{
          background: `linear-gradient(180deg, ${bgColor} 0%, rgb(18, 18, 18) 50%, rgb(0, 0, 0) 100%)`
        }}
      >
        <div className="min-h-screen p-4 pb-24 sm:p-6 sm:pb-32">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <button
              onClick={() => setIsExpanded(false)}
              className="text-white hover:scale-110 transition-transform"
            >
              <ChevronDown className="w-8 h-8" />
            </button>
            <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
              Playing from Playlist
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-white hover:scale-110 transition-transform">
                  <MoreHorizontal className="w-6 h-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-zinc-800 border-zinc-700 text-white w-56"
              >
                <DropdownMenuItem
                  onClick={handleLyricsOpen}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <Mic2 className="w-4 h-4 mr-2" />
                  View Lyrics
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    window.requestAnimationFrame(() => setIsCommentsOpen(true));
                  }}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Comments
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  {downloadIcon("w-4 h-4 mr-2")}
                  {downloadLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => currentSong && addPlayNext(currentSong)}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <ListVideo className="w-4 h-4 mr-2" />
                  Play Next
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => currentSong && addToQueue(currentSong)}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <ListMusic className="w-4 h-4 mr-2" />
                  Add to Queue
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-700" />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-zinc-300 focus:text-white focus:bg-zinc-700">
                    <ListPlus className="w-4 h-4 mr-2" />
                    Add to Playlist
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-zinc-800 border-zinc-700">
                    {playlists.map((playlist) => (
                      <DropdownMenuItem
                        key={playlist.id}
                        onClick={() => handleAddToPlaylist(playlist.id)}
                        className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                      >
                        {playlist.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setIsDialogOpen(true);
                      }}
                      className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Playlist
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Album Art */}
          <div className="flex justify-center mb-5">
            <div className="size-[min(72vw,34dvh)] max-w-[320px] shadow-2xl rounded-lg overflow-hidden">
              <img
                src={currentSong.imageUrl || "/api/placeholder/400/400"}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onClick={() => setIsSongDetailsOpen(true)}
              />
            </div>
          </div>

          {/* Song Info */}
          <div className="mb-5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="overflow-hidden mb-2">
                <h1
                  className="text-2xl font-bold text-white cursor-pointer hover:underline whitespace-nowrap animate-marquee"
                  onClick={() => setIsSongDetailsOpen(true)}
                  style={{
                    animation: currentSong.title.length > 20 ? 'marquee 10s linear infinite' : 'none',
                  }}
                >
                  {currentSong.title}
                </h1>
              </div>
              <p className="truncate text-zinc-400 text-base">{currentSong.artist}</p>
            </div>
            <button
              type="button"
              onClick={handleAddToLikedSongs}
              aria-label={isLiked ? "Remove from Liked Songs" : "Add to Liked Songs"}
              aria-pressed={isLiked}
              className="grid size-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/10"
            >
              <Heart className={`size-6 transition-colors ${isLiked ? "fill-[#B266FF] text-[#B266FF]" : "text-white"}`} />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5 mb-6">
            <Slider
              value={[progress]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer [&>span:first-child]:bg-white [&>span:first-child>span]:bg-[#B266FF] [&_[role=slider]]:rounded-full [&_[role=slider]]:bg-[#B266FF] [&_[role=slider]]:border-0 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:shadow-lg hover:[&_[role=slider]]:scale-110"
            />
            <div className="flex justify-between text-xs text-zinc-400 font-medium">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-6 px-3">
            <button onClick={toggleShuffle} aria-pressed={isShuffle} className={`transition-colors ${isShuffle ? "text-primary" : "text-zinc-400 hover:text-white"}`}>
              <Shuffle className="w-6 h-6" />
            </button>
            <button
              onClick={playPrevious}
              className="text-white hover:scale-110 transition-transform"
            >
              <SkipBack className="w-8 h-8 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="bg-white text-black rounded-full p-3 hover:scale-110 transition-transform shadow-xl"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>
            <button
              onClick={playNext}
              className="text-white hover:scale-110 transition-transform"
            >
              <SkipForward className="w-8 h-8 fill-current" />
            </button>
            <button onClick={cycleRepeat} aria-label={`Repeat: ${repeatMode}`} className={`transition-colors ${repeatMode !== "off" ? "text-primary" : "text-zinc-400 hover:text-white"}`}>
              <Repeat className="w-6 h-6" />
            </button>
          </div>

          {/* Mobile lyrics replace the volume controls, like Spotify's now-playing screen. */}
          <LyricsPanel className="h-[300px]" />

          <section className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4 text-white backdrop-blur">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#B266FF] to-[#6D28D9]">
                <Disc3 className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Artist</p>
                <p className="truncate font-semibold">{currentSong.artist}</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">
              You’re listening to <span className="font-medium text-white">{currentSong.title}</span> by {currentSong.artist}.
            </p>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4 text-white backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Up next</h2>
              <span className="text-xs text-zinc-400">{Math.max(0, queue.length - currentIndex - 1)} songs</span>
            </div>
            {queue.slice(currentIndex + 1, currentIndex + 5).length ? (
              <div className="space-y-1">
                {queue.slice(currentIndex + 1, currentIndex + 5).map((song, index) => {
                  const songIndex = currentIndex + index + 1;
                  return (
                    <button
                      key={`${song._id}-${songIndex}`}
                      type="button"
                      onClick={() => playFromQueue(songIndex)}
                      className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition hover:bg-white/10"
                    >
                      <img src={song.imageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{song.title}</span>
                        <span className="block truncate text-xs text-zinc-400">{song.artist}</span>
                      </span>
                      <Play className="size-4 shrink-0 text-zinc-300" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-white/5 px-3 py-4 text-sm text-zinc-400">
                Your queue is empty. Play an album or playlist to line up more songs.
              </p>
            )}
          </section>
        </div>

        {/* Modals */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle>Create New Playlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="playlistName">Playlist Name</Label>
                <Input
                  id="playlistName"
                  placeholder="My Playlist"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateAndAddToPlaylist();
                    }
                  }}
                  className="bg-zinc-800 border-zinc-700 text-white focus:border-primary"
                />
              </div>
              <Button
                onClick={handleCreateAndAddToPlaylist}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
              >
                Create and Add Song
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <SongDetailsModal
          isOpen={isSongDetailsOpen}
          onClose={() => setIsSongDetailsOpen(false)}
        />

        <SongCommentsModal song={currentSong} open={isCommentsOpen} onOpenChange={setIsCommentsOpen} />

        <LyricsModal
          isOpen={isLyricsOpen}
          onClose={() => setIsLyricsOpen(false)}
          song={currentSong}
        />

        <style>{`
          @keyframes marquee-compact {
            0% { transform: translateX(0); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>
    );
  }

  // Compact Mobile View (Bottom Bar)
  if (isMobile) {
    return (
      <>
        <div
          className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] left-0 right-0 z-40 m-auto w-[90%] rounded-md"
          style={{
            background: `linear-gradient(90deg, ${bgColor} 0%, rgb(30, 30, 30) 100%)`
          }}
        >
          <div className="px-2 pb-1 pt-1">
            <div
              className="flex min-h-12 cursor-pointer items-center gap-2.5"
              onClick={() => setIsExpanded(true)}
            >
              <img
                src={currentSong.imageUrl || "/api/placeholder/48/48"}
                alt={currentSong.title}
                className="size-9 shrink-0 rounded object-cover shadow-lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {currentSong.title}
                </p>
                <p className="truncate text-xs text-zinc-300">
                  {currentSong.artist}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors hover:bg-white/10"
              >
                {isPlaying ? (
                  <Pause className="size-6 fill-current" />
                ) : (
                  <Play className="ml-0.5 size-6 fill-current" />
                )}
              </button>
            </div>
            <div
              className="pt-0"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Slider
                value={[progress]}
                max={duration || 100}
                step={1}
                onValueChange={handleSeek}
                aria-label="Seek through song"
                className="h-4 cursor-pointer [&>span:first-child]:h-1 [&>span:first-child]:bg-white [&>span:first-child>span]:bg-[#B266FF] [&_[role=slider]]:size-2.5 [&_[role=slider]]:rounded-full [&_[role=slider]]:border-0 [&_[role=slider]]:bg-[#B266FF]"
              />
            </div>
          </div>
        </div>

        <SongDetailsModal
          isOpen={isSongDetailsOpen}
          onClose={() => setIsSongDetailsOpen(false)}
        />

        <SongCommentsModal song={currentSong} open={isCommentsOpen} onOpenChange={setIsCommentsOpen} />

        <LyricsModal
          isOpen={isLyricsOpen}
          onClose={() => setIsLyricsOpen(false)}
          song={currentSong}
        />
      </>
    );
  }

  // Desktop View
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-zinc-800 px-4 py-3 z-40">
        <div className="flex items-center justify-between gap-4 max-w-screen-2xl mx-auto">
          {/* Left: Song Details */}
          <div className="flex items-center gap-3 min-w-[180px] w-[30%]">
            <img
              src={currentSong.imageUrl || "/api/placeholder/56/56"}
              alt={currentSong.title}
              className="w-14 h-14 rounded object-cover shadow-lg cursor-pointer hover:scale-105 transition-transform"
              onClick={() => setIsSongDetailsOpen(true)}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-white text-sm font-semibold truncate cursor-pointer hover:underline"
                onClick={() => setIsSongDetailsOpen(true)}
              >
                {currentSong.title}
              </p>
              <p className="text-zinc-400 text-xs truncate">
                {currentSong.artist}
              </p>
            </div>
            <button
              onClick={handleAddToLikedSongs}
              className="text-zinc-400 hover:text-white transition-colors hover:scale-110"
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-primary text-primary' : ''}`} />
            </button>
          </div>

          {/* Center: Player Controls */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-[722px]">
            <div className="flex items-center gap-4">
              <button onClick={toggleShuffle} aria-pressed={isShuffle} className={`transition-colors hover:scale-110 ${isShuffle ? "text-primary" : "text-zinc-400 hover:text-white"}`}>
                <Shuffle className="w-4 h-4" />
              </button>
              <button
                onClick={playPrevious}
                className="text-zinc-400 hover:text-white transition-colors hover:scale-110"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                className="bg-white text-black rounded-full p-2 hover:scale-105 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={playNext}
                className="text-zinc-400 hover:text-white transition-colors hover:scale-110"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button onClick={cycleRepeat} aria-label={`Repeat: ${repeatMode}`} className={`transition-colors hover:scale-110 ${repeatMode !== "off" ? "text-primary" : "text-zinc-400 hover:text-white"}`}>
                <Repeat className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 w-full">
              <span className="text-xs text-zinc-400 font-medium w-10 text-right">
                {formatTime(progress)}
              </span>
              <Slider
                value={[progress]}
                max={duration || 100}
                step={1}
                onValueChange={handleSeek}
                className="flex-1 cursor-pointer [&>span:first-child]:h-1 [&>span:first-child]:bg-white [&>span:first-child>span]:bg-[#B266FF] [&_[role=slider]]:rounded-full [&_[role=slider]]:bg-[#B266FF] [&_[role=slider]]:border-0 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:opacity-0 hover:[&_[role=slider]]:opacity-100 [&_[role=slider]]:shadow-md group"
              />
              <span className="text-xs text-zinc-400 font-medium w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: Volume & Extra Controls */}
          <div className="flex items-center gap-3 min-w-[180px] w-[30%] justify-end">
            <button
              onClick={handleLyricsOpen}
              className="text-zinc-400 hover:text-white transition-colors hover:scale-110"
              title="View Lyrics"
            >
              <Mic2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsCommentsOpen(true)}
              className="text-zinc-400 hover:text-white transition-colors hover:scale-110"
              title="Comments"
              aria-label="Comment on current song"
            >
              <MessageSquare className="w-4 h-4" />
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="text-zinc-400 hover:text-white transition-colors hover:scale-110 disabled:opacity-50"
              title={downloadLabel}
              aria-label={downloadLabel}
            >
              {downloadIcon("w-4 h-4")}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-zinc-400 hover:text-white transition-colors hover:scale-110">
                  <ListPlus className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-zinc-800 border-zinc-700 text-white w-48"
              >
                <DropdownMenuItem
                  onClick={handleLyricsOpen}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <Mic2 className="w-4 h-4 mr-2" />
                  View Lyrics
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    window.requestAnimationFrame(() => setIsCommentsOpen(true));
                  }}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Comments
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  {downloadIcon("w-4 h-4 mr-2")}
                  {downloadLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => currentSong && addPlayNext(currentSong)}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <ListVideo className="w-4 h-4 mr-2" />
                  Play Next
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => currentSong && addToQueue(currentSong)}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <ListMusic className="w-4 h-4 mr-2" />
                  Add to Queue
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-700" />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-zinc-300 focus:text-white focus:bg-zinc-700">
                    <ListPlus className="w-4 h-4 mr-2" />
                    Add to Playlist
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-zinc-800 border-zinc-700">
                    {playlists.map((playlist) => (
                      <DropdownMenuItem
                        key={playlist.id}
                        onClick={() => handleAddToPlaylist(playlist.id)}
                        className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                      >
                        {playlist.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator className="bg-zinc-700" />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        setIsDialogOpen(true);
                      }}
                      className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create Playlist
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-zinc-400 hover:text-white transition-colors hover:scale-110"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={handleVolumeChange}
                className="w-24 cursor-pointer [&_[role=slider]]:bg-white [&_[role=slider]]:border-0 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:opacity-0 hover:[&_[role=slider]]:opacity-100 [&>span]:bg-zinc-600 [&>span]:h-1 hover:[&>span]:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Create New Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="playlistName">Playlist Name</Label>
              <Input
                id="playlistName"
                placeholder="My Playlist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateAndAddToPlaylist();
                  }
                }}
                className="bg-zinc-800 border-zinc-700 text-white focus:border-primary"
              />
            </div>
            <Button
              onClick={handleCreateAndAddToPlaylist}
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              Create and Add Song
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isSongDetailsOpen && (
        <SongDetailsModal
          isOpen
          onClose={() => setIsSongDetailsOpen(false)}
        />
      )}

      <LyricsModal
        isOpen={isLyricsOpen}
        onClose={() => setIsLyricsOpen(false)}
        song={currentSong}
      />

      <SongCommentsModal song={currentSong} open={isCommentsOpen} onOpenChange={setIsCommentsOpen} />

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-compact {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          display: inline-block;
          padding-right: 2rem;
        }
      `}</style>
    </>
  );
};
