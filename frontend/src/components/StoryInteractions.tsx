import { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StoryComment = { _id: string; userId: string; content: string; createdAt: string; user?: { fullName: string; imageUrl: string } | null };
type StoryInteractionsData = { comments: StoryComment[]; reactions: Record<string, number>; viewerReaction: string | null };
const REACTIONS = ["❤️", "🔥", "😂", "👏", "😍"];

export const StoryInteractions = ({ storyId, storyAuthorId }: { storyId: string; storyAuthorId: string }) => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const queryKey = ["story-interactions", storyId];
  const { data, isLoading } = useQuery<StoryInteractionsData>({ queryKey, queryFn: async () => (await axiosInstance.get(`/posts/stories/${storyId}/interactions`)).data });
  const commentMutation = useMutation({
    mutationFn: async (value: string) => (await axiosInstance.post(`/posts/stories/${storyId}/comments`, { content: value })).data as StoryComment,
    onSuccess: (comment) => {
      queryClient.setQueryData<StoryInteractionsData>(queryKey, (current) => current ? { ...current, comments: [...current.comments, comment] } : current);
      setContent("");
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Could not post your comment."),
  });
  const reactionMutation = useMutation({
    mutationFn: async (emoji: string) => (await axiosInstance.put(`/posts/stories/${storyId}/reaction`, { emoji })).data as StoryInteractionsData,
    onSuccess: (result) => queryClient.setQueryData(queryKey, result),
    onError: (error: any) => toast.error(error.response?.data?.message || "Could not save your reaction."),
  });
  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => axiosInstance.delete(`/posts/stories/${storyId}/comments/${commentId}`),
    onSuccess: (_result, commentId) => queryClient.setQueryData<StoryInteractionsData>(queryKey, (current) => current ? { ...current, comments: current.comments.filter((comment) => comment._id !== commentId) } : current),
    onError: () => toast.error("Could not delete this comment."),
  });
  const submitComment = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed && trimmed.length <= 500) commentMutation.mutate(trimmed);
  };

  return <section className="mt-3 border-t border-border pt-3" aria-label="Story comments and reactions">
    <div className="mb-3 flex flex-wrap gap-2">
      {REACTIONS.map((emoji) => <Button key={emoji} type="button" size="sm" variant={data?.viewerReaction === emoji ? "secondary" : "outline"} aria-pressed={data?.viewerReaction === emoji} aria-label={`React ${emoji}${data?.reactions[emoji] ? `, ${data.reactions[emoji]} reactions` : ""}`} disabled={reactionMutation.isPending} onClick={() => reactionMutation.mutate(emoji)}>{emoji}<span className="ml-1 text-xs">{data?.reactions[emoji] || 0}</span></Button>)}
    </div>
    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MessageCircle className="size-3.5" />Comments ({data?.comments.length || 0})</div>
    {isLoading ? <Loader2 className="my-3 size-4 animate-spin text-muted-foreground" /> : <div className="mb-3 max-h-36 space-y-2 overflow-y-auto">
      {data?.comments.map((comment) => <div key={comment._id} className="flex items-start gap-2 text-sm"><div className="min-w-0 flex-1"><span className="mr-2 font-semibold">{comment.user?.fullName || "Listener"}</span><span className="break-words text-muted-foreground">{comment.content}</span></div>{(comment.userId === userId || storyAuthorId === userId) && <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Delete comment" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(comment._id)}><Trash2 className="size-3.5 text-destructive" /></Button>}</div>)}
      {!data?.comments.length && <p className="py-1 text-xs text-muted-foreground">No comments yet. Be the first to comment.</p>}
    </div>}
    <form onSubmit={submitComment} className="flex gap-2"><label htmlFor={`story-comment-${storyId}`} className="sr-only">Write a story comment</label><Input id={`story-comment-${storyId}`} value={content} onChange={(event) => setContent(event.target.value)} maxLength={500} placeholder="Add a comment…" disabled={commentMutation.isPending} /><Button type="submit" size="icon" aria-label="Send comment" disabled={!content.trim() || commentMutation.isPending}>{commentMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</Button></form>
  </section>;
};
