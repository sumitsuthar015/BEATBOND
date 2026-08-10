import { useQuery, useQueryClient, useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Loader2, Trash2, Reply, X, Check, CheckCheck, ArrowLeft, UserMinus, UserRound, MoreVertical, Image, Pencil } from "lucide-react";
import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useUser } from "@clerk/clerk-react";
import { toast } from "react-hot-toast";
import { useInView } from "react-intersection-observer";
import { InfiniteData } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/useChatStore";
import { beginBackNavigation } from "@/lib/routeHistory";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatProps {
  userId: string;
  onBack?: () => void;
}

interface Message {
  _id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  status?: 'sent' | 'delivered' | 'read';
  replyTo?: {
    _id: string;
    content: string;
    senderId: string;
  };
  sharedContent?: {
    type: 'song' | 'profile' | 'playlist' | 'post';
    title: string;
    subtitle?: string;
    imageUrl?: string;
    href: string;
    song?: Song;
  };
}

interface User {
  _id?: string; // friend-relationship id, used for delete
  clerkId: string;
  fullName: string;
  imageUrl: string;
  isOnline?: boolean;
  lastSeen?: string;
}

type FriendLookup = Pick<User, "clerkId" | "fullName" | "imageUrl"> & { _id?: string };

interface MessagePage {
  messages: Message[];
  nextPage?: number;
  totalPages: number;
}

// Format time properly
const formatMessageTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  // Less than 1 minute
  if (diffInSeconds < 60) return 'Just now';

  // Less than 1 hour
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `${mins}m ago`;
  }

  // Same day
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  // Within last week
  if (diffInSeconds < 604800) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  // Older
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
};

const formatPresence = (isOnline?: boolean, lastSeen?: string) => {
  if (isOnline) return "Online";
  if (!lastSeen) return "Offline";

  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return "Offline";

  return `Last seen ${formatMessageTime(lastSeen).toLowerCase()}`;
};

// Message Bubble Component
const MessageBubble = memo(({
  msg,
  isCurrentUser,
  userData,
  user,
  onLongPress,
  onContextMenu,
  renderReadReceipt,
  nickname
}: any) => {
  const isOptimistic = msg._id.startsWith('temp-');
  const touchStartRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sharedContent = msg.sharedContent;
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const navigate = useNavigate();

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = Date.now();
    longPressTimerRef.current = setTimeout(() => {
      onLongPress(msg, e);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  return (
    <div
      className={cn(
        "flex gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200",
        isCurrentUser ? "flex-row-reverse" : "flex-row"
      )}
      data-message-id={msg._id}
      data-sender-id={msg.senderId}
    >
      {!isCurrentUser && (
        <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
          <AvatarImage
            src={userData.imageUrl}
            alt={userData.fullName}
            loading="lazy"
          />
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] sm:text-xs">
            {userData.fullName.charAt(0)}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "flex min-w-0 max-w-[75%] flex-col sm:max-w-[70%] md:max-w-[60%]",
          isCurrentUser ? "items-end" : "items-start"
        )}
      >
        {!isCurrentUser && <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">{nickname || userData.fullName}</p>}
        <div
          className={cn(
            "max-w-full whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-3 py-2 text-[13px] transition-all select-text sm:px-4 sm:py-2.5 sm:text-sm",
            isCurrentUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-zinc-800 text-zinc-100 rounded-tl-sm",
            isOptimistic && "opacity-60"
          )}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          onContextMenu={(event) => onContextMenu(msg, event)}
        >
          {msg.replyTo && (
            <div className={cn(
              "mb-1.5 pb-1.5 border-l-2 pl-2 text-[11px] sm:text-xs opacity-70",
              isCurrentUser ? "border-primary-foreground/30" : "border-zinc-600"
            )}>
              <div className="font-semibold mb-0.5">
                {msg.replyTo.senderId === user?.id ? "You" : (nickname || userData.fullName)}
              </div>
              <div className="line-clamp-2">{msg.replyTo.content}</div>
            </div>
          )}

          {sharedContent && (
            <button
              type="button"
              onClick={() => {
                if (sharedContent.type === "song" && sharedContent.song) {
                  playAlbum([sharedContent.song]);
                  return;
                }
                if (sharedContent.href) navigate(sharedContent.href.startsWith("/") ? sharedContent.href : `/${sharedContent.href}`);
              }}
              className="mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-zinc-900 to-zinc-950 text-left shadow-sm transition hover:opacity-90"
            >
              <div className="flex items-start gap-3 p-3">
                {sharedContent.imageUrl ? (
                  <Avatar className="h-12 w-12 border border-white/10">
                    <AvatarImage src={sharedContent.imageUrl} alt={sharedContent.title} />
                    <AvatarFallback>{sharedContent.title.charAt(0)}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-fuchsia-500/15 text-sm font-semibold text-fuchsia-300">
                    {sharedContent.type === "profile" ? "PF" : "SH"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-fuchsia-300">
                      {sharedContent.type === "profile" ? "shared profile" : sharedContent.type === "song" ? "shared song" : "shared content"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-white">{sharedContent.title}</p>
                  {sharedContent.subtitle ? <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-400">{sharedContent.subtitle}</p> : null}
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold text-zinc-200">{sharedContent.type === "profile" ? "Profile card" : sharedContent.type === "song" ? "Tap to play" : "Shared item"}</p>
                  <p className="text-[10px] text-zinc-500">{sharedContent.type === "song" ? "Plays in BeatBond" : "Opens in BeatBond"}</p>
                </div>
                <div className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary">{sharedContent.type === "song" ? "Play" : "Open"}</div>
              </div>
            </button>
          )}

          {msg.content ? <div className={cn("mt-2", sharedContent && "text-[12px] text-zinc-400")}>{msg.content}</div> : null}
        </div>

        <div className="flex items-center gap-1 mt-0.5 px-1">
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">
            {formatMessageTime(msg.createdAt)}
          </span>
          {isCurrentUser && renderReadReceipt(msg)}
        </div>
      </div>

      {isCurrentUser && <div className="w-7 sm:w-8 flex-shrink-0" />}
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";

// Chat Header - renders the same for mobile and desktop callers
const ChatTopHeader = memo(({
  userData,
  isFriendOnline,
  isSocketConnected,
  onBack,
  onProfile,
  onRemoveFriend,
  onClearChat,
  onShowShared,
  onEditNickname,
  nickname,
}: any) => {
  const presence = formatPresence(isFriendOnline, userData.lastSeen);

  return (
    <div className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur-md sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0"
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
      </Button>

      <button type="button" onClick={onProfile} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left transition-colors hover:bg-secondary/60 sm:gap-3">
        <Avatar className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
          <AvatarImage
            src={userData.imageUrl}
            alt={userData.fullName}
            loading="lazy"
          />
          <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
            {userData.fullName.charAt(0)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 text-left">
          <h2 className="truncate text-sm font-semibold leading-tight sm:text-base">
            {nickname || userData.fullName}
          </h2>
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground sm:text-xs">
            <span className={cn("size-1.5 rounded-full", isSocketConnected && isFriendOnline ? "bg-emerald-400" : "bg-zinc-500")} />
            {isSocketConnected ? presence : "Connecting..."}
          </p>
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Chat options"><MoreVertical className="size-5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => requestAnimationFrame(onShowShared)}><Image className="mr-2 size-4" />Shared songs</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestAnimationFrame(onProfile)}><UserRound className="mr-2 size-4" />View profile</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestAnimationFrame(onEditNickname)}><Pencil className="mr-2 size-4" />Set nickname</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => requestAnimationFrame(onClearChat)}><Trash2 className="mr-2 size-4" />Clear chat</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => requestAnimationFrame(onRemoveFriend)} className="text-destructive focus:text-destructive"><UserMinus className="mr-2 size-4" />Remove friend</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

ChatTopHeader.displayName = "ChatTopHeader";

// Action Menu
const ActionMenu = memo(({
  show,
  position,
  selectedMessage,
  currentUserId,
  onReply,
  onDelete,
  onClose
}: any) => {
  if (!show || !selectedMessage) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 bg-zinc-800 rounded-xl shadow-2xl border border-zinc-700 overflow-hidden"
        style={{
          top: Math.min(position.y, window.innerHeight - 200),
          left: Math.min(position.x - 80, window.innerWidth - 180),
          width: '170px'
        }}
      >
        <button
          onClick={onReply}
          className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-700 transition-colors text-left"
        >
          <Reply className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm font-medium">Reply</span>
        </button>

        {selectedMessage.senderId === currentUserId && (
          <button
            onClick={onDelete}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-zinc-700 transition-colors text-left border-t border-zinc-700"
          >
            <Trash2 className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span className="text-sm font-medium text-red-400">Delete</span>
          </button>
        )}
      </div>
    </>
  );
});

ActionMenu.displayName = "ActionMenu";

// Main Component
export const DirectMessageChat = ({ userId, onBack }: ChatProps) => {
  const { user } = useUser();
  const socket = useChatStore((state) => state.socket);
  const isConnected = useChatStore((state) => state.isConnected);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { ref: topRef, inView: isTopVisible } = useInView();
  const processedMessagesRef = useRef(new Set<string>());
  const pendingMessageRef = useRef<{ tempId: string; content: string } | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [actionMenuPosition, setActionMenuPosition] = useState({ x: 0, y: 0 });
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showRemoveFriendConfirm, setShowRemoveFriendConfirm] = useState(false);
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [showNicknameDialog, setShowNicknameDialog] = useState(false);
  const [nickname, setNickname] = useState(() => localStorage.getItem(`beatbond:nickname:${userId}`) || "");
  const [nicknameDraft, setNicknameDraft] = useState(nickname);

  useEffect(() => {
    const savedNickname = localStorage.getItem(`beatbond:nickname:${userId}`) || "";
    setNickname(savedNickname);
    setNicknameDraft(savedNickname);
  }, [userId]);

  const {
    data: messages,
    isLoading: isLoadingMessages,
    isError: isMessagesError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch: refetchMessages,
  } = useInfiniteQuery<MessagePage>({
    queryKey: ["messages", userId],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await axiosInstance.get(
        `/users/messages/${userId}?page=${pageParam}&limit=30`
      );
      return data;
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 1000 * 60,
  });

  const {
    data: userData,
    isLoading: isLoadingUser,
    isError: isUserError,
    refetch: refetchUser,
  } = useQuery<User>({
    queryKey: ["user", userId],
    queryFn: async () => {
      try {
        const { data } = await axiosInstance.get(`/users/profile/${userId}`);
        return data;
      } catch (profileError) {
        // Older shared links can contain a friendship document id. Recover the
        // real Clerk id from the user's own friend list before giving up.
        const { data: friends } = await axiosInstance.get<FriendLookup[]>("/friends");
        const match = friends.find((friend) => friend.clerkId === userId || friend._id === userId);
        if (!match) throw profileError;
        const { data } = await axiosInstance.get(`/users/profile/${match.clerkId}`);
        return data;
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: sharedMessages = [], isLoading: isLoadingShared } = useQuery<Message[]>({
    queryKey: ["sharedMessages", userId],
    queryFn: async () => (await axiosInstance.get(`/users/messages/${userId}/shared`)).data,
    enabled: showSharedMedia,
    staleTime: 30_000,
  });

  const emit = useCallback((event: string, data?: any) => {
    if (!socket?.connected) return false;
    socket.emit(event, data);
    return true;
  }, [socket]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate(beginBackNavigation(), { replace: true });
    }
  }, [onBack, navigate]);

  // Remove / delete this friend - works the same whether opened from mobile or desktop layout
  const { mutate: removeFriend, isPending: isRemovingFriend } = useMutation({
    mutationFn: async () => {
      const idForDelete = userData?._id ?? userId;
      await axiosInstance.delete(`/friends/${idForDelete}`);
    },
    onSuccess: () => {
      toast.success(`${userData?.fullName ?? "Friend"} removed`);
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      handleBack();
    },
    onError: () => {
      toast.error("Failed to remove friend");
    },
    onSettled: () => {
      setShowRemoveFriendConfirm(false);
    },
  });

  const { mutate: clearChat, isPending: isClearingChat } = useMutation({
    mutationFn: async () => { await axiosInstance.delete(`/users/messages/${userId}/clear`); },
    onSuccess: () => {
      queryClient.setQueryData<InfiniteData<MessagePage>>(["messages", userId], { pages: [{ messages: [], totalPages: 0 }], pageParams: [1] });
      queryClient.invalidateQueries({ queryKey: ["sharedMessages", userId] });
      toast.success("Chat cleared");
    },
    onError: () => toast.error("Failed to clear chat"),
    onSettled: () => setShowClearChatConfirm(false),
  });

  const saveNickname = () => {
    const value = nicknameDraft.trim().slice(0, 40);
    if (value) localStorage.setItem(`beatbond:nickname:${userId}`, value);
    else localStorage.removeItem(`beatbond:nickname:${userId}`);
    window.dispatchEvent(new CustomEvent("beatbond:nickname-updated", { detail: { userId, nickname: value } }));
    setNickname(value);
    setShowNicknameDialog(false);
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isLoadingMessages && messages?.pages?.[0]?.messages) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      });
    }
  }, [isLoadingMessages, messages?.pages]);

  const markMessageAsRead = useCallback((messageId: string) => {
    if (!socket?.connected) return;
    emit("markMessageAsRead", { messageId });
    queryClient.setQueryData<any[]>(["friends"], (friends = []) =>
      friends.map((friend) => friend.clerkId === userId ? { ...friend, unreadCount: 0 } : friend)
    );
    queryClient.invalidateQueries({ queryKey: ["friends"] });
  }, [socket, emit, queryClient, userId]);

  useEffect(() => {
    const allMessages = messages?.pages.flatMap((page) => page.messages) || [];

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute('data-message-id');
            const senderId = entry.target.getAttribute('data-sender-id');

            if (messageId && senderId && senderId !== user?.id) {
              const message = allMessages.find(m => m._id === messageId);
              if (message && message.status !== 'read') {
                markMessageAsRead(messageId);
              }
            }
          }
        });
      },
      { root: chatContainerRef.current, threshold: 0.5 }
    );

    const messageElements = document.querySelectorAll('[data-message-id]');
    messageElements.forEach((el) => {
      if (observerRef.current) {
        observerRef.current.observe(el);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [messages, user, markMessageAsRead]);

  const handleMessageReceived = useCallback((data: { message: Message }) => {
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    const messageId = data.message._id;
    if (processedMessagesRef.current.has(messageId)) return;

    if (data.message.senderId === userId) {
      processedMessagesRef.current.add(messageId);

      queryClient.setQueryData<InfiniteData<MessagePage>>(
        ["messages", userId],
        (oldData) => {
          if (!oldData) return oldData;

          const messageExists = oldData.pages.some((page) =>
            page.messages.some((msg) => msg._id === messageId)
          );

          if (messageExists) return oldData;

          const newPages = [...oldData.pages];
          newPages[0] = {
            ...newPages[0],
            messages: [...newPages[0].messages, data.message],
          };

          return { ...oldData, pages: newPages };
        }
      );

      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [userId, queryClient]);

  const handleMessageSent = useCallback((data: { message: Message }) => {
    queryClient.invalidateQueries({ queryKey: ["friends"] });
    queryClient.setQueryData<InfiniteData<MessagePage>>(
      ["messages", userId],
      (oldData) => {
        if (!oldData) {
          return {
            pages: [{ messages: [data.message], totalPages: 1 }],
            pageParams: [1],
          };
        }

        let replacedTemp = false;
        const newPages = oldData.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) => {
            if (msg._id.startsWith('temp-')) {
              replacedTemp = true;
              return { ...data.message, status: data.message.status || 'sent' };
            }
            return msg;
          }),
        }));

        if (!replacedTemp) {
          const firstPageIndex = 0;
          const exists = newPages.some((page) =>
            page.messages.some((msg) => msg._id === data.message._id)
          );

          if (!exists) {
            newPages[firstPageIndex] = {
              ...newPages[firstPageIndex],
              messages: [...newPages[firstPageIndex].messages, data.message],
            };
          }
        }

        return { ...oldData, pages: newPages };
      }
    );

    processedMessagesRef.current.add(data.message._id);
    pendingMessageRef.current = null;
    setIsSending(false);
  }, [userId, queryClient]);

  const handleMessageError = useCallback((error: { message?: string }) => {
    const pending = pendingMessageRef.current;

    if (pending) {
      queryClient.setQueryData<InfiniteData<MessagePage>>(
        ["messages", userId],
        (oldData) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              messages: page.messages.filter((msg) => msg._id !== pending.tempId),
            })),
          };
        }
      );

      setMessage(pending.content);
      pendingMessageRef.current = null;
    }

    setIsSending(false);
    toast.error(error?.message || "Failed to send message");
  }, [queryClient, userId]);

  const handleMessageStatusUpdate = useCallback((data: { messageId: string; status: 'sent' | 'delivered' | 'read' }) => {
    queryClient.setQueryData<InfiniteData<MessagePage>>(
      ["messages", userId],
      (oldData) => {
        if (!oldData) return oldData;

        const newPages = oldData.pages.map((page) => ({
          ...page,
          messages: page.messages.map((msg) =>
            msg._id === data.messageId ? { ...msg, status: data.status } : msg
          ),
        }));

        return { ...oldData, pages: newPages };
      }
    );
  }, [userId, queryClient]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.on("messageReceived", handleMessageReceived);
    socket.on("messageSent", handleMessageSent);
    socket.on("messageStatusUpdate", handleMessageStatusUpdate);
    socket.on("messageError", handleMessageError);

    return () => {
      socket.off("messageReceived", handleMessageReceived);
      socket.off("messageSent", handleMessageSent);
      socket.off("messageStatusUpdate", handleMessageStatusUpdate);
      socket.off("messageError", handleMessageError);
    };
  }, [socket, isConnected, handleMessageReceived, handleMessageSent, handleMessageStatusUpdate, handleMessageError]);

  useEffect(() => {
    if (isTopVisible && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [isTopVisible, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleLongPress = useCallback((msg: Message, e: React.TouchEvent) => {
    if (!isMobile) return;

    const touch = e.touches[0];
    setSelectedMessage(msg);
    setActionMenuPosition({
      x: touch.clientX,
      y: touch.clientY
    });
    setShowActionMenu(true);

    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }, [isMobile]);

  const handleContextMenu = useCallback((msg: Message, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedMessage(msg);
    setActionMenuPosition({
      x: e.clientX,
      y: e.clientY
    });
    setShowActionMenu(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedMessage) return;

    try {
      await axiosInstance.delete(`/users/messages/${selectedMessage._id}`);

      queryClient.setQueryData<InfiniteData<MessagePage>>(
        ["messages", userId],
        (oldData) => {
          if (!oldData) return oldData;

          const newPages = oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((msg) => msg._id !== selectedMessage._id),
          }));

          return { ...oldData, pages: newPages };
        }
      );

      toast.success("Message deleted");
    } catch {
      toast.error("Failed to delete message");
    } finally {
      setShowActionMenu(false);
      setSelectedMessage(null);
    }
  }, [selectedMessage, queryClient, userId]);

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    setReplyingTo(selectedMessage);
    setShowActionMenu(false);
    setSelectedMessage(null);
  }, [selectedMessage]);

  const closeActionMenu = useCallback(() => {
    setShowActionMenu(false);
    setSelectedMessage(null);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !socket?.connected || !user || isSending) return;

    const trimmedMessage = message.trim();
    const tempId = `temp-${Date.now()}-${Math.random()}`;

    try {
      setIsSending(true);
      setMessage("");
      pendingMessageRef.current = { tempId, content: trimmedMessage };

      const optimisticMessage: Message = {
        _id: tempId,
        senderId: user.id,
        receiverId: userId,
        content: trimmedMessage,
        createdAt: new Date().toISOString(),
        status: 'sent',
        ...(replyingTo && {
          replyTo: {
            _id: replyingTo._id,
            content: replyingTo.content,
            senderId: replyingTo.senderId,
          }
        })
      };

      queryClient.setQueryData<InfiniteData<MessagePage>>(
        ["messages", userId],
        (oldData) => {
          if (!oldData) {
            return {
              pages: [{ messages: [optimisticMessage], totalPages: 1 }],
              pageParams: [1],
            };
          }

          const newPages = [...oldData.pages];

          newPages[0] = {
            ...newPages[0],
            messages: [...newPages[0].messages, optimisticMessage],
          };

          return { ...oldData, pages: newPages };
        }
      );

      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });

      const didEmit = emit("sendMessage", {
        receiverId: userId,
        content: trimmedMessage,
        ...(replyingTo && { replyTo: replyingTo._id })
      });

      if (!didEmit) {
        throw new Error("Socket is not connected");
      }

      setReplyingTo(null);

    } catch {
      toast.error("Failed to send message");
      setMessage(trimmedMessage);
      setIsSending(false);
    }
  }, [message, socket, user, isSending, replyingTo, userId, emit, queryClient]);

  const renderReadReceipt = useCallback((msg: Message) => {
    if (msg.senderId !== user?.id) return null;

    if (msg._id.startsWith('temp-')) {
      return <Check className="h-3 w-3 text-zinc-400" />;
    }

    switch (msg.status) {
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-zinc-400" />;
      default:
        return <Check className="h-3 w-3 text-zinc-400" />;
    }
  }, [user]);

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isUserError || !userData) {
    return (
      <div className="flex items-center justify-center h-full px-6 text-center">
        <div className="space-y-3">
          <h2 className="font-semibold">Unable to open chat</h2>
          <p className="text-sm text-muted-foreground">
            This user may no longer be available.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchUser()}>
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={handleBack}>
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const allMessages = messages?.pages.flatMap((page) => page.messages) || [];
  const isSocketConnected = Boolean(socket?.connected);
  // `onlineUsers` is the server's live Socket.IO snapshot. API profile data
  // can only describe a past connection and must not keep a user "online".
  const isFriendOnline = onlineUsers.has(userId);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {!isSocketConnected && (
        <div className="px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-center">
          <p className="text-xs text-yellow-600">Reconnecting...</p>
        </div>
      )}

      <ChatTopHeader
        userData={userData}
        isFriendOnline={isFriendOnline}
        isSocketConnected={isSocketConnected}
        onBack={handleBack}
        onProfile={() => navigate(`/profile/${userId}`)}
        onRemoveFriend={() => setShowRemoveFriendConfirm(true)}
        onClearChat={() => setShowClearChatConfirm(true)}
        onShowShared={() => setShowSharedMedia(true)}
        onEditNickname={() => { setNicknameDraft(nickname); setShowNicknameDialog(true); }}
        nickname={nickname}
      />

      <ActionMenu
        show={showActionMenu}
        position={actionMenuPosition}
        selectedMessage={selectedMessage}
        currentUserId={user?.id}
        onReply={handleReply}
        onDelete={handleDelete}
        onClose={closeActionMenu}
      />

      <div
        ref={chatContainerRef}
        className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-zinc-950/50 to-background"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end px-3 py-4 sm:px-5 sm:py-5">
          {hasNextPage && <div ref={topRef} className="h-1" />}

          {isFetchingNextPage && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}

          {!isLoadingMessages && isMessagesError && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <h3 className="font-semibold">Messages couldn't load</h3>
              <p className="text-sm text-muted-foreground">
                Check your connection and try again.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchMessages()}>
                Retry
              </Button>
            </div>
          )}

          {!isLoadingMessages && !isMessagesError && allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Send className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">No messages yet</h3>
                <p className="text-sm text-muted-foreground">
                  Start chatting with {userData.fullName}!
                </p>
              </div>
            </div>
          )}

          {isLoadingMessages && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!isLoadingMessages && !isMessagesError && allMessages.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              {allMessages.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  isCurrentUser={msg.senderId === user?.id}
                  userData={userData}
                  user={user}
                  nickname={nickname}
                  onLongPress={handleLongPress}
                  onContextMenu={handleContextMenu}
                  renderReadReceipt={renderReadReceipt}
                />
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {replyingTo && (
        <div className="px-3 sm:px-4 py-2 bg-zinc-800/50 border-t flex items-center gap-2">
          <Reply className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-primary">
              Replying to {replyingTo.senderId === user?.id ? "yourself" : userData.fullName}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {replyingTo.content}
            </div>
          </div>
          <button onClick={cancelReply} className="p-1 hover:bg-zinc-700 rounded-full">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="sticky bottom-0 shrink-0 border-t bg-background/95 p-3 backdrop-blur-md sm:p-4">
        <form onSubmit={handleSendMessage} className="mx-auto flex max-w-3xl gap-2 rounded-2xl border bg-card p-1.5 shadow-lg">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={isSocketConnected ? "Type a message..." : "Connecting..."}
            className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
            disabled={isSending || !isSocketConnected}
          />
          <Button type="submit" size="icon" disabled={!message.trim() || isSending || !isSocketConnected}>
            {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>

      {/* Remove friend confirmation - same dialog for mobile & desktop */}
      <AlertDialog
        open={showRemoveFriendConfirm}
        onOpenChange={setShowRemoveFriendConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserMinus className="h-5 w-5 text-red-400" />
              Remove {userData.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes {userData.fullName} from your friends list and takes
              you back to your chat list. They won't be notified, and you can
              add them again later if you change your mind.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingFriend}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemovingFriend}
              onClick={() => removeFriend()}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isRemovingFriend ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearChatConfirm} onOpenChange={setShowClearChatConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Clear this chat?</AlertDialogTitle><AlertDialogDescription>This permanently removes messages for both people in this conversation.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={isClearingChat}>Cancel</AlertDialogCancel><AlertDialogAction disabled={isClearingChat} onClick={() => clearChat()} className="bg-destructive hover:bg-destructive/90">{isClearingChat ? <Loader2 className="size-4 animate-spin" /> : "Clear chat"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showNicknameDialog} onOpenChange={setShowNicknameDialog}>
        <DialogContent><DialogHeader><DialogTitle>Set a nickname</DialogTitle><DialogDescription>Choose a name that only you will see for {userData.fullName}.</DialogDescription></DialogHeader><Input value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} maxLength={40} placeholder={userData.fullName} autoFocus /><DialogFooter><Button variant="outline" onClick={() => setShowNicknameDialog(false)}>Cancel</Button><Button onClick={saveNickname}>Save</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={showSharedMedia} onOpenChange={setShowSharedMedia}>
        <DialogContent className="max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>Shared songs</DialogTitle><DialogDescription>Songs shared in this chat.</DialogDescription></DialogHeader>{isLoadingShared ? <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin" /></div> : sharedMessages.length ? <div className="space-y-2">{sharedMessages.map((shared) => <button key={shared._id} type="button" onClick={() => { const song = shared.sharedContent?.song; if (song) playAlbum([song]); else if (shared.sharedContent?.href) navigate(shared.sharedContent.href); setShowSharedMedia(false); }} className="flex w-full items-center gap-3 rounded-xl border p-2 text-left hover:bg-secondary"><Avatar className="size-10"><AvatarImage src={shared.sharedContent?.imageUrl} /><AvatarFallback>{shared.sharedContent?.title?.[0] || "M"}</AvatarFallback></Avatar><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{shared.sharedContent?.title}</span><span className="block truncate text-xs text-muted-foreground">Song</span></span></button>)}</div> : <p className="py-10 text-center text-sm text-muted-foreground">No shared songs yet.</p>}</DialogContent>
      </Dialog>
    </div>
  );
};
