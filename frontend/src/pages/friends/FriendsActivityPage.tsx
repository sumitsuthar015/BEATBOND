import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Link } from "react-router-dom";
import { axiosInstance } from "@/lib/axios";
import { useChatStore } from "@/stores/useChatStore";
import { Music, Users, Loader2, AlertCircle, UserMinus, Check, X, UserPlus, MapPin, MessageCircle, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "react-hot-toast";

interface Friend {
  _id: string;
  clerkId: string;
  fullName: string;
  imageUrl: string;
  musicPrivacy?: "everyone" | "friends" | "none";
}

interface PendingRequest {
  _id: string;
  senderId: string;
  status: string;
  sender: {
    clerkId: string;
    fullName: string;
    imageUrl: string;
  } | null;
}

const FriendsActivityPage = () => {
  const queryClient = useQueryClient();
  const { onlineUsers, userActivities, isConnected } = useChatStore();
  const [friendToRemove, setFriendToRemove] = useState<Friend | null>(null);
  const [, setNicknameVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setNicknameVersion((version) => version + 1);
    window.addEventListener("beatbond:nickname-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("beatbond:nickname-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const { data: friends = [], isLoading, isError, error } = useQuery<Friend[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const { data } = await axiosInstance.get("/friends");
      return data;
    },
    staleTime: 30000,
    retry: 2,
  });

  const { data: pendingRequests = [], isLoading: pendingLoading } = useQuery<PendingRequest[]>({
    queryKey: ["pendingFriendRequests"],
    queryFn: async () => {
      const { data } = await axiosInstance.get("/friends/pending");
      return data;
    },
    staleTime: 15000,
  });

  const { mutate: removeFriend, isPending: isRemoving } = useMutation({
    mutationFn: async (friendClerkId: string) => {
      await axiosInstance.delete(`/friends/${friendClerkId}`);
    },
    onSuccess: () => {
      toast.success("Friend removed");
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => {
      toast.error("Failed to remove friend");
    },
  });

  const { mutate: respondToRequest, isPending: isResponding } = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      await axiosInstance.put(`/friends/request/${requestId}`, { status });
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "accepted" ? "Friend request accepted!" : "Friend request declined"
      );
      queryClient.invalidateQueries({ queryKey: ["pendingFriendRequests"] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => {
      toast.error("Failed to respond to request");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Loading friends...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load friends: {error instanceof Error ? error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const onlineFriendsCount = friends.filter((friend) => onlineUsers.has(friend.clerkId)).length;

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pb-8">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <header className="mb-6 pt-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Friends</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            {onlineFriendsCount} of {friends.length} friends online
          </p>
        </header>

        {/* Action Tools Grid */}
        <section className="mb-6 grid grid-cols-3 gap-2.5" aria-label="Friend tools">
          {[
            { icon: Search, label: "Find people", to: "/users", color: "from-sky-500/20 to-blue-600/10 text-sky-400" },
            { icon: MessageCircle, label: "Messages", to: "/chat", color: "from-emerald-500/20 to-teal-600/10 text-emerald-400" },
            { icon: MapPin, label: "Friends map", to: "/map", color: "from-purple-500/20 to-indigo-600/10 text-purple-400" },
          ].map(({ icon: Icon, label, to, color }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/80 bg-card/80 p-3 text-center transition-all hover:bg-secondary/60 active:scale-95 shadow-sm"
            >
              <div className={`grid size-9 place-items-center rounded-xl bg-gradient-to-br ${color}`}>
                <Icon className="size-5" />
              </div>
              <span className="text-xs font-semibold">{label}</span>
            </Link>
          ))}
        </section>

        {!isConnected && friends.length > 0 && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Connecting to live activity updates...</AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 h-11 rounded-2xl bg-secondary/60 p-1">
            <TabsTrigger value="activity" className="rounded-xl font-semibold text-xs sm:text-sm">
              Activity ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-xl font-semibold text-xs sm:text-sm">
              Requests ({pendingRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-2.5">
            {friends.map((friend) => {
              const isOnline = onlineUsers.has(friend.clerkId);
              const activity = userActivities.get(friend.clerkId) ?? "";
              const hasActivity = activity.length > 0 && activity.trim().toLowerCase() !== "idle";
              const nickname = localStorage.getItem(`beatbond:nickname:${friend.clerkId}`) || friend.fullName;
 
              return (
                <div
                  key={friend.clerkId}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-card/90 border border-border/80 hover:bg-secondary/40 transition-all shadow-sm"
                >
                  <Link
                    to={`/chat?userId=${friend.clerkId}`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                    aria-label={`Open chat with ${nickname}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="size-11 border border-border">
                        <AvatarImage src={friend.imageUrl} alt={nickname} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {nickname.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-card ${
                          isOnline ? "bg-emerald-500" : "bg-muted-foreground/60"
                        }`}
                      />
                    </div>
 
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{nickname}</p>
                      {isOnline && hasActivity ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium mt-0.5">
                          <Music className="size-3 shrink-0 animate-pulse" />
                          <span className="truncate">{activity}</span>
                        </div>
                      ) : (
                        <p className={`text-xs mt-0.5 ${isOnline ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                          {isOnline ? "Online" : "Offline"}
                        </p>
                      )}
                    </div>
                  </Link>

                  <div className="flex items-center gap-1 shrink-0">
                    <Link to={`/chat?userId=${friend.clerkId}`}>
                      <Button variant="ghost" size="icon" className="size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary" title="Send message">
                        <MessageCircle className="size-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Remove friend"
                      onClick={() => setFriendToRemove(friend)}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            {friends.length === 0 && (
              <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/40 p-6">
                <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-semibold mb-1">No friends yet</p>
                <p className="text-xs text-muted-foreground mb-4">Connect with friends to see what they are listening to.</p>
                <Button asChild variant="default" size="sm" className="rounded-full px-5">
                  <Link to="/users">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Find people
                  </Link>
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="space-y-2.5">
            {pendingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pendingRequests.length > 0 ? (
              pendingRequests.map((request) => (
                <div
                  key={request._id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-card/90 border border-border/80"
                >
                  <Link to={`/profile/${request.sender?.clerkId}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar className="size-11 border border-border">
                      <AvatarImage src={request.sender?.imageUrl} alt={request.sender?.fullName} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {request.sender?.fullName?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{request.sender?.fullName || "Unknown user"}</p>
                      <p className="text-xs text-muted-foreground">Wants to connect</p>
                    </div>
                  </Link>

                  <div className="flex gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      className="size-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => respondToRequest({ requestId: request._id, status: "accepted" })}
                      disabled={isResponding}
                      title="Accept"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-9 rounded-full hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => respondToRequest({ requestId: request._id, status: "rejected" })}
                      disabled={isResponding}
                      title="Decline"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/40 p-6">
                <p className="text-sm text-muted-foreground">No pending friend requests</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!friendToRemove} onOpenChange={(open) => !open && setFriendToRemove(null)}>
        <AlertDialogContent className="rounded-2xl sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {friendToRemove?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes them from your friends list. You can send a new request later if you change your mind.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving} className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              onClick={() => {
                if (friendToRemove) removeFriend(friendToRemove.clerkId);
                setFriendToRemove(null);
              }}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default FriendsActivityPage;
