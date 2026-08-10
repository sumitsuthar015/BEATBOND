import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2, Music2, Loader2 } from "lucide-react";
import { useUser } from "@clerk/clerk-react";
import { axiosInstance } from "@/lib/axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Song } from "@/types";

interface CommentItem {
  _id: string;
  userId: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  songImageUrl: string;
  content: string;
  createdAt: string;
  user?: {
    fullName: string;
    username?: string;
    imageUrl: string;
  };
}

interface SongCommentsModalProps {
  song: Song | { _id: string; title: string; artist: string; imageUrl?: string };
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SongCommentsModal = ({ song, trigger, open, onOpenChange }: SongCommentsModalProps) => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const handleOpenChange = (newVal: boolean) => {
    if (isControlled) {
      onOpenChange?.(newVal);
    } else {
      setInternalOpen(newVal);
    }
  };

  const songId = song._id;

  const { data: comments = [], isLoading } = useQuery<CommentItem[]>({
    queryKey: ["song-comments", songId],
    queryFn: async () => (await axiosInstance.get(`/comments/song/${songId}`)).data,
    enabled: isOpen && Boolean(songId),
  });

  const addMutation = useMutation({
    mutationFn: async (content: string) => {
      return (
        await axiosInstance.post("/comments", {
          songId,
          songTitle: song.title,
          songArtist: song.artist,
          songImageUrl: song.imageUrl || "",
          content,
        })
      ).data;
    },
    onSuccess: () => {
      setNewComment("");
      void queryClient.invalidateQueries({ queryKey: ["song-comments", songId] });
      void queryClient.invalidateQueries({ queryKey: ["user-comments"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return (await axiosInstance.delete(`/comments/${commentId}`)).data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["song-comments", songId] });
      void queryClient.invalidateQueries({ queryKey: ["user-comments"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || addMutation.isPending) return;
    addMutation.mutate(newComment.trim());
  };

  const formatTime = (iso: string) => {
    try {
      const date = new Date(iso);
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec < 60) return "just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-md bg-zinc-900 border-zinc-800 text-white p-0 gap-0 overflow-hidden sm:rounded-2xl">
        <DialogHeader className="p-4 border-b border-zinc-800 flex flex-row items-center gap-3">
          <div className="size-11 rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0 border border-zinc-700">
            {song.imageUrl ? (
              <img src={song.imageUrl} alt={song.title} className="size-full object-cover" />
            ) : (
              <Music2 className="size-5 text-zinc-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base font-bold truncate">{song.title}</DialogTitle>
            <p className="text-xs text-zinc-400 truncate">{song.artist}</p>
          </div>
        </DialogHeader>

        <ScrollArea className="h-80 max-h-[50vh] p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full py-12 text-zinc-400 gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-emerald-400" />
              Loading comments…
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center text-zinc-400 space-y-2">
              <MessageSquare className="size-8 text-zinc-600" />
              <p className="font-semibold text-sm text-zinc-300">No comments yet</p>
              <p className="text-xs text-zinc-500">Be the first to share your thoughts on this song!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => {
                const isAuthor = comment.userId === user?.id;
                return (
                  <div key={comment._id} className="flex gap-3 group">
                    <Avatar className="size-8 shrink-0 border border-zinc-800">
                      <AvatarImage src={comment.user?.imageUrl} />
                      <AvatarFallback className="bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                        {comment.user?.fullName?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 bg-zinc-800/40 rounded-xl p-3 border border-zinc-800/60">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {comment.user?.fullName || "BeatBond Listener"}
                        </span>
                        <span className="text-[10px] text-zinc-500 shrink-0">
                          {formatTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                        {comment.content}
                      </p>
                    </div>
                    {isAuthor && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(comment._id)}
                        disabled={deleteMutation.isPending}
                        className="size-7 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 self-center shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {user ? (
          <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-800 flex items-center gap-2 bg-zinc-950/50">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment on this song…"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-emerald-500 transition-colors"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!newComment.trim() || addMutation.isPending}
              className="rounded-full size-8 bg-emerald-500 hover:bg-emerald-600 text-black shrink-0"
            >
              {addMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          </form>
        ) : (
          <div className="p-3 text-center border-t border-zinc-800 text-xs text-zinc-400">
            Sign in to comment on songs.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
