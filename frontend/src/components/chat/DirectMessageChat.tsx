import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { useInView } from "react-intersection-observer";
import {
  ArrowLeft, Ban, Bell, BellOff, Check, CheckCheck, ChevronDown, Copy, ListMusic, Loader2, MoreVertical, Music2, Pencil, Reply,
  Send, SmilePlus, Trash2, UserMinus, UserRound, X,
} from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { REACTIONS, buildChatItems, canEditMessage, clockTime, summarizeReactions, toggleReaction, type Reaction } from "@/lib/chat";
import { beginBackNavigation } from "@/lib/routeHistory";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/useChatStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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
  editedAt?: string | null;
  status?: "sent" | "delivered" | "read";
  reactions?: Reaction[];
  replyTo?: { _id: string; content: string; senderId: string } | null;
  sharedContent?: {
    type: "song" | "profile" | "playlist" | "post" | "album" | "artist";
    title: string;
    subtitle?: string;
    imageUrl?: string;
    href: string;
    song?: Song;
  };
}

interface ChatUser {
  _id?: string; // friend-relationship id, used for delete
  clerkId: string;
  fullName: string;
  imageUrl: string;
  isOnline?: boolean;
  lastSeen?: string;
}

type FriendSummary = Pick<ChatUser, "clerkId" | "fullName" | "imageUrl"> & { _id?: string; isMuted?: boolean };

interface MessagePage {
  messages: Message[];
  nextPage?: number;
  totalPages: number;
}

type Messages = InfiniteData<MessagePage> | undefined;
type ActionsState = { message: Message; x: number; y: number } | null;

// ---- Cache helpers: page 0 holds the newest messages, oldest first. ----
const mapMessages = (data: Messages, update: (messages: Message[]) => Message[]) =>
  data && { ...data, pages: data.pages.map((page) => ({ ...page, messages: update(page.messages) })) };

const appendMessage = (data: Messages, message: Message): InfiniteData<MessagePage> => {
  if (!data) return { pages: [{ messages: [message], totalPages: 1 }], pageParams: [1] };
  if (data.pages.some((page) => page.messages.some((existing) => existing._id === message._id))) return data;
  const pages = [...data.pages];
  pages[0] = { ...pages[0], messages: [...pages[0].messages, message] };
  return { ...data, pages };
};

const formatLastSeen = (lastSeen?: string) => {
  if (!lastSeen) return "";
  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  if (date.toDateString() === new Date().toDateString()) return `Last seen today at ${clockTime(date)}`;
  return `Last seen ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
};

const isTouchDevice = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;
const isShareCaption = (content: string) => /^Shared (a|an) /.test(content);

// ---- Pieces ----
const DaySeparator = ({ label }: { label: string }) => (
  <div className="sticky top-2 z-10 my-3 flex justify-center">
    <span className="rounded-full bg-secondary/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">{label}</span>
  </div>
);

const TypingBubble = ({ imageUrl, name }: { imageUrl: string; name: string }) => (
  <div className="flex items-end gap-2" aria-live="polite" aria-label={`${name} is typing`}>
    <Avatar className="size-7"><AvatarImage src={imageUrl} /><AvatarFallback className="text-[10px]">{name[0]}</AvatarFallback></Avatar>
    <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-secondary px-4 py-3">
      {[0, 150, 300].map((delay) => <span key={delay} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${delay}ms` }} />)}
    </span>
  </div>
);

type BubbleProps = {
  msg: Message;
  isMine: boolean;
  startsGroup: boolean;
  endsGroup: boolean;
  friend: ChatUser;
  friendName: string;
  myId?: string;
  onOpenActions: (message: Message, x: number, y: number) => void;
  onReact: (message: Message, emoji: string) => void;
};

const ReadReceipt = ({ msg }: { msg: Message }) => {
  if (msg._id.startsWith("temp-")) return <Loader2 className="size-3 animate-spin opacity-70" />;
  if (msg.status === "read") return <CheckCheck className="size-3.5 text-sky-400" aria-label="Read" />;
  if (msg.status === "delivered") return <CheckCheck className="size-3.5 opacity-70" aria-label="Delivered" />;
  return <Check className="size-3.5 opacity-70" aria-label="Sent" />;
};

const MessageBubble = memo(({ msg, isMine, startsGroup, endsGroup, friend, friendName, myId, onOpenActions, onReact }: BubbleProps) => {
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const navigate = useNavigate();
  const pressTimer = useRef<number | null>(null);
  const shared = msg.sharedContent;
  const reactions = summarizeReactions(msg.reactions, myId);
  const isTemp = msg._id.startsWith("temp-");

  const startPress = (event: ReactTouchEvent) => {
    if (isTemp) return;
    const touch = event.touches[0];
    pressTimer.current = window.setTimeout(() => {
      navigator.vibrate?.(30);
      onOpenActions(msg, touch.clientX, touch.clientY);
    }, 450);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const openFromMouse = (event: ReactMouseEvent) => {
    event.preventDefault();
    if (!isTemp) onOpenActions(msg, event.clientX, event.clientY);
  };

  return (
    <div
      className={cn("group flex items-end gap-2", isMine ? "flex-row-reverse" : "flex-row", startsGroup ? "mt-3" : "mt-0.5")}
      data-message-id={msg._id}
      data-sender-id={msg.senderId}
    >
      {!isMine && (
        endsGroup
          ? <Avatar className="size-7 shrink-0"><AvatarImage src={friend.imageUrl} alt="" loading="lazy" /><AvatarFallback className="bg-primary/10 text-[10px] text-primary">{friendName[0]}</AvatarFallback></Avatar>
          : <span className="w-7 shrink-0" />
      )}

      <div className={cn("flex min-w-0 max-w-[78%] flex-col sm:max-w-[65%]", isMine ? "items-end" : "items-start")}>
        <div
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          onContextMenu={openFromMouse}
          className={cn(
            "max-w-full select-text whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed [overflow-wrap:anywhere]",
            isMine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
            isMine ? (endsGroup ? "rounded-br-md" : "") : (endsGroup ? "rounded-bl-md" : ""),
            isTemp && "opacity-70",
          )}
        >
          {msg.replyTo && (
            <div className={cn("mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs", isMine ? "border-primary-foreground/40 bg-primary-foreground/10" : "border-primary/60 bg-background/40")}>
              <p className="font-semibold">{msg.replyTo.senderId === myId ? "You" : friendName}</p>
              <p className="line-clamp-2 opacity-80">{msg.replyTo.content}</p>
            </div>
          )}

          {shared && (
            <button
              type="button"
              onClick={() => {
                if (shared.type === "song" && shared.song) return playAlbum([shared.song]);
                if (shared.href) navigate(shared.href.startsWith("/") ? shared.href : `/${shared.href}`);
              }}
              className="my-0.5 flex w-64 max-w-full items-center gap-3 rounded-xl bg-black/25 p-2 text-left text-white transition hover:bg-black/35"
            >
              <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-white/10">
                {shared.imageUrl && <img src={shared.imageUrl} alt="" className="size-full object-cover" />}
                {shared.type === "song" && <span className="absolute inset-0 grid place-items-center bg-black/30"><Music2 className="size-5" /></span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{shared.title}</span>
                <span className="block truncate text-xs opacity-75">{shared.subtitle || (shared.type === "profile" ? "Profile" : "Open in BeatBond")}</span>
                <span className="mt-0.5 block text-[11px] font-semibold opacity-90">{shared.type === "song" ? "▶ Tap to play" : "Open"}</span>
              </span>
            </button>
          )}

          {msg.content && !(shared && isShareCaption(msg.content)) && <span>{msg.content}</span>}

          <span className={cn("float-right ml-2 mt-1 inline-flex translate-y-0.5 items-center gap-1 text-[10px]", isMine ? "text-primary-foreground/70" : "text-muted-foreground")}>
            {msg.editedAt && <span>edited</span>}
            {clockTime(msg.createdAt)}
            {isMine && <ReadReceipt msg={msg} />}
          </span>
        </div>

        {reactions.length > 0 && (
          <div className={cn("-mt-1.5 flex flex-wrap gap-1", isMine ? "mr-2 justify-end" : "ml-2")}>
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact(msg, reaction.emoji)}
                aria-label={`${reaction.emoji} ${reaction.count}${reaction.mine ? ", your reaction" : ""}`}
                className={cn("flex items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-xs shadow-sm", reaction.mine && "border-primary/60")}
              >
                {reaction.emoji}{reaction.count > 1 && <span className="text-[10px] text-muted-foreground">{reaction.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: a visible way into the message menu besides right-click. */}
      {!isTemp && (
        <button
          type="button"
          onClick={(event) => onOpenActions(msg, event.clientX, event.clientY)}
          aria-label="React or reply"
          className="hidden size-7 shrink-0 place-items-center self-center rounded-full text-muted-foreground opacity-0 transition hover:bg-secondary group-hover:opacity-100 focus-visible:opacity-100 md:grid"
        >
          <SmilePlus className="size-4" />
        </button>
      )}
    </div>
  );
});
MessageBubble.displayName = "MessageBubble";

type ActionsProps = {
  state: ActionsState;
  myId?: string;
  onClose: () => void;
  onReact: (message: Message, emoji: string) => void;
  onReply: (message: Message) => void;
  onCopy: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message, scope: "me" | "everyone") => void;
};

/** Reactions and actions for one message (long-press, right-click or the smile button). */
const MessageActions = ({ state, myId, onClose, onReact, onReply, onCopy, onEdit, onDelete }: ActionsProps) => {
  useEffect(() => {
    if (!state) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onClose]);
  if (!state) return null;
  const { message } = state;
  const isMine = message.senderId === myId;
  const myReaction = message.reactions?.find((reaction) => reaction.userId === myId)?.emoji;
  const width = 248;
  const left = Math.min(Math.max(state.x - width / 2, 8), window.innerWidth - width - 8);
  const top = Math.min(Math.max(state.y - 20, 8), window.innerHeight - 330);
  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary";
  const run = (action: () => void) => () => { action(); onClose(); };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div role="menu" className="fixed z-50 overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl" style={{ left, top, width }}>
        <div className="flex justify-between border-b px-2 py-2">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={run(() => onReact(message, emoji))}
              aria-label={`React ${emoji}`}
              className={cn("grid size-9 place-items-center rounded-full text-xl transition-transform hover:scale-125", myReaction === emoji && "bg-primary/20")}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button type="button" role="menuitem" className={item} onClick={run(() => onReply(message))}><Reply className="size-4" />Reply</button>
        {message.content && <button type="button" role="menuitem" className={item} onClick={run(() => onCopy(message))}><Copy className="size-4" />Copy text</button>}
        {canEditMessage(message, myId) && !message.sharedContent && (
          <button type="button" role="menuitem" className={item} onClick={run(() => onEdit(message))}><Pencil className="size-4" />Edit</button>
        )}
        <button type="button" role="menuitem" className={item} onClick={run(() => onDelete(message, "me"))}><Trash2 className="size-4" />Delete for me</button>
        {isMine && (
          <button type="button" role="menuitem" className={cn(item, "text-destructive")} onClick={run(() => onDelete(message, "everyone"))}><Trash2 className="size-4" />Delete for everyone</button>
        )}
      </div>
    </>
  );
};

// ---- The chat ----
export const DirectMessageChat = ({ userId, onBack }: ChatProps) => {
  const { user } = useUser();
  const myId = user?.id;
  const socket = useChatStore((state) => state.socket);
  const isConnected = useChatStore((state) => state.isConnected);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [actions, setActions] = useState<ActionsState>(null);
  const [friendTyping, setFriendTyping] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const [dialog, setDialog] = useState<null | "remove" | "clear" | "block" | "nickname" | "shared">(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem(`beatbond:nickname:${userId}`) || "");
  const [nicknameDraft, setNicknameDraft] = useState(nickname);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasScrolledToLatestRef = useRef(false);
  const nearBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);
  const pendingMessageRef = useRef<{ tempId: string; content: string } | null>(null);
  const typingRef = useRef<{ active: boolean; timer: number }>({ active: false, timer: 0 });
  const friendTypingTimer = useRef(0);
  // Each message is reported read once; the screen re-checks what's visible on every update.
  const reportedReadRef = useRef(new Set<string>());
  const { ref: topRef, inView: isTopVisible } = useInView();
  const messagesKey = useMemo(() => ["messages", userId], [userId]);

  useEffect(() => {
    const saved = localStorage.getItem(`beatbond:nickname:${userId}`) || "";
    setNickname(saved);
    setNicknameDraft(saved);
    hasScrolledToLatestRef.current = false;
    setReplyingTo(null);
    setEditing(null);
    setFriendTyping(false);
    setUnseen(0);
    reportedReadRef.current = new Set();
  }, [userId]);

  // ---- Data ----
  const {
    data: messages, isLoading: isLoadingMessages, isError: isMessagesError,
    isFetchingNextPage, hasNextPage, fetchNextPage, refetch: refetchMessages,
  } = useInfiniteQuery<MessagePage>({
    queryKey: messagesKey,
    queryFn: async ({ pageParam = 1 }) => (await axiosInstance.get(`/users/messages/${userId}?page=${pageParam}&limit=30`)).data,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 1,
    staleTime: 60_000,
  });

  const { data: friend, isLoading: isLoadingUser, isError: isUserError, refetch: refetchUser } = useQuery<ChatUser>({
    queryKey: ["user", userId],
    queryFn: async () => {
      try {
        return (await axiosInstance.get(`/users/profile/${userId}`)).data;
      } catch (profileError) {
        // Older shared links can contain a friendship document id. Recover the
        // real Clerk id from the user's own friend list before giving up.
        const { data: friends } = await axiosInstance.get<FriendSummary[]>("/friends");
        const match = friends.find((candidate) => candidate.clerkId === userId || candidate._id === userId);
        if (!match) throw profileError;
        return (await axiosInstance.get(`/users/profile/${match.clerkId}`)).data;
      }
    },
    staleTime: 5 * 60_000,
  });

  const { data: friends = [] } = useQuery<FriendSummary[]>({
    queryKey: ["friends"],
    queryFn: async () => (await axiosInstance.get("/friends")).data,
    staleTime: 30_000,
  });
  const isMuted = Boolean(friends.find((candidate) => candidate.clerkId === userId)?.isMuted);

  const { data: sharedMessages = [], isLoading: isLoadingShared } = useQuery<Message[]>({
    queryKey: ["sharedMessages", userId],
    queryFn: async () => (await axiosInstance.get(`/users/messages/${userId}/shared`)).data,
    enabled: dialog === "shared",
    staleTime: 30_000,
  });

  const setMessages = useCallback((update: (data: Messages) => Messages) => {
    queryClient.setQueryData<InfiniteData<MessagePage>>(messagesKey, (data) => update(data));
  }, [queryClient, messagesKey]);
  const patchMessage = useCallback((messageId: string, patch: (message: Message) => Message) => {
    setMessages((data) => mapMessages(data, (list) => list.map((item) => (item._id === messageId ? patch(item) : item))));
  }, [setMessages]);
  const removeMessage = useCallback((messageId: string) => {
    setMessages((data) => mapMessages(data, (list) => list.filter((item) => item._id !== messageId)));
  }, [setMessages]);

  const emit = useCallback((event: string, data?: unknown) => {
    if (!socket?.connected) return false;
    socket.emit(event, data);
    return true;
  }, [socket]);

  const handleBack = useCallback(() => {
    if (onBack) onBack();
    else navigate(beginBackNavigation(), { replace: true });
  }, [onBack, navigate]);

  // ---- Scrolling ----
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior, block: "end" }));
  }, []);

  const onScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const near = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
    nearBottomRef.current = near;
    setNearBottom(near);
    if (near) setUnseen(0);
  }, []);

  useEffect(() => {
    // Only the first load jumps to the newest message; loading older pages
    // while scrolling up must not pull the reader back down.
    if (!hasScrolledToLatestRef.current && !isLoadingMessages && messages?.pages?.[0]?.messages) {
      hasScrolledToLatestRef.current = true;
      scrollToBottom("auto");
    }
  }, [isLoadingMessages, messages?.pages, scrollToBottom]);

  useEffect(() => {
    if (!isTopVisible || !hasNextPage || isFetchingNextPage) return;
    const container = chatContainerRef.current;
    if (container) restoreScrollRef.current = { height: container.scrollHeight, top: container.scrollTop };
    void fetchNextPage();
  }, [isTopVisible, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Older messages are added above: keep what the reader was looking at in place.
  useLayoutEffect(() => {
    const container = chatContainerRef.current;
    const restore = restoreScrollRef.current;
    if (!container || !restore || isFetchingNextPage) return;
    container.scrollTop = restore.top + (container.scrollHeight - restore.height);
    restoreScrollRef.current = null;
  }, [messages, isFetchingNextPage]);

  // ---- Read receipts: mark the friend's messages read as they come into view ----
  const markMessageAsRead = useCallback((messageId: string) => {
    if (reportedReadRef.current.has(messageId) || !emit("markMessageAsRead", { messageId })) return;
    reportedReadRef.current.add(messageId);
    queryClient.setQueryData<FriendSummary[]>(["friends"], (list = []) =>
      list.map((candidate) => (candidate.clerkId === userId ? { ...candidate, unreadCount: 0 } : candidate)));
  }, [emit, queryClient, userId]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const byId = new Map((messages?.pages ?? []).flatMap((page) => page.messages).map((item) => [item._id, item]));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.getAttribute("data-message-id");
        const found = id ? byId.get(id) : undefined;
        if (found && found.senderId !== myId && found.status !== "read") markMessageAsRead(found._id);
      }
    }, { root: container, threshold: 0.5 });
    container.querySelectorAll("[data-message-id]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [messages, myId, markMessageAsRead]);

  // ---- Typing: tell the friend while you type, stop after a short pause ----
  const stopTyping = useCallback(() => {
    window.clearTimeout(typingRef.current.timer);
    if (typingRef.current.active) emit("typing", { receiverId: userId, isTyping: false });
    typingRef.current.active = false;
  }, [emit, userId]);

  const signalTyping = useCallback(() => {
    if (!typingRef.current.active && emit("typing", { receiverId: userId, isTyping: true })) typingRef.current.active = true;
    window.clearTimeout(typingRef.current.timer);
    typingRef.current.timer = window.setTimeout(stopTyping, 2500);
  }, [emit, stopTyping, userId]);

  useEffect(() => stopTyping, [stopTyping]);

  // ---- Live updates ----
  useEffect(() => {
    if (!socket || !isConnected) return;
    const onReceived = ({ message: incoming }: { message: Message }) => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      if (incoming.senderId !== userId) return;
      setFriendTyping(false);
      setMessages((data) => appendMessage(data, incoming));
      if (nearBottomRef.current) scrollToBottom();
      else setUnseen((count) => count + 1);
    };
    const onSent = ({ message: sent }: { message: Message }) => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      if (sent.receiverId !== userId) return;
      const tempId = pendingMessageRef.current?.tempId;
      setMessages((data) => {
        if (tempId && data?.pages.some((page) => page.messages.some((item) => item._id === tempId))) {
          return mapMessages(data, (list) => list.map((item) => (item._id === tempId ? sent : item)));
        }
        return appendMessage(data, sent);
      });
      pendingMessageRef.current = null;
      setIsSending(false);
      scrollToBottom();
    };
    const onError = (error: { message?: string }) => {
      const pending = pendingMessageRef.current;
      if (pending) {
        removeMessage(pending.tempId);
        setMessage(pending.content);
        pendingMessageRef.current = null;
      }
      setIsSending(false);
      toast.error(error?.message || "Failed to send message");
    };
    const onStatus = ({ messageId, status }: { messageId: string; status: Message["status"] }) =>
      patchMessage(messageId, (item) => ({ ...item, status }));
    const onUpdated = ({ messageId, ...changes }: { messageId: string; content?: string; editedAt?: string; reactions?: Reaction[] }) =>
      patchMessage(messageId, (item) => ({ ...item, ...changes }));
    const onDeleted = ({ messageId }: { messageId: string }) => removeMessage(messageId);
    const onTyping = ({ userId: typingUserId, isTyping }: { userId: string; isTyping: boolean }) => {
      if (typingUserId !== userId) return;
      setFriendTyping(isTyping);
      window.clearTimeout(friendTypingTimer.current);
      // A lost "stopped typing" signal must not leave the indicator stuck.
      if (isTyping) friendTypingTimer.current = window.setTimeout(() => setFriendTyping(false), 6000);
    };

    socket.on("messageReceived", onReceived);
    socket.on("messageSent", onSent);
    socket.on("messageError", onError);
    socket.on("messageStatusUpdate", onStatus);
    socket.on("messageUpdated", onUpdated);
    socket.on("messageDeleted", onDeleted);
    socket.on("typing", onTyping);
    return () => {
      socket.off("messageReceived", onReceived);
      socket.off("messageSent", onSent);
      socket.off("messageError", onError);
      socket.off("messageStatusUpdate", onStatus);
      socket.off("messageUpdated", onUpdated);
      socket.off("messageDeleted", onDeleted);
      socket.off("typing", onTyping);
      window.clearTimeout(friendTypingTimer.current);
    };
  }, [socket, isConnected, userId, queryClient, setMessages, patchMessage, removeMessage, scrollToBottom]);

  useEffect(() => {
    if (friendTyping && nearBottomRef.current) scrollToBottom();
  }, [friendTyping, scrollToBottom]);

  // ---- Composer ----
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }, [message]);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setMessage("");
  }, []);

  const sendText = async () => {
    const content = message.trim();
    if (!content || !user || isSending) return;

    if (editing) {
      if (content === editing.content) return cancelEdit();
      setIsSending(true);
      try {
        const { data } = await axiosInstance.patch(`/users/messages/${editing._id}`, { content });
        patchMessage(editing._id, (item) => ({ ...item, content: data.content, editedAt: data.editedAt }));
        cancelEdit();
      } catch (error: unknown) {
        toast.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Couldn't edit the message");
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!socket?.connected) return void toast.error("You're offline. Try again in a moment.");
    stopTyping();
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic: Message = {
      _id: tempId,
      senderId: user.id,
      receiverId: userId,
      content,
      createdAt: new Date().toISOString(),
      status: "sent",
      ...(replyingTo && { replyTo: { _id: replyingTo._id, content: replyingTo.content, senderId: replyingTo.senderId } }),
    };
    setIsSending(true);
    setMessage("");
    pendingMessageRef.current = { tempId, content };
    setMessages((data) => appendMessage(data, optimistic));
    scrollToBottom();
    emit("sendMessage", { receiverId: userId, content, ...(replyingTo && { replyTo: replyingTo._id }) });
    setReplyingTo(null);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      if (editing) cancelEdit();
      setReplyingTo(null);
      return;
    }
    // Enter sends on a keyboard; on phones it adds a new line and the button sends.
    if (event.key === "Enter" && !event.shiftKey && !isTouchDevice()) {
      event.preventDefault();
      void sendText();
    }
  };

  const shareCurrentSong = () => {
    if (!currentSong) return;
    const sent = emit("sendMessage", {
      receiverId: userId,
      content: "Shared a song",
      sharedContent: {
        type: "song",
        title: currentSong.title,
        subtitle: currentSong.artist,
        imageUrl: currentSong.imageUrl,
        href: `/search?q=${encodeURIComponent(currentSong.title)}`,
        song: currentSong,
      },
    });
    if (!sent) toast.error("You're offline. Try again in a moment.");
  };

  // ---- Message actions ----
  const openActions = useCallback((target: Message, x: number, y: number) => setActions({ message: target, x, y }), []);
  const closeActions = useCallback(() => setActions(null), []);

  const react = useCallback(async (target: Message, emoji: string) => {
    if (!myId || target._id.startsWith("temp-")) return;
    patchMessage(target._id, (item) => ({ ...item, reactions: toggleReaction(item.reactions, myId, emoji) }));
    try {
      const { data } = await axiosInstance.post(`/users/messages/${target._id}/reactions`, { emoji });
      patchMessage(target._id, (item) => ({ ...item, reactions: data.reactions }));
    } catch {
      toast.error("Couldn't add the reaction");
      void refetchMessages();
    }
  }, [myId, patchMessage, refetchMessages]);

  const copyText = useCallback(async (target: Message) => {
    try {
      await navigator.clipboard.writeText(target.content);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }, []);

  const startEdit = useCallback((target: Message) => {
    setReplyingTo(null);
    setEditing(target);
    setMessage(target.content);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const startReply = useCallback((target: Message) => {
    setEditing(null);
    setReplyingTo(target);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const deleteMessage = useCallback(async (target: Message, scope: "me" | "everyone") => {
    try {
      await axiosInstance.delete(`/users/messages/${target._id}?scope=${scope}`);
      removeMessage(target._id);
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      toast.success(scope === "everyone" ? "Deleted for everyone" : "Deleted for you");
    } catch {
      toast.error("Couldn't delete the message");
    }
  }, [removeMessage, queryClient]);

  // ---- Chat menu ----
  const { mutate: removeFriend, isPending: isRemovingFriend } = useMutation({
    mutationFn: async () => { await axiosInstance.delete(`/friends/${friend?._id ?? userId}`); },
    onSuccess: () => {
      toast.success(`${friend?.fullName ?? "Friend"} removed`);
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      handleBack();
    },
    onError: () => toast.error("Failed to remove friend"),
    onSettled: () => setDialog(null),
  });

  const { mutate: clearChat, isPending: isClearingChat } = useMutation({
    mutationFn: async () => { await axiosInstance.delete(`/users/messages/${userId}/clear`); },
    onSuccess: () => {
      setMessages(() => ({ pages: [{ messages: [], totalPages: 0 }], pageParams: [1] }));
      void queryClient.invalidateQueries({ queryKey: ["sharedMessages", userId] });
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      toast.success("Chat cleared for you");
    },
    onError: () => toast.error("Failed to clear chat"),
    onSettled: () => setDialog(null),
  });

  const { mutate: blockFriend, isPending: isBlocking } = useMutation({
    mutationFn: async () => { await axiosInstance.post(`/users/block/${userId}`); },
    onSuccess: () => {
      toast.success(`${friend?.fullName ?? "They"} can no longer message you`);
      for (const queryKey of [["friends"], ["userProfile", userId], ["blockedUsers"]]) void queryClient.invalidateQueries({ queryKey });
      handleBack();
    },
    onError: () => toast.error("Couldn't block. Please try again."),
    onSettled: () => setDialog(null),
  });

  const toggleMute = async () => {
    const muted = !isMuted;
    queryClient.setQueryData<FriendSummary[]>(["friends"], (list = []) => list.map((candidate) => (candidate.clerkId === userId ? { ...candidate, isMuted: muted } : candidate)));
    try {
      await (muted ? axiosInstance.put(`/users/chats/${userId}/mute`) : axiosInstance.delete(`/users/chats/${userId}/mute`));
      toast.success(muted ? "Notifications muted for this chat" : "Notifications turned on");
    } catch {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      toast.error("Couldn't change notifications");
    }
  };

  const saveNickname = () => {
    const value = nicknameDraft.trim().slice(0, 40);
    if (value) localStorage.setItem(`beatbond:nickname:${userId}`, value);
    else localStorage.removeItem(`beatbond:nickname:${userId}`);
    window.dispatchEvent(new CustomEvent("beatbond:nickname-updated", { detail: { userId, nickname: value } }));
    setNickname(value);
    setDialog(null);
  };

  // ---- Render ----
  const allMessages = useMemo(() => [...(messages?.pages ?? [])].reverse().flatMap((page) => page.messages), [messages]);
  const items = useMemo(() => buildChatItems(allMessages), [allMessages]);

  if (isLoadingUser) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>;
  }

  if (isUserError || !friend) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="space-y-3">
          <h2 className="font-semibold">Unable to open chat</h2>
          <p className="text-sm text-muted-foreground">This user may no longer be available.</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchUser()}>Retry</Button>
            <Button variant="ghost" size="sm" onClick={handleBack}>Back</Button>
          </div>
        </div>
      </div>
    );
  }

  const friendName = nickname || friend.fullName;
  const isSocketConnected = Boolean(socket?.connected);
  // The server only reports people whose online status both of you share.
  const isFriendOnline = onlineUsers.has(userId);
  const status = !isSocketConnected ? "Connecting…" : friendTyping ? "typing…" : isFriendOnline ? "Online" : formatLastSeen(friend.lastSeen);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-20 flex min-h-16 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-md sm:px-4">
        <Button variant="ghost" size="icon" className="size-10 shrink-0" onClick={handleBack} aria-label="Back to chats"><ArrowLeft className="size-5" /></Button>
        <button type="button" onClick={() => navigate(`/profile/${userId}`)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-secondary/60">
          <span className="relative shrink-0">
            <Avatar className="size-10"><AvatarImage src={friend.imageUrl} alt="" /><AvatarFallback className="bg-primary/10 text-primary">{friend.fullName[0]}</AvatarFallback></Avatar>
            {isFriendOnline && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-emerald-500" />}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold leading-tight">{friendName}</span>
              {isMuted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
            </span>
            {status && <span className={cn("block truncate text-xs", friendTyping ? "font-medium text-primary" : "text-muted-foreground")}>{status}</span>}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-10 shrink-0" aria-label="Chat options"><MoreVertical className="size-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => navigate(`/profile/${userId}`)}><UserRound className="size-4" />View profile</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("shared")}><ListMusic className="size-4" />Shared songs</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setNicknameDraft(nickname); setDialog("nickname"); }}><Pencil className="size-4" />Set nickname</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void toggleMute()}>{isMuted ? <Bell className="size-4" /> : <BellOff className="size-4" />}{isMuted ? "Unmute notifications" : "Mute notifications"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("clear")}><Trash2 className="size-4" />Clear chat</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDialog("block")} className="text-destructive focus:text-destructive"><Ban className="size-4" />Block</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("remove")} className="text-destructive focus:text-destructive"><UserMinus className="size-4" />Remove friend</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MessageActions state={actions} myId={myId} onClose={closeActions} onReact={react} onReply={startReply} onCopy={copyText} onEdit={startEdit} onDelete={deleteMessage} />

      {/* Messages */}
      <div ref={chatContainerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end px-3 pb-3 pt-2 sm:px-5">
          {hasNextPage && <div ref={topRef} className="h-1" />}
          {isFetchingNextPage && <div className="flex justify-center py-2"><Loader2 className="size-4 animate-spin text-primary" /></div>}

          {isLoadingMessages && <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-primary" /></div>}

          {!isLoadingMessages && isMessagesError && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <h3 className="font-semibold">Messages couldn't load</h3>
              <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
              <Button variant="outline" size="sm" onClick={() => refetchMessages()}>Retry</Button>
            </div>
          )}

          {!isLoadingMessages && !isMessagesError && allMessages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <Avatar className="size-16"><AvatarImage src={friend.imageUrl} alt="" /><AvatarFallback className="text-xl">{friend.fullName[0]}</AvatarFallback></Avatar>
              <div>
                <h3 className="font-semibold">Say hi to {friendName}</h3>
                <p className="text-sm text-muted-foreground">Send a message or share the song you're playing.</p>
              </div>
            </div>
          )}

          {items.map((item) => (item.type === "day"
            ? <DaySeparator key={item.key} label={item.label} />
            : (
              <MessageBubble
                key={item.key}
                msg={item.message}
                isMine={item.message.senderId === myId}
                startsGroup={item.startsGroup}
                endsGroup={item.endsGroup}
                friend={friend}
                friendName={friendName}
                myId={myId}
                onOpenActions={openActions}
                onReact={react}
              />
            )))}

          {friendTyping && <div className="mt-3"><TypingBubble imageUrl={friend.imageUrl} name={friendName} /></div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom()}
          aria-label={unseen ? `${unseen} new messages` : "Jump to latest"}
          className="absolute bottom-24 right-4 z-20 grid size-10 place-items-center rounded-full border bg-background shadow-lg transition hover:bg-secondary sm:right-6"
        >
          <ChevronDown className="size-5" />
          {unseen > 0 && <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-5 text-primary-foreground">{unseen}</span>}
        </button>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 backdrop-blur-md sm:px-4">
        <div className="mx-auto max-w-3xl">
          {(replyingTo || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-primary bg-secondary/60 px-3 py-2">
              {editing ? <Pencil className="size-4 shrink-0 text-primary" /> : <Reply className="size-4 shrink-0 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-primary">{editing ? "Editing message" : `Replying to ${replyingTo!.senderId === myId ? "yourself" : friendName}`}</p>
                <p className="truncate text-xs text-muted-foreground">{(editing ?? replyingTo)!.content}</p>
              </div>
              <button type="button" onClick={() => (editing ? cancelEdit() : setReplyingTo(null))} aria-label="Cancel" className="rounded-full p-1 hover:bg-secondary"><X className="size-4" /></button>
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); void sendText(); }} className="flex items-end gap-1.5 rounded-3xl border bg-card p-1.5 shadow-sm">
            {currentSong && !editing && (
              <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full text-primary" onClick={shareCurrentSong} disabled={!isSocketConnected} title={`Share "${currentSong.title}"`} aria-label="Share the song you're playing">
                <Music2 className="size-5" />
              </Button>
            )}
            <Textarea
              ref={inputRef}
              rows={1}
              value={message}
              onChange={(event) => { setMessage(event.target.value); if (!editing) signalTyping(); }}
              onKeyDown={onComposerKeyDown}
              onBlur={stopTyping}
              placeholder={editing ? "Edit your message" : isSocketConnected ? "Message" : "Connecting…"}
              maxLength={4000}
              className="max-h-[132px] min-h-10 flex-1 resize-none border-0 bg-transparent px-3 py-2.5 shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={!message.trim() || isSending || (!editing && !isSocketConnected)} aria-label={editing ? "Save edit" : "Send"}>
              {isSending ? <Loader2 className="size-5 animate-spin" /> : editing ? <Check className="size-5" /> : <Send className="size-5" />}
            </Button>
          </form>
        </div>
      </div>

      {/* Dialogs */}
      <AlertDialog open={dialog === "remove"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {friend.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>They'll be removed from your friends and you won't be able to message each other. They won't be notified.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingFriend}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isRemovingFriend} onClick={() => removeFriend()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isRemovingFriend ? <Loader2 className="size-4 animate-spin" /> : "Remove"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "clear"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this chat?</AlertDialogTitle>
            <AlertDialogDescription>Messages are removed from your chat only. {friend.fullName} will still have them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearingChat}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isClearingChat} onClick={() => clearChat()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isClearingChat ? <Loader2 className="size-4 animate-spin" /> : "Clear chat"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "block"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {friend.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>You'll stop being friends. They won't be able to message you, send you friend requests, find you in search or see you on the map. You can unblock them in Settings.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBlocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isBlocking} onClick={() => blockFriend()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{isBlocking ? <Loader2 className="size-4 animate-spin" /> : "Block"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialog === "nickname"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set a nickname</DialogTitle><DialogDescription>Only you will see this name for {friend.fullName}.</DialogDescription></DialogHeader>
          <Input value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} maxLength={40} placeholder={friend.fullName} autoFocus onKeyDown={(event) => event.key === "Enter" && saveNickname()} />
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={saveNickname}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "shared"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Shared songs</DialogTitle><DialogDescription>Songs you and {friendName} shared in this chat.</DialogDescription></DialogHeader>
          {isLoadingShared ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin" /></div>
          ) : sharedMessages.length ? (
            <div className="space-y-2">
              {sharedMessages.map((shared) => (
                <button
                  key={shared._id}
                  type="button"
                  onClick={() => {
                    const song = shared.sharedContent?.song;
                    if (song) playAlbum([song]);
                    else if (shared.sharedContent?.href) navigate(shared.sharedContent.href);
                    setDialog(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border p-2 text-left hover:bg-secondary"
                >
                  <Avatar className="size-10 rounded-lg"><AvatarImage src={shared.sharedContent?.imageUrl} /><AvatarFallback className="rounded-lg">{shared.sharedContent?.title?.[0] || "M"}</AvatarFallback></Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{shared.sharedContent?.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{shared.sharedContent?.subtitle || "Song"} · shared by {shared.senderId === myId ? "you" : friendName}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No shared songs yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
