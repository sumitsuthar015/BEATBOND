import { useEffect, useState, useCallback, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";
import { toast } from "react-hot-toast";
import { UserList } from "./components/UserList";
import { DirectMessageChat } from "../../components/chat/DirectMessageChat";
import { AlertCircle, ArrowLeft, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginBackNavigation } from "@/lib/routeHistory";
import { useChatStore } from "@/stores/useChatStore";
import { useUser } from "@clerk/clerk-react";

interface FriendUser {
  _id?: string;
  clerkId: string;
  fullName: string;
  imageUrl: string;
  isOnline?: boolean;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
}

interface RealtimeMessage {
  senderId: string;
  receiverId: string;
  content: string;
  createdAt?: string;
  sharedContent?: { title?: string };
}

const ChatPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const selectedUserId = searchParams.get("userId") || undefined;
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const socket = useChatStore((state) => state.socket);
  const isSocketConnected = useChatStore((state) => state.isConnected);

  const promoteConversation = useCallback((message: RealtimeMessage) => {
    const otherUserId = message.senderId === user?.id ? message.receiverId : message.senderId;
    const lastMessage = message.content || message.sharedContent?.title || "Shared an item";
    const lastMessageTime = message.createdAt || new Date().toISOString();

    queryClient.setQueryData<FriendUser[]>(["friends"], (friends = []) => {
      const matchingFriend = friends.find((friend) => friend.clerkId === otherUserId);
      if (!matchingFriend) return friends;

      return [
        { ...matchingFriend, lastMessage, lastMessageTime },
        ...friends.filter((friend) => friend.clerkId !== otherUserId),
      ];
    });
    void queryClient.invalidateQueries({ queryKey: ["friends"] });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!isSocketConnected) return;
    const handleRealtimeMessage = ({ message }: { message: RealtimeMessage }) => promoteConversation(message);
    const refreshConversations = () => void queryClient.invalidateQueries({ queryKey: ["friends"] });
    socket.on("messageReceived", handleRealtimeMessage);
    socket.on("messageSent", handleRealtimeMessage);
    socket.on("messageStatusUpdate", refreshConversations);
    socket.on("conversationRead", refreshConversations);
    return () => {
      socket.off("messageReceived", handleRealtimeMessage);
      socket.off("messageSent", handleRealtimeMessage);
      socket.off("messageStatusUpdate", refreshConversations);
      socket.off("conversationRead", refreshConversations);
    };
  }, [socket, isSocketConnected, promoteConversation, queryClient]);

  const handleResize = useCallback(() => {
    setIsMobile(window.innerWidth <= 768);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  const {
    data: users = [],
    isLoading: isLoadingFriends,
    isError: isFriendsError,
    refetch: refetchFriends,
  } = useQuery<FriendUser[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const { data } = await axiosInstance.get("/friends");
      return data;
    },
  });

  // Remove / delete a user from the friends & chat list
  const { mutate: removeUser, isPending: isDeleting } = useMutation({
    mutationFn: async (friend: FriendUser) => {
      await axiosInstance.delete(`/friends/${friend.clerkId}`);
    },
    onSuccess: (_, friend) => {
      toast.success(`${friend.fullName} removed`);
      queryClient.setQueryData<FriendUser[]>(["friends"], (old = []) =>
        old.filter((u) => u.clerkId !== friend.clerkId)
      );
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      // If the deleted user's chat was open, go back to the list
      if (selectedUserId === friend.clerkId) {
        navigate("/chat");
      }
    },
    onError: () => {
      toast.error("Failed to remove user");
    },
  });

  const listPane = (
    <UserList
      users={users}
      selectedUserId={selectedUserId}
      onUserDelete={removeUser}
      isDeleting={isDeleting}
      isLoading={isLoadingFriends}
      isError={isFriendsError}
      onRetry={refetchFriends}
      className="flex-1"
    />
  );

  const goBack = () => {
    navigate(beginBackNavigation(), { replace: true });
  };

  const emptyState = (
    <div className="flex-1 flex items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          {isFriendsError ? (
            <AlertCircle className="h-7 w-7 text-destructive" />
          ) : (
            <MessageCircle className="h-7 w-7 text-primary" />
          )}
        </div>
        <div>
          <h2 className="font-semibold text-lg">
            {isFriendsError ? "Messages couldn't load" : "Select a conversation"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isFriendsError
              ? "Check your connection and try again."
              : "Choose a friend from the list to start chatting."}
          </p>
        </div>
        {isFriendsError && (
          <Button variant="outline" size="sm" onClick={() => refetchFriends()}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        {selectedUserId ? (
          <div className="flex min-h-0 flex-1 flex-col"><DirectMessageChat userId={selectedUserId} /></div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="relative flex h-14 items-center justify-center border-b bg-card/30 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={goBack}
                // Phones show chat fullscreen without the bottom navigation, so
                // this is their way out; desktop keeps the sidebar instead.
                className="absolute left-3 size-10 rounded-full md:hidden"
                aria-label="Go back"
              >
                <ArrowLeft className="size-5" />
              </Button>
              <h1 className="text-lg sm:text-xl font-semibold">Messages</h1>
            </div>
            <UserList
              users={users}
              selectedUserId={selectedUserId}
              onUserDelete={removeUser}
              isDeleting={isDeleting}
              isLoading={isLoadingFriends}
              isError={isFriendsError}
              onRetry={refetchFriends}
              className="flex-1"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="w-80 border-r border-border flex-shrink-0 bg-background flex flex-col">
        <div className="h-14 px-4 border-b border-border flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h1 className="font-semibold">Messages</h1>
          {isLoadingFriends && <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {listPane}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {selectedUserId ? (
          <DirectMessageChat userId={selectedUserId} />
        ) : (
          emptyState
        )}
      </div>
    </div>
  );
};

export default memo(ChatPage);
