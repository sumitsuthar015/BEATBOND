import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bell, Check, MessageSquare, UserPlus, Trash2, CheckCheck, X, Music2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { useUser } from "@clerk/clerk-react";
import { useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Notification {
  _id: string;
  message: string;
  type: 'message' | 'friend_request' | 'friend_request_response' | 'system';
  read: boolean;
  createdAt: string;
  metadata?: {
    requestId?: string;
    messageId?: string;
    senderId?: string;
    action?: string;
    songId?: string;
    songTitle?: string;
    songArtist?: string;
  };
}

interface PendingFriendRequest {
  _id: string;
  sender?: {
    clerkId: string;
    fullName?: string;
    username?: string;
    imageUrl?: string;
  } | null;
  createdAt: string;
}

const NotificationsPage = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isLoaded } = useUser();

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !user) {
      navigate("/");
    }
  }, [isLoaded, user, navigate]);

  const { data: notifications, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await axiosInstance.get<Notification[]>("/notifications");
      return data;
    },
    enabled: isLoaded && !!user,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
    retry: 1,
  });

  const { data: pendingRequests = [], isLoading: requestsLoading } = useQuery<PendingFriendRequest[]>({
    queryKey: ["pendingFriendRequests"],
    queryFn: async () => (await axiosInstance.get("/friends/pending")).data,
    enabled: isLoaded && !!user,
    staleTime: 15_000,
  });

  const { mutate: respondToFriendRequest, isPending: isResponding } = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: "accepted" | "rejected" }) => {
      await axiosInstance.put(`/friends/request/${requestId}`, { status });
      return status;
    },
    onSuccess: (status) => {
      toast.success(status === "accepted" ? "Friend request accepted" : "Friend request declined");
      void queryClient.invalidateQueries({ queryKey: ["pendingFriendRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Couldn't update the friend request");
    },
  });

  const { mutate: markAsRead } = useMutation({
    mutationFn: async (notificationId: string) => {
      await axiosInstance.put(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to mark as read");
    }
  });

  const { mutate: markAllAsRead } = useMutation({
    mutationFn: async () => {
      await axiosInstance.put("/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to mark all as read");
    }
  });

  const { mutate: deleteNotification } = useMutation({
    mutationFn: async (notificationId: string) => {
      await axiosInstance.delete(`/notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification deleted");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to delete notification");
    }
  });

  const { mutate: clearAll } = useMutation({
    mutationFn: async () => {
      await axiosInstance.delete("/notifications/all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications cleared");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to clear notifications");
    }
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification._id);
    }

    if (notification.type === 'message' && notification.metadata?.senderId) {
      navigate(`/chat?userId=${notification.metadata.senderId}`);
    } else if (notification.type === 'friend_request' || notification.type === 'friend_request_response') {
      navigate('/friends');
    } else if (notification.type === "system" && notification.metadata?.songTitle) {
      navigate(`/search?q=${encodeURIComponent(notification.metadata.songTitle)}`);
    }
  };

  if (!isLoaded || !user) {
    return null;
  }

  // Requests get their own actionable cards below; hide the old generic row to
  // avoid showing each incoming request twice.
  const notificationsList = (notifications || []).filter(
    (notification) => notification.type !== "friend_request" && notification.type !== "message"
  );
  const unreadCount = notificationsList.filter(n => !n.read).length;

  return (
    <div className="container max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
            Notifications
          </h1>
          {(unreadCount > 0 || pendingRequests.length > 0) && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {pendingRequests.length > 0 && `${pendingRequests.length} friend request${pendingRequests.length === 1 ? "" : "s"}`}
              {pendingRequests.length > 0 && unreadCount > 0 && " · "}
              {unreadCount > 0 && `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => markAllAsRead()}
              className="text-xs sm:text-sm"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
          )}
          {notificationsList.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all notifications?")) {
                  clearAll();
                }
              }}
              className="text-xs sm:text-sm"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-10rem)] sm:h-[calc(100vh-12rem)] rounded-lg border bg-card">
        <div className="p-3 sm:p-4">
          {isLoading || requestsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              <p className="text-sm">Failed to load notifications</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => queryClient.invalidateQueries({ queryKey: ["notifications"] })}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          ) : notificationsList.length === 0 && pendingRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(requestsLoading || pendingRequests.length > 0) && (
                <section aria-labelledby="friend-requests-heading" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 id="friend-requests-heading" className="font-semibold text-sm sm:text-base flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-primary" /> Friend requests
                    </h2>
                    {pendingRequests.length > 0 && (
                      <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{pendingRequests.length} pending</span>
                    )}
                  </div>
                  {requestsLoading ? (
                    <div className="flex justify-center py-5">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                    </div>
                  ) : pendingRequests.map((request) => {
                    const sender = request.sender;
                    const name = sender?.fullName || sender?.username || "BeatBond user";
                    return (
                      <article key={request._id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-secondary/20 p-3 sm:p-4">
                        <Link to={sender?.clerkId ? `/profile/${sender.clerkId}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
                          <Avatar className="h-11 w-11 shrink-0 border border-border">
                            <AvatarImage src={sender?.imageUrl} alt={name} />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">{name.charAt(0).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            {sender?.username && <p className="truncate text-xs text-muted-foreground">@{sender.username}</p>}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Sent {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </Link>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => respondToFriendRequest({ requestId: request._id, status: "accepted" })}
                            disabled={isResponding}
                            aria-label={`Approve ${name}`}
                            className="h-9 rounded-full px-3"
                          >
                            <Check className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Approve</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => respondToFriendRequest({ requestId: request._id, status: "rejected" })}
                            disabled={isResponding}
                            aria-label={`Reject ${name}`}
                            className="h-9 rounded-full px-3 hover:border-destructive hover:text-destructive"
                          >
                            <X className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Reject</span>
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}

              {notificationsList.length > 0 && (
                <section aria-labelledby="activity-notifications-heading" className="space-y-2">
                  {pendingRequests.length > 0 && <h2 id="activity-notifications-heading" className="font-semibold text-sm sm:text-base">Recent activity</h2>}
                  {notificationsList.map((notification: Notification) => (
                <div
                  key={notification._id}
                  className={`
                    flex items-start sm:items-center justify-between p-3 sm:p-4 rounded-lg
                    ${notification.read ? 'bg-secondary/10' : 'bg-secondary/40'}
                    border border-border/10 transition-all duration-200
                    hover:bg-secondary/30 cursor-pointer
                  `}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {notification.type === 'system' && notification.metadata?.songTitle ? (
                        <Music2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      ) : notification.type === 'message' ? (
                        <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      ) : notification.type === 'friend_request' || notification.type === 'friend_request_response' ? (
                        <UserPlus className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      ) : (
                        <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm break-words">{notification.message}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0 sm:hidden" />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1 sm:gap-2 ml-2 flex-shrink-0">
                    {!notification.read && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(notification._id);
                        }}
                        className="h-7 w-7 sm:h-8 sm:w-8"
                      >
                        <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification._id);
                      }}
                      className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </div>
                </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default NotificationsPage;
