import { useEffect } from "react";
import { toast } from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/useChatStore";
import { useUser } from "@clerk/clerk-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface IncomingMessageNotification {
  notificationId: string;
  senderId: string;
  senderName: string;
  senderImageUrl?: string;
  preview: string;
  chatUrl: string;
}

export const GlobalMessageNotifications = () => {
  const socket = useChatStore((state) => state.socket);
  const isConnected = useChatStore((state) => state.isConnected);
  const { user } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const activeConversation = window.location.pathname === "/chat" ? searchParams.get("userId") : null;

  useEffect(() => {
    if (!isConnected || !user?.id) return;
    const onMessageNotification = (notification: IncomingMessageNotification) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (activeConversation === notification.senderId) return;
      toast.custom((t) => (
        <button
          type="button"
          onClick={() => { toast.dismiss(t.id); navigate(notification.chatUrl); }}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left text-card-foreground shadow-xl"
          aria-label={`Message from ${notification.senderName}: ${notification.preview}`}
        >
          <Avatar className="size-11"><AvatarImage src={notification.senderImageUrl} /><AvatarFallback>{notification.senderName?.[0] || "?"}</AvatarFallback></Avatar>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{notification.senderName}</span><span className="block truncate text-xs text-muted-foreground">{notification.preview}</span></span>
          <span className="text-xs font-medium text-primary">Open</span>
        </button>
      ), { duration: 6500, position: "top-right" });
    };
    socket.on("newMessageNotification", onMessageNotification);
    return () => { socket.off("newMessageNotification", onMessageNotification); };
  }, [socket, isConnected, user?.id, activeConversation, navigate, queryClient]);

  return null;
};
