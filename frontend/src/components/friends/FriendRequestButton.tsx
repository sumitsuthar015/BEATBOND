import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { UserPlus, Check, X, Loader2, Clock, MessageCircle, UserMinus } from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { toast } from "react-hot-toast";
import { Link } from "react-router-dom";

import { useUser } from "@clerk/clerk-react";

interface FriendshipStatus {
  status: "none" | "pending" | "accepted" | "rejected";
  requestId?: string;
  senderId?: string;
  receiverId?: string;
}

interface FriendRequestButtonProps {
  userId: string;
  showFriendActions?: boolean;
  allowRemove?: boolean;
}

const FriendRequestButton = ({ userId, showFriendActions = false, allowRemove = false }: FriendRequestButtonProps) => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const { data: friendshipStatus, isLoading } = useQuery<FriendshipStatus>({
    queryKey: ["friendshipStatus", userId],
    queryFn: async () => {
      try {
        const { data } = await axiosInstance.get(`/friends/status/${userId}`);
        return data;
      } catch {
        return { status: "none" };
      }
    },
    enabled: !!userId,
    retry: false,
  });

  const { mutate: sendRequest, isPending: isSending } = useMutation({
    mutationFn: async () => {
      await axiosInstance.post("/friends/request", { receiverId: userId });
    },
    onSuccess: () => {
      toast.success("Friend request sent!");
      queryClient.invalidateQueries({ queryKey: ["friendshipStatus", userId] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || error.response?.data?.message || "Failed to send request");
    },
  });

  const { mutate: respondToRequest, isPending: isResponding } = useMutation({
    mutationFn: async ({ requestId, status }: { requestId: string; status: string }) => {
      await axiosInstance.put(`/friends/request/${requestId}`, { status });
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "accepted"
          ? "Friend request accepted!"
          : "Friend request declined"
      );
      queryClient.invalidateQueries({ queryKey: ["friendshipStatus", userId] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: () => {
      toast.error("Failed to respond to request");
    },
  });

  const { mutate: removeFriend, isPending: isRemoving } = useMutation({
    mutationFn: async () => {
      await axiosInstance.delete(`/friends/${userId}`);
    },
    onSuccess: () => {
      toast.success("Friend removed");
      queryClient.invalidateQueries({ queryKey: ["friendshipStatus", userId] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to remove friend");
    },
  });

  const { mutate: cancelRequest, isPending: isCancelling } = useMutation({
    mutationFn: async (requestId: string) => {
      await axiosInstance.delete(`/friends/request/${requestId}`);
    },
    onSuccess: () => {
      toast.success("Friend request cancelled");
      queryClient.invalidateQueries({ queryKey: ["friendshipStatus", userId] });
      queryClient.invalidateQueries({ queryKey: ["friends"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to cancel friend request");
    },
  });

  if (userId === user?.id) {
    return (
      <span className="text-xs font-semibold text-muted-foreground px-3 py-1 rounded-full bg-secondary">
        You
      </span>
    );
  }

  if (isLoading) {
    return (
      <Button variant="outline" disabled size="sm">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (friendshipStatus?.status === "accepted") {
    if (showFriendActions) {
      return (
        <div className="flex items-center gap-2">
          <Link to={`/chat?userId=${userId}`}>
            <Button variant="outline" size="icon" aria-label="Message friend">
              <MessageCircle className="size-4" />
            </Button>
          </Link>
          <Button variant="secondary" size="sm" onClick={() => removeFriend()} disabled={isRemoving}>
            {isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}
            Remove
          </Button>
        </div>
      );
    }

    if (allowRemove) {
      return <Button variant="outline" size="sm" onClick={() => removeFriend()} disabled={isRemoving} className="text-destructive hover:text-destructive">{isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="mr-2 h-4 w-4" />}Remove friend</Button>;
    }

    return (
      <Button variant="secondary" disabled size="sm">
        <Check className="h-4 w-4 mr-2" />
        Friends
      </Button>
    );
  }

  if (friendshipStatus?.status === "pending") {
    // If current user sent the request
    if (friendshipStatus.receiverId === userId) {
      return (
        <Button variant="outline" size="sm" onClick={() => cancelRequest(friendshipStatus.requestId!)} disabled={isCancelling}>
          {isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
          Cancel request
        </Button>
      );
    }

    // If current user received the request
    return (
      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() =>
            respondToRequest({
              requestId: friendshipStatus.requestId!,
              status: "accepted",
            })
          }
          disabled={isResponding}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            respondToRequest({
              requestId: friendshipStatus.requestId!,
              status: "rejected",
            })
          }
          disabled={isResponding}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => sendRequest()}
      variant="outline"
      disabled={isSending}
      size="sm"
      className="flex items-center gap-2"
    >
      {isSending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      Add Friend
    </Button>
  );
};

export default FriendRequestButton;
