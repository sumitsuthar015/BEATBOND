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
              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
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
  const setCurrentSongLiked = usePlayerStore((state) => state.setCurrentSongLiked);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const addPlayNext = usePlayerStore((state) => state.addPlayNext);

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
    void useMusicStore.getState().toggleLike(currentSong._id);
    setCurrentSongLiked(!isLiked);
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
      ? <CircleCheck className={`${className} text-green-500`} />
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
        <div className="min-h-screen p-6 pb-32">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
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
                  onClick={handleAddToLikedSongs}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-green-500 text-green-500' : ''}`} />
                  {isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLyricsOpen}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <Mic2 className="w-4 h-4 mr-2" />
                  View Lyrics
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
          <div className="flex justify-center mb-8">
            <div className="w-[90vw] h-[90vw] max-w-[400px] max-h-[400px] shadow-2xl rounded-lg overflow-hidden">
              <img
                src={currentSong.imageUrl || "/api/placeholder/400/400"}
                alt={currentSong.title}
                className="w-full h-full object-cover"
                onClick={() => setIsSongDetailsOpen(true)}
              />
            </div>
          </div>

          {/* Song Info */}
          <div className="mb-6">
            <div className="overflow-hidden mb-2">
              <h1
                className="text-3xl font-bold text-white cursor-pointer hover:underline whitespace-nowrap animate-marquee"
                onClick={() => setIsSongDetailsOpen(true)}
                style={{
                  animation: currentSong.title.length > 20 ? 'marquee 10s linear infinite' : 'none',
                }}
              >
                {currentSong.title}
              </h1>
            </div>
            <p className="text-zinc-400 text-base">{currentSong.artist}</p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2 mb-8">
            <Slider
              value={[progress]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              className="cursor-pointer [&_[role=slider]]:bg-white [&_[role=slider]]:border-0 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:shadow-lg hover:[&_[role=slider]]:scale-110 [&>span]:bg-white"
            />
            <div className="flex justify-between text-xs text-zinc-400 font-medium">
              <span>{formatTime(progress)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-8 px-4">
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
              className="bg-white text-black rounded-full p-4 hover:scale-110 transition-transform shadow-xl"
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 fill-current" />
              ) : (
                <Play className="w-8 h-8 fill-current ml-1" />
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
          <LyricsPanel className="h-[360px]" />
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
                  className="bg-zinc-800 border-zinc-700 text-white focus:border-green-500"
                />
              </div>
              <Button
                onClick={handleCreateAndAddToPlaylist}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
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
          <div
            className="px-3 py-2 cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            <div className="flex items-center gap-3 mb-2">
              <img
                src={currentSong.imageUrl || "/api/placeholder/48/48"}
                alt={currentSong.title}
                className="w-12 h-12 rounded object-cover shadow-lg"
              />
              <div className="flex-1 min-w-0">
                <div className="overflow-hidden">
                  <p
                    className="text-white font-semibold text-sm truncate whitespace-nowrap"
                    style={{
                      animation: currentSong.title.length > 25 ? 'marquee-compact 8s linear infinite' : 'none',
                    }}
                  >
                    {currentSong.title}
                  </p>
                </div>
                <p className="text-zinc-400 text-xs truncate">
                  {currentSong.artist}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload();
                }}
                disabled={isDownloading}
                aria-label={downloadLabel}
                title={downloadLabel}
                className="text-zinc-400 hover:text-white transition-colors p-2 disabled:opacity-50"
              >
                {downloadIcon("w-4 h-4")}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddToLikedSongs();
                }}
                className="text-zinc-400 hover:text-white transition-colors p-2"
              >
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-green-500 text-green-500' : ''}`} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="text-white hover:scale-110 transition-transform p-2"
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : (
                  <Play className="w-8 h-8 fill-current" />
                )}
              </button>
            </div>

            {/* Mini Progress Bar */}
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-100"
                style={{
                  width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        <SongDetailsModal
          isOpen={isSongDetailsOpen}
          onClose={() => setIsSongDetailsOpen(false)}
        />

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
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-green-500 text-green-500' : ''}`} />
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
                className="flex-1 cursor-pointer [&_[role=slider]]:bg-white [&_[role=slider]]:border-0 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:opacity-0 hover:[&_[role=slider]]:opacity-100 [&_[role=slider]]:shadow-md [&>span]:bg-zinc-600 [&>span]:h-1 hover:[&>span]:bg-green-500 group"
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
                  onClick={handleAddToLikedSongs}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <Heart className={`w-4 h-4 mr-2 ${isLiked ? 'fill-green-500 text-green-500' : ''}`} />
                  {isLiked ? 'Remove from Liked' : 'Add to Liked Songs'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLyricsOpen}
                  className="text-zinc-300 focus:text-white focus:bg-zinc-700 cursor-pointer"
                >
                  <Mic2 className="w-4 h-4 mr-2" />
                  View Lyrics
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
                className="bg-zinc-800 border-zinc-700 text-white focus:border-green-500"
              />
            </div>
            <Button
              onClick={handleCreateAndAddToPlaylist}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold"
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
