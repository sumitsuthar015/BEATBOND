import React, { useState } from "react";
import { Song } from "@/types";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import { useSongDownload } from "@/hooks/useOfflineDownloads";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  MoreVertical,
  ListVideo,
  ListMusic,
  ListPlus,
  Heart,
  Download,
  CircleCheck,
  Loader2,
  Plus,
  Play,
  Share2,
  MessageSquare,
} from "lucide-react";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";
import { SongCommentsModal } from "@/components/SongCommentsModal";

interface SongOptionsMenuProps {
  song: Song;
  variant?: "horizontal" | "vertical";
  className?: string;
  buttonClassName?: string;
  align?: "start" | "center" | "end";
}

export const SongOptionsMenu: React.FC<SongOptionsMenuProps> = ({
  song,
  variant = "horizontal",
  buttonClassName = "",
  align = "end",
}) => {
  const addPlayNext = usePlayerStore((state) => state.addPlayNext);
  const addToQueue = usePlayerStore((state) => state.addToQueue);
  const setCurrentSong = usePlayerStore((state) => state.setCurrentSong);

  const songs = useMusicStore((state) => state.songs);
  const toggleLike = useMusicStore((state) => state.toggleLike);

  const playlists = usePlaylistStore((state) => state.playlists);
  const addSongToPlaylist = usePlaylistStore((state) => state.addSongToPlaylist);
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const download = useSongDownload(song);

  const isLiked = Boolean(
    songs.find((s) => s._id === song._id)?.isLiked || song.isLiked
  );

  const handlePlaySong = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSong(song);
  };

  const handlePlayNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    addPlayNext(song);
  };

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToQueue(song);
  };

  const handleToggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    void toggleLike(song._id);
  };

  const handleAddToPlaylist = (playlistId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    void addSongToPlaylist(playlistId, song);
  };

  const handleCreateAndAddToPlaylist = () => {
    if (newPlaylistName.trim()) {
      void createPlaylist(newPlaylistName.trim(), "", song);
      setNewPlaylistName("");
      setIsCreateDialogOpen(false);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    void download.toggle();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={
              buttonClassName ||
              "grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            }
            aria-label="Song options"
            title="More options"
          >
            {variant === "vertical" ? (
              <MoreVertical className="size-4" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="w-56 bg-zinc-900 border-zinc-800 text-white z-50 shadow-2xl rounded-xl p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Play Now */}
          <DropdownMenuItem
            onClick={handlePlaySong}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer font-medium"
          >
            <Play className="size-4 text-green-500 fill-current" />
            Play Now
          </DropdownMenuItem>

          {/* Play Next */}
          <DropdownMenuItem
            onClick={handlePlayNext}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
          >
            <ListVideo className="size-4 text-primary" />
            Play Next
          </DropdownMenuItem>

          {/* Add to Queue */}
          <DropdownMenuItem
            onClick={handleAddToQueue}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
          >
            <ListMusic className="size-4 text-cyan-400" />
            Add to Queue
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-zinc-800/80 my-1" />

          {/* Add to Playlist Submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer">
              <ListPlus className="size-4 text-amber-400" />
              Add to Playlist
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 bg-zinc-900 border-zinc-800 text-white z-50 shadow-xl rounded-xl p-1.5 max-h-60 overflow-y-auto">
              {playlists.map((playlist) => (
                <DropdownMenuItem
                  key={playlist.id}
                  onClick={(e) => handleAddToPlaylist(playlist.id, e)}
                  className="px-3 py-2 text-sm text-zinc-300 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer truncate"
                >
                  {playlist.name}
                </DropdownMenuItem>
              ))}
              {playlists.length > 0 && <DropdownMenuSeparator className="bg-zinc-800/80 my-1" />}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setIsCreateDialogOpen(true);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-green-400 focus:bg-white/10 focus:text-green-300 rounded-lg cursor-pointer font-medium"
              >
                <Plus className="size-4" />
                Create New Playlist
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Like Song */}
          <DropdownMenuItem
            onClick={handleToggleLike}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
          >
            <Heart className={`size-4 ${isLiked ? "fill-red-500 text-red-500" : ""}`} />
            {isLiked ? "Remove from Liked" : "Add to Liked Songs"}
          </DropdownMenuItem>

          {/* Download: shows whether this song is already saved for offline */}
          <DropdownMenuItem
            onClick={handleDownload}
            disabled={download.downloading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
          >
            {download.downloading ? (
              <Loader2 className="size-4 animate-spin text-blue-400" />
            ) : download.downloaded ? (
              <CircleCheck className="size-4 text-green-500" />
            ) : (
              <Download className="size-4 text-blue-400" />
            )}
            {download.downloading ? "Downloading…" : download.downloaded ? "Remove download" : "Download"}
          </DropdownMenuItem>

          {/* Share */}
          <ShareToMessageDialog
            message={`Check out "${song.title}" by ${song.artist} on BeatBond!`}
            sharedContent={{
              type: "song",
              title: song.title,
              subtitle: song.artist,
              imageUrl: song.imageUrl,
              href: `/search?q=${encodeURIComponent(song.title)}`,
              song,
            }}
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
              >
                <Share2 className="size-4 text-purple-400" />
                Share Song
              </DropdownMenuItem>
            }
          />

          {/* Comments */}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setIsCommentsOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
          >
            <MessageSquare className="size-4 text-emerald-400" />
            Comments
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Comments Modal */}
      <SongCommentsModal song={song} open={isCommentsOpen} onOpenChange={setIsCommentsOpen} />

      {/* Create Playlist Modal */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create New Playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="newPlaylistName">Playlist Name</Label>
              <Input
                id="newPlaylistName"
                placeholder="My Awesome Playlist"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateAndAddToPlaylist();
                }}
                className="bg-zinc-800 border-zinc-700 text-white focus:border-green-500 rounded-xl"
              />
            </div>
            <Button
              onClick={handleCreateAndAddToPlaylist}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl"
            >
              Create & Add "{song.title}"
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
