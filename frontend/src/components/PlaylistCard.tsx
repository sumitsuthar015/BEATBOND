import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download,
  ListMusic,
  Music2,
  Play,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import { type Playlist, usePlaylistStore } from "@/stores/usePlaylistStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";
import { downloadSongForOffline, isDownloaded, removeDownloadedSong } from "@/lib/offlineDownloads";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PlaylistCardProps {
  playlist: Playlist;
  className?: string;
}

export const PlaylistCard = ({ playlist, className }: PlaylistCardProps) => {
  const navigate = useNavigate();
  const deletePlaylist = usePlaylistStore((state) => state.deletePlaylist);
  const setPlaylistDownloaded = usePlaylistStore((state) => state.setPlaylistDownloaded);
  const updatePlaylist = usePlaylistStore((state) => state.updatePlaylist);
  
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const currentSong = usePlayerStore((state) => state.currentSong);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState(playlist.name);
  const [editDescription, setEditDescription] = useState(playlist.description || "");

  // Calculate total duration label
  const totalSeconds = playlist.songs.reduce((total, song) => total + (song.duration || 0), 0);
  const durationLabel = totalSeconds ? `${Math.floor(totalSeconds / 60)} min` : "0 min";

  // Play handler
  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playlist.songs.length) return;
    const isActive = playlist.songs.some((song) => song._id === currentSong?._id);
    if (isActive) {
      togglePlay();
    } else {
      playAlbum(playlist.songs);
    }
  };

  // Download handler
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const playlistDownloaded = Boolean(playlist.downloadedAt);
    const toastId = `playlist-download-${playlist.id}`;
    try {
      if (playlistDownloaded) {
        for (const song of playlist.songs) await removeDownloadedSong(song);
        await setPlaylistDownloaded(playlist.id, false);
        toast.success(`Removed "${playlist.name}" from downloads`);
        return;
      }
      const total = playlist.songs.length;
      let failed = 0;
      for (const [index, song] of playlist.songs.entries()) {
        toast.loading(`Downloading "${playlist.name}" · ${index + 1} of ${total}`, { id: toastId });
        if (isDownloaded(song._id)) continue;
        try {
          await downloadSongForOffline(song);
        } catch {
          failed += 1;
        }
      }
      await setPlaylistDownloaded(playlist.id, true);
      if (failed) toast.error(`Saved ${total - failed} of ${total} songs. Try again for the rest.`, { id: toastId });
      else toast.success(`"${playlist.name}" is ready to play offline`, { id: toastId });
    } catch (error: any) {
      toast.error(error?.message || "Could not update playlist download", { id: toastId });
    }
  };

  // Edit handler
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    await updatePlaylist(playlist.id, {
      name: editName.trim(),
      description: editDescription.trim(),
    });
    setIsEditOpen(false);
  };

  // Delete handler
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${playlist.name}"?`)) {
      void deletePlaylist(playlist.id);
    }
  };

  const shareMessage = `Check out "${playlist.name}" playlist on Beatbond`;
  const shareContent = {
    type: "playlist" as const,
    title: playlist.name,
    subtitle: `${playlist.songs.length} ${playlist.songs.length === 1 ? "song" : "songs"}${playlist.description ? " · " + playlist.description : ""}`,
    imageUrl: playlist.songs[0]?.imageUrl,
    href: `/playlists/${playlist.id}`,
  };

  return (
    <>
      <article
        className={cn(
          "group relative min-w-0 rounded-2xl border border-border/70 bg-card p-3 shadow-md transition-all hover:bg-secondary/30 hover:shadow-lg",
          className
        )}
      >
        {/* Cover Image Container */}
        <button
          type="button"
          onClick={() => navigate(`/playlists/${playlist.id}`)}
          aria-label={`Open ${playlist.name}`}
          className="relative block aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br from-primary/30 via-secondary to-background text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {playlist.songs[0]?.imageUrl ? (
            <img
              src={playlist.songs[0]?.imageUrl}
              alt={playlist.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Music2 className="size-10 text-muted-foreground" />
            </div>
          )}
          <span className="absolute bottom-2 right-2 grid size-10 place-items-center rounded-full bg-white text-black shadow-lg transition-transform hover:scale-110">
            <ListMusic className="size-5" />
          </span>
        </button>

        {/* Title & Details */}
        <div className="mt-3 min-w-0 px-0.5">
          <h3
            onClick={() => navigate(`/playlists/${playlist.id}`)}
            className="cursor-pointer truncate text-base font-bold text-foreground hover:underline"
          >
            {playlist.name}
          </h3>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            You · {playlist.songs.length} {playlist.songs.length === 1 ? "song" : "songs"} · {durationLabel}
          </p>
        </div>

        {/* Horizontal Divider Line */}
        <div className="my-2.5 border-t border-border/60" />

        {/* 5-Option Action Row */}
        <div className="grid grid-cols-5 gap-1">
          {/* 1. Play */}
          <button
            type="button"
            onClick={handlePlay}
            disabled={!playlist.songs.length}
            aria-label={`Play ${playlist.name}`}
            title="Play"
            className="grid h-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary active:scale-95 disabled:opacity-30"
          >
            <Play className="size-4 fill-current" />
          </button>

          {/* 2. Download */}
          <button
            type="button"
            onClick={handleDownload}
            aria-label={playlist.downloadedAt ? "Remove download" : "Download playlist"}
            title={playlist.downloadedAt ? "Downloaded" : "Download"}
            className={cn(
              "grid h-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95",
              playlist.downloadedAt && "text-primary font-semibold"
            )}
          >
            <Download className="size-4" />
          </button>

          {/* 3. Edit */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditOpen(true);
            }}
            aria-label={`Edit ${playlist.name}`}
            title="Edit"
            className="grid h-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
          >
            <Pencil className="size-4" />
          </button>

          {/* 4. Share */}
          <div className="grid h-9 place-items-center" onClick={(e) => e.stopPropagation()}>
            <ShareToMessageDialog
              message={shareMessage}
              sharedContent={shareContent}
              trigger={
                <button
                  type="button"
                  aria-label={`Share ${playlist.name}`}
                  title="Share"
                  className="grid h-9 w-full place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-95"
                >
                  <Share2 className="size-4" />
                </button>
              }
            />
          </div>

          {/* 5. Delete */}
          <button
            type="button"
            onClick={handleDelete}
            aria-label={`Delete ${playlist.name}`}
            title="Delete"
            className="grid h-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive active:scale-95"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </article>

      {/* Edit Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Playlist</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Name
              </label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Playlist name"
                className="h-11 rounded-xl"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description (optional)
              </label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
