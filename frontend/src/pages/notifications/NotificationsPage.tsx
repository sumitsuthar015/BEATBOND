import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axiosInstance } from "@/lib/axios";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Bell, Check, MessageSquare, UserPlus, Trash2, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { toast } from "react-hot-toast";
import { useUser } from "@clerk/clerk-react";
import { useEffect } from "react";

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
  };
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
    }
  };

  if (!isLoaded || !user) {
    return null;
  }

  const notificationsList = notifications || [];
  const unreadCount = notificationsList.filter(n => !n.read).length;

  return (
    <div className="container max-w-4xl mx-auto py-4 sm:py-8 px-3 sm:px-4">
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
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
          {isLoading ? (
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
          ) : notificationsList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-2">
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
                      {notification.type === 'message' ? (
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
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default NotificationsPage;