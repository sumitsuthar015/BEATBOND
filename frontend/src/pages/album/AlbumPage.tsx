import { SongOptionsMenu } from "@/components/SongOptionsMenu";
import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSavedAlbumsStore } from "@/stores/useSavedAlbumsStore";
import { Song } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Clock, Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";
import { cn } from "@/lib/utils";

const isMongoId = (id: string) => /^[a-f\d]{24}$/i.test(id);

const mapBackendSong = (song: Record<string, unknown>, albumId: string): Song => ({
  _id: String(song._id),
  title: String(song.title || "Unknown Title"),
  artist: String(song.artist || "Unknown Artist"),
  imageUrl: String(song.imageUrl || ""),
  audioUrl: String(song.audioUrl || ""),
  duration: Number(song.duration) || 0,
  albumId,
  genre: "Unknown",
  videoUrl: null,
  playedAt: "",
  userId: undefined,
  isLiked: false,
  lyrics: "",
  createdAt: String(song.createdAt || new Date().toISOString()),
  updatedAt: String(song.updatedAt || new Date().toISOString()),
});

export const AlbumPage = () => {
  const { id: albumId } = useParams<{ id: string }>();
  const playAlbumQueue = usePlayerStore((state) => state.playAlbum);
  const useBackend = albumId ? isMongoId(albumId) : false;

  const { data, isLoading, error } = useQuery({
    queryKey: ["album", albumId, useBackend],
    enabled: !!albumId,
    queryFn: async () => {
      if (!albumId) throw new Error("Album ID is required");

      if (useBackend) {
        const { data: album } = await axiosInstance.get(`/albums/${albumId}`);
        return { source: "backend" as const, album };
      }

      const res = await axiosInstance.get(`/saavn/albums?id=${albumId}`);
      return { source: "saavn" as const, album: res.data.data || res.data };
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  const albumMeta = useMemo(() => {
    if (!data || !albumId) return null;

    if (data.source === "backend") {
      const album = data.album;
      return {
        id: String(album._id || album.id || albumId),
        name: album.title,
        imageUrl: album.imageUrl,
        artist: album.artist,
        year: album.releaseYear,
        songCount: album.songs?.length || 0,
      };
    }

    return {
      id: String(data.album.id || albumId),
      name: data.album.name,
      imageUrl: data.album.image?.[2]?.url || data.album.image?.[0]?.url,
      artist: data.album.artists?.primary?.map((a: { name: string }) => a.name).join(", "),
      year: data.album.year,
      songCount: data.album.songCount,
    };
  }, [data, albumId]);

  const songs: Song[] = useMemo(() => {
    if (!data || !albumId) return [];

    if (data.source === "backend") {
      return (data.album.songs || []).map((song: Record<string, unknown>) =>
        mapBackendSong(song, albumId)
      );
    }

    if (!data.album.songs) return [];

    return data.album.songs.map((s: Record<string, unknown>) => {
      const downloadUrl = s.downloadUrl as Array<{ quality?: string; url?: string }> | undefined;
      const image = s.image as Array<{ url?: string }> | undefined;
      const artists = s.artists as {
        primary?: Array<{ name: string }>;
        all?: Array<{ name: string }>;
      };

      const audioOptions = downloadUrl || [];
      const preferredQuality =
        audioOptions.find((a) => a.quality === "320kbps") ||
        audioOptions.find((a) => a.quality === "160kbps") ||
        audioOptions[0];

      return {
        _id: String(s.id),
        title: String(s.name || "Unknown Title"),
        artist:
          artists?.primary
            ?.map((a) => a.name)
            .filter((n) => n && n !== "NULL")
            .join(", ") ||
          artists?.all
            ?.map((a) => a.name)
            .filter((n) => n && n !== "NULL")
            .join(", ") ||
          "Unknown Artist",
        imageUrl: image?.[2]?.url || image?.[1]?.url || image?.[0]?.url || "",
        audioUrl: preferredQuality?.url || "",
        duration: parseInt(String(s.duration)) || 0,
        albumId,
        genre: String(s.language || "Unknown"),
        videoUrl: null,
        playedAt: "",
        userId: undefined,
        isLiked: false,
        lyrics: String(s.lyrics || ""),
        lyricsId: String(s.lyricsId || ""),
        createdAt: String(s.releaseDate || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
      };
    });
  }, [data, albumId]);

  const toggleSaveAlbum = useSavedAlbumsStore((state) => state.toggleSaveAlbum);
  const isAlbumSaved = useSavedAlbumsStore((state) => state.isAlbumSaved);
  const isSaved = albumMeta ? isAlbumSaved(albumMeta.id) : false;

  const playAlbum = () => {
    const playable = songs.filter((s) => s.audioUrl);
    if (playable.length > 0) {
      playAlbumQueue(playable);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-destructive text-center">
          <p className="text-lg font-bold mb-2">Failed to load album</p>
          <p className="text-xs sm:text-sm">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading album...</div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="min-h-full pb-24 sm:pb-32">
        {albumMeta && (
          <div className="relative">
            <div
              className="absolute inset-0 bg-gradient-to-b from-secondary/80 to-transparent h-64 sm:h-72 md:h-80"
              style={
                albumMeta.imageUrl
                  ? {
                      backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.9)), url(${albumMeta.imageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      filter: "blur(50px)",
                      opacity: 0.3,
                    }
                  : undefined
              }
            />

            <div className="relative px-3 pb-4 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-4 sm:pb-6 sm:pt-6 md:px-6">
              <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 lg:flex-row lg:items-end lg:gap-6">
                {albumMeta.imageUrl && (
                  <div className="w-full shrink-0 lg:w-auto">
                    <img
                      src={albumMeta.imageUrl}
                      alt={albumMeta.name}
                      className="mx-auto h-48 w-48 rounded-xl object-cover shadow-2xl sm:h-56 sm:w-56 lg:mx-0"
                    />
                  </div>
                )}

                <div className="w-full flex-1 text-center lg:text-left">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 sm:mb-2">
                    Album
                  </p>
                  <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-2 sm:mb-3 md:mb-4 break-words line-clamp-2">
                    {albumMeta.name || "Unknown Album"}
                  </h1>

                  {albumMeta.artist && (
                    <p className="text-sm sm:text-base md:text-lg text-muted-foreground mb-2 sm:mb-3 truncate">
                      {albumMeta.artist}
                    </p>
                  )}

                  <div className="mb-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground sm:mb-4 sm:gap-2 sm:text-sm lg:justify-start md:gap-4">
                    {albumMeta.year && <span>{albumMeta.year}</span>}
                    {albumMeta.songCount > 0 && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span>{albumMeta.songCount} songs</span>
                      </>
                    )}
                    {songs.length > 0 && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span>
                          {Math.floor(songs.reduce((acc, s) => acc + s.duration, 0) / 60)} min
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                    {songs.some((s) => s.audioUrl) && (
                      <button
                        onClick={playAlbum}
                        className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 hover:shadow-xl active:scale-95 sm:px-8 sm:py-3 sm:text-base"
                      >
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                        Play
                      </button>
                    )}

                    {/* Save Album Button */}
                    <button
                      onClick={() =>
                        toggleSaveAlbum({
                          _id: albumMeta.id,
                          id: albumMeta.id,
                          title: albumMeta.name,
                          name: albumMeta.name,
                          imageUrl: albumMeta.imageUrl,
                          artist: albumMeta.artist,
                          year: albumMeta.year,
                          releaseYear: Number(albumMeta.year) || 0,
                          songCount: albumMeta.songCount,
                          songs: [],
                        })
                      }
                      aria-label={isSaved ? "Remove from saved albums" : "Save album"}
                      title={isSaved ? "Remove from saved albums" : "Save album"}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all shadow-md active:scale-95",
                        isSaved
                          ? "border-green-500/50 bg-green-500/20 text-green-400 hover:bg-green-500/30"
                          : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {isSaved ? <BookmarkCheck className="w-4 h-4 text-green-400" /> : <Bookmark className="w-4 h-4 text-amber-400" />}
                      <span>{isSaved ? "Saved" : "Save Album"}</span>
                    </button>

                    {/* Share Album Button */}
                    <ShareToMessageDialog
                      message={`Check out "${albumMeta.name}" by ${albumMeta.artist} on BeatBond!`}
                      sharedContent={{
                        type: "album",
                        title: albumMeta.name,
                        subtitle: albumMeta.artist,
                        imageUrl: albumMeta.imageUrl,
                        href: `/album/${albumMeta.id}`,
                      }}
                      trigger={
                        <button
                          className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-white/20 active:scale-95"
                          title="Share album"
                        >
                          <Share2 className="w-4 h-4 text-purple-400" />
                          <span>Share</span>
                        </button>
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="px-3 sm:px-4 md:px-6 max-w-7xl mx-auto">
          <div className="mb-3 sm:mb-4 pb-2 border-b border-border">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold">Songs</h2>
          </div>

          <div className="hidden lg:block">
            <div className="grid grid-cols-[16px_1fr_2fr_1fr_60px_40px] gap-4 px-4 py-2 text-sm text-muted-foreground border-b border-border items-center">
              <span>#</span>
              <span>Title</span>
              <span>Artist</span>
              <span>Album</span>
              <Clock className="w-4 h-4 ml-auto" />
              <span />
            </div>

            <div className="mt-2">
              {songs.map((song, index) => (
                <div
                  key={song._id}
                  onClick={() => song.audioUrl && playAlbumQueue(songs.filter((item) => item.audioUrl), songs.filter((item) => item.audioUrl).findIndex((item) => item._id === song._id))}
                  className={`grid grid-cols-[16px_1fr_2fr_1fr_60px_40px] gap-4 px-4 py-3 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors group items-center ${
                    !song.audioUrl ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <span className="text-muted-foreground text-sm">{index + 1}</span>
                  <div className="flex items-center gap-3 min-w-0">
                    {song.imageUrl && (
                      <img
                        src={song.imageUrl}
                        alt={song.title}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <span className="font-medium truncate group-hover:text-primary transition-colors">
                      {song.title}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-sm truncate">{song.artist}</span>
                  <span className="text-muted-foreground text-sm truncate">
                    {albumMeta?.name || "Unknown"}
                  </span>
                  <span className="text-muted-foreground text-sm text-right">
                    {formatDuration(song.duration)}
                  </span>
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <SongOptionsMenu song={song} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:hidden space-y-1.5 sm:space-y-2">
            {songs.map((song, index) => (
              <div
                key={song._id}
                onClick={() => song.audioUrl && playAlbumQueue(songs.filter((item) => item.audioUrl), songs.filter((item) => item.audioUrl).findIndex((item) => item._id === song._id))}
                className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg bg-card/50 hover:bg-secondary/50 transition-colors ${
                  !song.audioUrl ? "opacity-50" : "cursor-pointer"
                }`}
              >
                <span className="text-muted-foreground text-xs sm:text-sm w-5 sm:w-6 text-center">
                  {index + 1}
                </span>
                {song.imageUrl && (
                  <img
                    src={song.imageUrl}
                    alt={song.title}
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-xs sm:text-sm">{song.title}</p>
                  <p className="text-muted-foreground text-[10px] sm:text-xs truncate mt-0.5">
                    {song.artist}
                  </p>
                </div>
                <span className="text-muted-foreground text-[10px] sm:text-xs flex-shrink-0">
                  {formatDuration(song.duration)}
                </span>
                <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <SongOptionsMenu song={song} />
                </div>
              </div>
            ))}
          </div>

          {songs.length > 0 && songs.every((s) => !s.audioUrl) && (
            <p className="text-xs sm:text-sm text-destructive mt-4 sm:mt-6 text-center">
              No playable audio files available for this album
            </p>
          )}

          {songs.length === 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-4 sm:mt-6 text-center">
              No songs found in this album
            </p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};
