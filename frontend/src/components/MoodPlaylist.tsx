import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import {
  Heart,
  Frown,
  Smile,
  Music,
  Loader2,
  Play,
  PartyPopper,
  Pause,
  X,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { Song as AppSong } from "@/types";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { TherapyAIChat } from "./TherapyAIChat";
import { detectCurrentMood, type MoodDetection } from "@/lib/moodDetection";

const confidenceLabel: Record<MoodDetection["confidence"], string> = {
  high: "Confident",
  medium: "Good guess",
  low: "Just a guess",
};

type Song = AppSong;

type Mood = "happy" | "sad" | "romantic" | "party" | null;

// FIX: `as const` gives each `id` a literal type, so `handleMoodSelect`
// no longer needs an unsafe `as Mood` cast at every call site.
const moods = [
  {
    id: "happy",
    icon: Smile,
    label: "Happy",
    color: "from-yellow-500/80 via-yellow-400/80 to-yellow-300/80",
    bgColor: "bg-yellow-500",
    description: "Upbeat and cheerful tunes to lift your spirits",
  },
  {
    id: "sad",
    icon: Frown,
    label: "Sad",
    color: "from-blue-500/80 via-blue-400/80 to-blue-300/80",
    bgColor: "bg-blue-500",
    description: "Melancholic melodies for emotional moments",
  },
  {
    id: "romantic",
    icon: Heart,
    label: "Romantic",
    color: "from-red-500/80 via-red-400/80 to-red-300/80",
    bgColor: "bg-red-500",
    description: "Love songs and romantic ballads",
  },
  {
    id: "party",
    icon: PartyPopper,
    label: "Party",
    color: "from-purple-500/80 via-purple-400/80 to-purple-300/80",
    bgColor: "bg-purple-500",
    description: "High-energy tracks to get the party started",
  },
] as const;

const MoodPlaylist = () => {
  const [selectedMood, setSelectedMood] = useState<Mood>(null);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAIButton, setShowAIButton] = useState(false);
  const [hasSeenChatDialog, setHasSeenChatDialog] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [detection, setDetection] = useState<MoodDetection | null>(null);
  const { currentSong, isPlaying, playAlbum, togglePlay } = usePlayerStore();
  const detectedMood = detection ? moods.find((mood) => mood.id === detection.mood) : undefined;

  // FIX: ref instead of relying on a plain mount-time setTimeout so the
  // "Analyzing Your Mood" splash only ever plays once per page load,
  // not every time this component happens to remount.
  const hasPlayedSplashRef = useRef(false);

  useEffect(() => {
    // The "Analyzing your mood" step is real: it reads recent listening, what
    // is playing now and the time of day (see lib/moodDetection.ts).
    setDetection(detectCurrentMood(usePlayerStore.getState().currentSong));
    if (hasPlayedSplashRef.current) {
      setIsAnalyzing(false);
      return;
    }
    hasPlayedSplashRef.current = true;
    const analyzeTimer = setTimeout(() => {
      setIsAnalyzing(false);
    }, 600);

    return () => clearTimeout(analyzeTimer);
  }, []);

  useEffect(() => {
    if (selectedMood) {
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setIsExpanded(true);
    }
  }, [selectedMood]);

  const handleMoodSelect = (mood: Mood) => {
    setSelectedMood(mood);
    setImageErrors(new Set());

    if (mood === "sad" && !hasSeenChatDialog) {
      setShowChatDialog(true);
      setHasSeenChatDialog(true);
    } else if (mood === "sad" && hasSeenChatDialog) {
      setShowAIButton(true);
    }
  };

  const handleChangeMood = () => {
    setIsExpanded(true);
    setSelectedMood(null);
  };

  const handleImageError = (songId: string) => {
    setImageErrors(prev => new Set(prev).add(songId));
  };

  // FIX: closing the dialog any other way (backdrop click, Esc) now
  // behaves the same as clicking "Not now" — showAIButton gets set,
  // so the chat button doesn't disappear permanently.
  const handleChatDialogOpenChange = (open: boolean) => {
    setShowChatDialog(open);
    if (!open) {
      setShowAIButton(true);
    }
  };

  const {
    data: songs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["mood-songs", selectedMood],
    queryFn: async () => {
      if (!selectedMood) return [];

      const { data } = await axiosInstance.get<any[]>(`/songs/mood/${selectedMood}`);
      // Accept both the current app-shaped response and the earlier mood
      // endpoint shape while deployments roll over. Without this adapter an
      // old `{ id, name, primaryArtists, image }` payload creates blank rows.
      const normalizedSongs = (Array.isArray(data) ? data : []).map((song) => ({
        ...song,
        _id: String(song._id || song.id || ""),
        title: String(song.title || song.name || "Unknown title"),
        artist: String(song.artist || song.primaryArtists || "Unknown artist"),
        imageUrl: String(song.imageUrl || song.image || "/default-image.png"),
        audioUrl: String(song.audioUrl || song.url || ""),
        albumId: String(song.albumId || song.album?.id || ""),
        albumName: String(song.albumName || song.album?.name || song.album || ""),
        genre: String(song.genre || song.language || "Unknown"),
        duration: Number(song.duration) || 0,
        videoUrl: null,
        playedAt: song.playedAt || "",
        userId: undefined,
        isLiked: Boolean(song.isLiked),
        lyrics: song.lyrics || "",
        createdAt: song.createdAt || "",
        updatedAt: song.updatedAt || "",
      })).filter((song): song is Song => Boolean(song._id && song.title && song.audioUrl));

      if (!normalizedSongs.length) {
        throw new Error('No valid songs found for this mood');
      }
      return normalizedSongs;
    },
    enabled: !!selectedMood,
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000,
  });

  // FIX: single place that reacts to a *settled* error (after retries
  // are exhausted), so the user sees exactly one toast per real failure.
  useEffect(() => {
    if (!error) return;
    const err = error as any;
    if (err?.code === 'ECONNABORTED') {
      toast.error("Request timed out. Please check your connection.");
    } else if (err?.response?.status === 503) {
      toast.error("Service temporarily unavailable. Please try again later.");
    } else if (err?.response?.status === 404) {
      toast.error("Mood playlist not found.");
    } else {
      toast.error(err?.message || "Failed to load songs. Please try again.");
    }
  }, [error]);

  const handlePlayPause = async (song: Song) => {
    try {
      if (currentSong?._id === song._id) {
        togglePlay();
      } else {
        const songIndex = songs.findIndex((s) => s._id === song._id);

        if (songIndex === -1) {
          toast.error("Song not found in playlist.");
          return;
        }

        playAlbum(
          songs.map((s) => ({
            ...s,
            albumId: s.albumId || undefined,
            genre: s.genre || "Unknown",
            playedAt: new Date().toISOString(),
            userId: "",
            videoUrl: null,
          })),
          songIndex
        );

        toast.success(`Now playing: ${song.title}`);
      }
    } catch (error) {
      console.error("Error playing song:", error);
      toast.error("Unable to play this song. Please try another.");
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="flex flex-col h-full bg-gradient-to-b from-background/80 to-background">
        <div className="relative h-full overflow-y-auto p-3 pb-20 md:p-8 md:pb-8">
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center gap-6"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 180, 360],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="relative"
                >
                  <Sparkles className="h-16 w-16 text-primary" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="text-center"
                >
                  <h2 className="text-2xl md:text-4xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/50">
                    Analyzing Your Mood
                  </h2>
                  <p className="text-muted-foreground">
                    Finding the perfect playlist for your current vibe...
                  </p>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={cn(
                    "grid min-h-full transition-all duration-500 gap-3 md:h-full md:gap-8",
                  selectedMood
                    ? "md:grid-cols-[380px,1fr] grid-cols-1"
                    : "grid-cols-1"
                )}
              >
                {/* Mood Selection Container */}
                <div
                  className={cn(
                    "transition-all duration-500",
                    isExpanded ? "max-w-4xl mx-auto w-full" : "w-full",
                    selectedMood && "h-fit"
                  )}
                >
                  <motion.div
                    className="flex items-center gap-2 md:gap-4 mb-3 md:mb-8 bg-background/80 backdrop-blur-md p-2 md:p-4 relative"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex-1 flex justify-center">
                        <h2
                          className={cn(
                            "font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/50 text-center",
                            !isExpanded
                              ? "text-lg md:text-2xl"
                              : "text-xl md:text-4xl lg:text-5xl"
                          )}
                        >
                          {selectedMood
                            ? "Your Mood Playlist"
                            : "How are you feeling today?"}
                        </h2>
                      </div>
                      {selectedMood && (
                        <Button variant="outline" size="sm" onClick={handleChangeMood} className="ml-2 shrink-0 rounded-full">
                          Change mood
                        </Button>
                      )}
                      {showAIButton && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="ml-2 md:ml-4"
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowChat(true)}
                            className="rounded-full hover:bg-accent/50 h-8 w-8 md:h-10 md:w-10 relative group"
                          >
                            <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                            <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 bg-background border px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                              Talk to AI Assistant
                            </span>
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  {!selectedMood && detection && detectedMood && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className={cn(
                        "mx-2 mb-4 md:mb-6 rounded-xl md:rounded-2xl p-4 md:p-5 bg-gradient-to-br text-white relative overflow-hidden",
                        detectedMood.color
                      )}
                    >
                      <div className="absolute inset-0 bg-black/30" />
                      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/80">
                            <Sparkles className="h-3.5 w-3.5" />
                            Detected for you
                            <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] normal-case tracking-normal">
                              {confidenceLabel[detection.confidence]}
                            </span>
                          </p>
                          <h3 className="mt-1 text-xl md:text-2xl font-bold">
                            You seem to be in a {detectedMood.label.toLowerCase()} mood
                          </h3>
                          <ul className="mt-1.5 space-y-0.5 text-sm text-white/85">
                            {detection.reasons.slice(0, 2).map((reason) => (
                              <li key={reason}>• {reason}</li>
                            ))}
                          </ul>
                        </div>
                        <Button
                          onClick={() => handleMoodSelect(detection.mood)}
                          className="shrink-0 rounded-full bg-white text-black hover:bg-white/90"
                        >
                          <Play className="h-4 w-4 fill-current" />
                          Play {detectedMood.label.toLowerCase()} mix
                        </Button>
                      </div>
                    </motion.div>
                  )}
                  {!selectedMood && detection && (
                    <p className="mx-2 mb-2 text-xs text-muted-foreground md:text-sm">Not quite right? Pick a mood yourself:</p>
                  )}

                  <div
                    className={cn(
                      "grid gap-2 md:gap-6 px-2",
                      isExpanded ? "grid-cols-2 md:grid-cols-2" : "grid-cols-1",
                      selectedMood && "md:max-h-[calc(100vh-250px)]"
                    )}
                  >
                    {moods.map((mood, index) => {
                      if (selectedMood && mood.id !== selectedMood) return null;
                      const Icon = mood.icon;
                      const isSelected = selectedMood === mood.id;
                      return (
                        <motion.div
                          key={mood.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: 0.5 + index * 0.1,
                            duration: 0.3,
                          }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <button
                            onClick={() => handleMoodSelect(mood.id)}
                            className={cn(
                              "w-full text-left",
                              "rounded-lg md:rounded-2xl p-3 md:p-6",
                              "transition-all duration-300",
                              "bg-gradient-to-br",
                              mood.color,
                              "hover:shadow-xl hover:shadow-accent/20",
                              "group relative overflow-hidden",
                              isSelected &&
                                "ring-2 ring-primary ring-offset-2 ring-offset-background",
                              !isExpanded && "p-2 md:p-4"
                            )}
                          >
                            <div className="absolute inset-0 bg-gradient-to-br from-black/50 to-transparent opacity-20" />
                            {!selectedMood && detection?.mood === mood.id && (
                              <span className="absolute right-2 top-2 z-10 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-semibold text-white md:right-3 md:top-3 md:text-xs">
                                Detected
                              </span>
                            )}
                            <div className="relative z-10">
                              <div
                                className={cn(
                                  "rounded-full flex items-center justify-center",
                                  "bg-white/10 backdrop-blur-sm",
                                  "transition-transform duration-300",
                                  "group-hover:scale-110",
                                  isExpanded
                                    ? "w-8 h-8 md:w-12 md:h-12 mb-2 md:mb-4"
                                    : "w-6 h-6 md:w-10 md:h-10 mb-1.5 md:mb-3"
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "text-white",
                                    isExpanded
                                      ? "h-4 w-4 md:h-6 md:w-6"
                                      : "h-3 w-3 md:h-5 md:w-5"
                                  )}
                                />
                              </div>
                              <h3
                                className={cn(
                                  "font-semibold text-white",
                                  isExpanded
                                    ? "text-base md:text-2xl mb-0.5 md:mb-2"
                                    : "text-sm md:text-lg mb-0.5"
                                )}
                              >
                                {mood.label}
                              </h3>
                              {isExpanded && (
                                <p className="text-white/80 text-xs md:text-sm line-clamp-2 hidden md:block">
                                  {mood.description}
                                </p>
                              )}
                            </div>
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Songs List */}
                {selectedMood && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="flex min-h-[380px] flex-col overflow-hidden rounded-lg bg-accent/20 backdrop-blur-sm md:h-full md:min-h-0 md:rounded-2xl"
                  >
                    <div className="flex items-center justify-between p-4 md:p-6 bg-background/80 backdrop-blur-md sticky top-0 z-10">
                      <div>
                        <h3 className="text-xl md:text-2xl font-bold mb-1">
                          {selectedMood.charAt(0).toUpperCase() +
                            selectedMood.slice(1)}{" "}
                          Playlist
                        </h3>
                        <p className="text-sm md:text-base text-muted-foreground">
                          {songs?.length || 0} curated songs for your mood
                        </p>
                      </div>
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="p-4 md:p-6 space-y-2">
                        {isLoading ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-muted-foreground">
                              Loading your mood playlist...
                            </p>
                          </div>
                        ) : error ? (
                          <div className="text-center py-12 space-y-4">
                            <Frown className="h-12 w-12 mx-auto text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground mb-2">
                                Failed to load songs.
                              </p>
                              <Button
                                variant="outline"
                                onClick={() => handleChangeMood()}
                              >
                                Try Another Mood
                              </Button>
                            </div>
                          </div>
                        ) : songs.length === 0 ? (
                          <div className="text-center py-12 space-y-2">
                            <Music className="h-12 w-12 mx-auto text-muted-foreground" />
                            <p className="text-muted-foreground">
                              No songs found for this mood.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {songs.map((song: Song, index: number) => {
                              const hasImageError = imageErrors.has(song._id);

                              return (
                                <motion.button
                                  type="button"
                                  onClick={() => handlePlayPause(song)}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{
                                    opacity: 1,
                                    y: 0,
                                    transition: { delay: index * 0.05 },
                                  }}
                                  key={song._id}
                                  className={cn(
                                    "flex w-full items-center gap-3 rounded-lg p-3 text-left md:gap-4 md:rounded-xl",
                                    "hover:bg-white/5 transition-colors group",
                                    "border border-transparent hover:border-accent",
                                    currentSong?._id === song._id &&
                                      "bg-accent/30 border-accent"
                                  )}
                                >
                                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md md:h-12 md:w-12 md:rounded-lg">
                                    {!hasImageError && song.imageUrl ? (
                                      <img
                                        src={song.imageUrl}
                                        alt={song.title}
                                        className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                        onError={() => handleImageError(song._id)}
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-accent">
                                        <Music className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                    <div
                                      className={cn(
                                        "absolute inset-0 bg-black/60",
                                        "flex items-center justify-center",
                                        "transition-opacity",
                                        currentSong?._id === song._id
                                          ? "opacity-100"
                                          : "opacity-0 group-hover:opacity-100"
                                      )}
                                    >
                                      {currentSong?._id === song._id &&
                                      isPlaying ? (
                                        <Pause className="h-4 w-4 md:h-5 md:w-5 text-white" />
                                      ) : (
                                        <Play className="h-4 w-4 md:h-5 md:w-5 text-white" />
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p
                                      className={cn(
                                        "font-medium truncate text-sm md:text-base",
                                        currentSong?._id === song._id &&
                                          "text-primary"
                                      )}
                                    >
                                      {song.title}
                                    </p>
                                    <p className="text-xs md:text-sm text-muted-foreground truncate">
                                      {song.artist}
                                    </p>
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Dialog open={showChatDialog} onOpenChange={handleChatDialogOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Would you like to talk about why you're feeling this way?
            </DialogTitle>
            <DialogDescription>
              Our AI assistant is here to listen and help you feel better.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => handleChatDialogOpenChange(false)}
            >
              Not now
            </Button>
            <Button
              onClick={() => {
                setShowChat(true);
                handleChatDialogOpenChange(false);
              }}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Talk to AI Assistant
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showChat && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        >
          <div className="container flex items-center justify-center h-full max-w-4xl mx-auto p-4">
            <div className="relative w-full bg-background rounded-lg shadow-lg">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">AI Therapy Assistant</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowChat(false)}
                  aria-label="Close AI assistant"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-4">
                <TherapyAIChat />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default MoodPlaylist;
