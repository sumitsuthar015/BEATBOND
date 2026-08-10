import React from "react";
import { Album } from "@/types";
import { useSavedAlbumsStore } from "@/stores/useSavedAlbumsStore";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  MoreVertical,
  Bookmark,
  BookmarkCheck,
  Share2,
  Disc,
  Copy,
} from "lucide-react";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";

interface AlbumOptionsMenuProps {
  album: Album;
  variant?: "horizontal" | "vertical";
  buttonClassName?: string;
  align?: "start" | "center" | "end";
}

export const AlbumOptionsMenu: React.FC<AlbumOptionsMenuProps> = ({
  album,
  variant = "horizontal",
  buttonClassName = "",
  align = "end",
}) => {
  const navigate = useNavigate();
  const toggleSaveAlbum = useSavedAlbumsStore((state) => state.toggleSaveAlbum);
  const isAlbumSaved = useSavedAlbumsStore((state) => state.isAlbumSaved);

  const albumId = album.id || album._id;
  const isSaved = isAlbumSaved(albumId);
  const albumTitle = album.name || album.title || "Album";
  const albumArtist = album.artist || `${album.year || album.releaseYear || ""} Album`;
  const albumImage = album.image?.[2]?.url || album.imageUrl || "/default-image.png";

  const handleToggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSaveAlbum({
      ...album,
      id: albumId,
      name: albumTitle,
      imageUrl: albumImage,
      artist: albumArtist,
    });
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/album/${albumId}`;
    void navigator.clipboard.writeText(url);
    toast.success("Album link copied to clipboard");
  };

  const handleOpenAlbum = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/album/${albumId}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={
            buttonClassName ||
            "grid size-8 place-items-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
          }
          aria-label="Album options"
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
        {/* Open Album */}
        <DropdownMenuItem
          onClick={handleOpenAlbum}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer font-medium"
        >
          <Disc className="size-4 text-primary" />
          View Album
        </DropdownMenuItem>

        {/* Save / Bookmark Album */}
        <DropdownMenuItem
          onClick={handleToggleSave}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
        >
          {isSaved ? (
            <>
              <BookmarkCheck className="size-4 text-green-500" />
              Remove from Saved
            </>
          ) : (
            <>
              <Bookmark className="size-4 text-amber-400" />
              Save Album
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-zinc-800/80 my-1" />

        {/* Share Album to Chat */}
        <ShareToMessageDialog
          message={`Check out "${albumTitle}" by ${albumArtist} on BeatBond!`}
          sharedContent={{
            type: "album",
            title: albumTitle,
            subtitle: albumArtist,
            imageUrl: albumImage,
            href: `/album/${albumId}`,
          }}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
            >
              <Share2 className="size-4 text-purple-400" />
              Share Album to Chat
            </DropdownMenuItem>
          }
        />

        {/* Copy Link */}
        <DropdownMenuItem
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 focus:bg-white/10 focus:text-white rounded-lg cursor-pointer"
        >
          <Copy className="size-4 text-blue-400" />
          Copy Album Link
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
