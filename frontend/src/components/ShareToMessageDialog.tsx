import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Copy, Facebook, MessageCircle, Send, Share2 } from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { useChatStore } from "@/stores/useChatStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Song } from "@/types";

type Friend = { clerkId: string; fullName: string; imageUrl: string };
export type SharedContent = {
  type: "song" | "profile" | "playlist" | "post" | "album" | "artist";
  title: string;
  subtitle?: string;
  imageUrl?: string;
  href: string;
  song?: Song;
};

export function ShareToMessageDialog({ trigger, message, sharedContent }: { trigger: ReactNode; message: string; sharedContent?: SharedContent }) {
  const [open, setOpen] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const socket = useChatStore((state) => state.socket);
  const { data: friends = [], isLoading } = useQuery<Friend[]>({
    queryKey: ["shareRecipients"],
    queryFn: async () => (await axiosInstance.get("/friends")).data,
    enabled: open,
    staleTime: 60_000,
  });

  const send = (friend: Friend) => {
    if (!socket.connected) {
      toast.error("Messages are reconnecting. Please try again in a moment.");
      return;
    }
    setSendingTo(friend.clerkId);
    // In BeatBond, the structured card is the share. Do not duplicate it as a
    // raw URL in the chat bubble; external shares still receive the full link.
    const itemLabel = sharedContent?.type === "profile" ? "a profile" : sharedContent?.type === "artist" ? "an artist" : sharedContent?.type === "song" ? "a song" : sharedContent?.type === "album" ? "an album" : "an item";
    const inAppContent = sharedContent ? `Shared ${itemLabel}` : message;
    socket.emit("sendMessage", { receiverId: friend.clerkId, content: inAppContent, sharedContent });
    setSendingTo(null);
    setOpen(false);
    toast.success(`Shared with ${friend.fullName}`);
  };

  const resolvedHref = sharedContent?.href?.startsWith("/") ? `${window.location.origin}${sharedContent.href}` : sharedContent?.href;
  const shareUrl = resolvedHref ?? message.match(/https?:\/\/\S+/)?.[0] ?? window.location.href;
  const shareText = sharedContent?.type === "profile" || sharedContent?.type === "artist" ? `Check out ${sharedContent.title || "this artist"} on BeatBond` : message;
  const encodedMessage = encodeURIComponent(shareText);
  const copyForUnsupportedPlatform = async (platform: string) => {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      toast.success(`Share details copied — paste them into ${platform}`);
    } catch {
      toast.error("Could not copy the share details");
    }
  };
  const openShareWindow = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const openSystemShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: sharedContent?.title || "BeatBond share", text: shareText, url: shareUrl });
      else await copyForUnsupportedPlatform("your preferred app");
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== "AbortError") toast.error("Could not share standard options");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="size-5 text-primary" />Share content</DialogTitle>
          <DialogDescription>Send directly to a BeatBond friend or share to external apps.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {sharedContent && (
            <div className="flex items-center gap-3 rounded-2xl border bg-card/60 p-3 shadow-inner">
              <Avatar className="size-12 rounded-xl">
                <AvatarImage src={sharedContent.imageUrl} />
                <AvatarFallback className="rounded-xl">{sharedContent.title[0] || "S"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{sharedContent.title}</p>
                {sharedContent.subtitle && <p className="truncate text-xs text-muted-foreground">{sharedContent.subtitle}</p>}
              </div>
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Direct message</p>
            {isLoading ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Add friends to share content directly inside chat.</p>
            ) : (
              <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                {friends.map((friend) => (
                  <div key={friend.clerkId} className="flex items-center justify-between rounded-xl p-2 transition-colors hover:bg-secondary/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar className="size-9">
                        <AvatarImage src={friend.imageUrl} />
                        <AvatarFallback>{friend.fullName[0]}</AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm font-medium">{friend.fullName}</span>
                    </div>
                    <Button size="sm" variant="secondary" disabled={sendingTo === friend.clerkId} onClick={() => send(friend)} className="rounded-lg h-8 px-3">
                      <Send className="mr-1.5 size-3.5" />
                      Send
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">External share</p>
            <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
              <button onClick={() => void openSystemShare()} className="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 hover:bg-secondary/60">
                <Share2 className="size-5 text-primary" />
                <span className="truncate">More</span>
              </button>
              <button onClick={() => openShareWindow(`https://wa.me/?text=${encodedMessage}%20${encodeURIComponent(shareUrl)}`)} className="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 hover:bg-secondary/60">
                <MessageCircle className="size-5 text-emerald-500" />
                <span className="truncate">WhatsApp</span>
              </button>
              <button onClick={() => openShareWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)} className="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 hover:bg-secondary/60">
                <Facebook className="size-5 text-blue-600" />
                <span className="truncate">Facebook</span>
              </button>
              <button onClick={() => void copyForUnsupportedPlatform("Clipboard")} className="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 hover:bg-secondary/60">
                <Copy className="size-5 text-amber-500" />
                <span className="truncate">Copy Link</span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
