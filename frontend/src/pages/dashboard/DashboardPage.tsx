import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Heart, Play, Calendar, TrendingUp, Music2, Headphones, Pause } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@clerk/clerk-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMusicStore } from "@/stores/useMusicStore";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListeningEvent, readListeningHistory } from "@/lib/listeningHistory";
import { axiosInstance } from "@/lib/axios";

interface DashboardStats {
  hoursListened: number;
  favoriteSongs: number;
  dailyStreak: number;
  totalPlays: number;
  topGenre: string;
}

const DashboardPage = () => {
  const { user } = useUser();

  // IMPORTANT: select only the fields this component needs instead of
  // `usePlayerStore()` / `useMusicStore()` (which subscribe to the WHOLE
  // store and re-render this page on every unrelated state change, e.g.
  // sidebar fetching albums, volume changes, etc).
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const setCurrentSong = usePlayerStore((state) => state.setCurrentSong);
  const playedSongs = usePlayerStore((state) => state.playedSongs);

  const songs = useMusicStore((state) => state.songs);
  const fetchSongs = useMusicStore((state) => state.fetchSongs);
  const fetchLikedSongs = useMusicStore((state) => state.fetchLikedSongs);
  const likedSongs = useMusicStore((state) => state.likedSongs);
  const toggleLike = useMusicStore((state) => state.toggleLike);

  const [stats, setStats] = useState<DashboardStats>({
    hoursListened: 0,
    favoriteSongs: 0,
    dailyStreak: 0,
    totalPlays: 0,
    topGenre: "N/A",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [listeningHistory, setListeningHistory] = useState<ListeningEvent[]>([]);

  // Memoized filtered songs
  const userSongs = useMemo(() => 
    songs.filter(song => song.userId === user?.id),
    [songs, user?.id]
  );

  // Listening activity is stored per signed-in Clerk user, so Saavn songs
  // (which have no Mongo userId) are still reflected after refreshes.
  const userPlayedSongs = useMemo(() => listeningHistory, [listeningHistory]);

  const recentlyPlayed = useMemo(() => 
    userPlayedSongs.slice(-5).reverse(),
    [userPlayedSongs]
  );

  const topLikedSongs = useMemo(() => 
    likedSongs.slice(0, 5),
    [likedSongs]
  );

  // Calculate daily streak
  const calculateDailyStreak = useCallback(() => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let streak = 0;
      const currentDate = new Date(today);

      while (true) {
        const songsPlayedOnDate = userPlayedSongs.filter(song => {
          if (!song.playedAt) return false;
          const playedDate = new Date(song.playedAt);
          playedDate.setHours(0, 0, 0, 0);
          return playedDate.getTime() === currentDate.getTime();
        });

        if (songsPlayedOnDate.length === 0) break;
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      }

      return streak;
    } catch (error) {
      console.error("Error calculating daily streak:", error);
      return 0;
    }
  }, [userPlayedSongs]);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        await Promise.all([fetchSongs(), fetchLikedSongs()]);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [fetchSongs, fetchLikedSongs]);

  useEffect(() => {
    if (!user?.id) return;
    const refreshHistory = () => setListeningHistory(readListeningHistory(user.id));
    refreshHistory();
    void axiosInstance.get<ListeningEvent[]>("/users/listening-history?limit=1000")
      .then((response) => { if (response.data.length) setListeningHistory(response.data.reverse()); })
      .catch(() => undefined);
    const onHistoryChange = (event: Event) => {
      const changedUserId = (event as CustomEvent<string>).detail;
      if (!changedUserId || changedUserId === user.id) refreshHistory();
    };
    window.addEventListener("beatbond:history-updated", onHistoryChange);
    return () => window.removeEventListener("beatbond:history-updated", onHistoryChange);
  }, [user?.id, currentSong?._id, playedSongs.length]);

  // Update stats
  useEffect(() => {
    if (!user?.id) return;

    try {
      const totalPlayedDuration = userPlayedSongs.reduce(
        (acc, song) => acc + (song.duration || 0),
        0
      );
      const hoursListened = Math.round((totalPlayedDuration / 3600) * 10) / 10;

      // Calculate top genre
      const genreCounts: Record<string, number> = {};
      userPlayedSongs.forEach(song => {
        const genre = song.genre || "Unknown";
        genreCounts[genre] = (genreCounts[genre] || 0) + 1;
      });
      const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

      setStats({
        hoursListened: hoursListened || 0,
        favoriteSongs: likedSongs.length || 0,
        dailyStreak: calculateDailyStreak(),
        totalPlays: userPlayedSongs.length || 0,
        topGenre,
      });
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  }, [user?.id, userPlayedSongs, likedSongs.length, calculateDailyStreak]);

  const formatDuration = useCallback((seconds: number | undefined | null) => {
    const safeSeconds = seconds || 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const handlePlaySong = useCallback((song: any) => {
    setCurrentSong(song);
    if (!isPlaying) {
      togglePlay();
    }
  }, [setCurrentSong, isPlaying, togglePlay]);

  const handleLikeSong = useCallback((e: React.MouseEvent, songId: string) => {
    e.stopPropagation();
    toggleLike(songId);
  }, [toggleLike]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <Music2 className="h-16 w-16 text-primary animate-pulse" />
        <div className="text-xl font-semibold text-center">Please sign in to view your dashboard</div>
        <Button onClick={() => window.location.href = '/auth'} size="lg">
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-6 pb-24 sm:pb-6">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Your Dashboard
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Welcome back, {user?.firstName || user?.fullName || "Music Lover"} 👋
            </p>
          </div>
          <div className="flex items-center gap-2 bg-gradient-to-r from-primary/20 to-primary/10 px-4 py-2 rounded-full border border-primary/20">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              {stats.dailyStreak > 0 ? `${stats.dailyStreak} Day Streak! 🔥` : "Start your streak!"}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Hours</CardTitle>
              <Clock className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stats.hoursListened}h</div>
              <Progress value={Math.min((stats.hoursListened / 24) * 100, 100)} className="mt-2 h-1.5" />
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Total listened</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Streak</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stats.dailyStreak}</div>
              <Progress value={Math.min((stats.dailyStreak / 7) * 100, 100)} className="mt-2 h-1.5" />
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                {stats.dailyStreak === 0 ? "Play today!" : "Days in a row"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-pink-500/10 to-pink-600/5 border-pink-500/20 hover:border-pink-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-pink-500/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Favorites</CardTitle>
              <Heart className="h-4 w-4 text-pink-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stats.favoriteSongs}</div>
              <Progress value={Math.min((stats.favoriteSongs / Math.max(userSongs.length, 1)) * 100, 100)} className="mt-2 h-1.5" />
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">Liked songs</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 hover:border-green-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs sm:text-sm font-medium">Plays</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold">{stats.totalPlays}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 truncate">
                Top: {stats.topGenre}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Currently Playing - Prominent */}
        {currentSong && (
          <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                <Headphones className="h-5 w-5 text-primary animate-pulse" />
                Now Playing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                <div className="relative group">
                  <img
                    src={currentSong.imageUrl}
                    alt={currentSong.title}
                    className="h-24 w-24 sm:h-20 sm:w-20 rounded-lg object-cover shadow-lg"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={togglePlay}
                      className="h-10 w-10 text-white hover:bg-white/20"
                    >
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </Button>
                  </div>
                </div>
                <div className="flex-1 text-center sm:text-left min-w-0">
                  <p className="text-base sm:text-lg font-semibold truncate">{currentSong.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{currentSong.artist}</p>
                  <div className="flex items-center justify-center sm:justify-start gap-4 mt-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(currentSong.duration)}
                    </span>
                    {currentSong.genre && (
                      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        {currentSong.genre}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Recently Played */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Recently Played
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentlyPlayed.length > 0 ? recentlyPlayed.map((song) => (
                  <div
                    key={song._id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/80 transition-all duration-200 cursor-pointer group active:scale-[0.98]"
                    onClick={() => handlePlaySong(song)}
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        src={song.imageUrl}
                        alt={song.title}
                        className="h-12 w-12 rounded object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                        <Play className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDuration(song.duration)}
                    </div>
                  </div>
                )) : (
                  <div className="text-muted-foreground text-center py-8 text-sm">
                    <Music2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    No songs played yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Liked Songs */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Heart className="h-4 w-4 sm:h-5 sm:w-5 text-pink-500 fill-pink-500" />
                Liked Songs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topLikedSongs.length > 0 ? topLikedSongs.map((song) => (
                  <div
                    key={song._id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/80 transition-all duration-200 cursor-pointer group active:scale-[0.98]"
                    onClick={() => handlePlaySong(song)}
                  >
                    <div className="relative flex-shrink-0">
                      <img
                        src={song.imageUrl}
                        alt={song.title}
                        className="h-12 w-12 rounded object-cover"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded">
                        <Play className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{song.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-xs text-muted-foreground hidden sm:block">
                        {formatDuration(song.duration)}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => handleLikeSong(e, song._id)}
                      >
                        <Heart className="h-4 w-4 text-pink-500 fill-pink-500" />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="text-muted-foreground text-center py-8 text-sm">
                    <Heart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    No liked songs yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
};

export default DashboardPage;
