import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, BellOff, Search, UserMinus, Loader2, MessageCircle } from "lucide-react";
import { useState, useCallback, useEffect, memo } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { useChatStore } from "@/stores/useChatStore";

const formatConversationTime = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

interface User {
  _id?: string; // friend-relationship id, used for delete
  clerkId: string;
  fullName: string;
  imageUrl: string;
  isOnline?: boolean;
  lastMessage?: string;
  lastMessageTime?: string;
  lastMessageFromMe?: boolean;
  unreadCount?: number;
  isMuted?: boolean;
}

interface UserListProps {
  users: User[];
  selectedUserId?: string;
  onUserSelect?: (userId: string) => void;
  onUserDelete?: (user: User) => void;
  isDeleting?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
}

const UserItem = memo(
  ({
    user,
    isSelected,
    onSelect,
    onDelete,
    nickname,
  }: {
    user: User;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onDelete?: (user: User) => void;
    nickname?: string;
  }) => {
    const onlineUsers = useChatStore((state) => state.onlineUsers);
    const isOnline = onlineUsers.has(user.clerkId);
    return (
      <div
        className={cn(
          "flex items-center gap-1 rounded-lg transition-colors",
          isSelected ? "bg-muted" : "hover:bg-muted/50"
        )}
      >
        <Link
          to={`/chat?userId=${user.clerkId}`}
          className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 flex-1 min-w-0 active:scale-[0.98] transition-transform"
          onClick={() => onSelect(user.clerkId)}
        >
          <div className="relative flex-shrink-0">
            <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
              <AvatarImage
                src={user.imageUrl}
                alt={nickname || user.fullName}
                loading="lazy"
                decoding="async"
              />
              <AvatarFallback className="text-xs sm:text-sm">
                {user.fullName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500 border-2 border-background" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 font-medium text-sm sm:text-base">
                <span className="truncate">{nickname || user.fullName}</span>
                {user.isMuted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
              </p>
              {user.lastMessageTime && (
                <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
                  {formatConversationTime(user.lastMessageTime)}
                </span>
              )}
            </div>
            {user.lastMessage && (
              <p className={cn("text-xs sm:text-sm truncate", user.unreadCount ? "font-medium text-foreground" : "text-muted-foreground")}>
                {user.lastMessageFromMe && <span className="text-muted-foreground">You: </span>}
                {user.lastMessage}
              </p>
            )}
          </div>
          {!!user.unreadCount && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{user.unreadCount > 99 ? "99+" : user.unreadCount}</span>}
        </Link>

        {/* Delete/remove user - same markup for mobile & desktop, layout adapts responsively */}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 mr-1.5 sm:mr-2 h-9 w-9 text-red-400 hover:text-red-500 hover:bg-red-500/10"
            title="Remove user"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(user);
            }}
          >
            <UserMinus className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }
);

UserItem.displayName = "UserItem";

export const UserList = memo(
  ({
    users,
    selectedUserId,
    onUserSelect,
    onUserDelete,
    isDeleting,
    isLoading,
    isError,
    onRetry,
    className,
  }: UserListProps) => {
    const [search, setSearch] = useState("");
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [, setNicknameVersion] = useState(0);

    useEffect(() => {
      const refreshNicknames = () => setNicknameVersion((version) => version + 1);
      window.addEventListener("beatbond:nickname-updated", refreshNicknames);
      window.addEventListener("storage", refreshNicknames);
      return () => {
        window.removeEventListener("beatbond:nickname-updated", refreshNicknames);
        window.removeEventListener("storage", refreshNicknames);
      };
    }, []);

    const debouncedSearch = useDebounce(search, 300);

    const filteredUsers = users.filter((user) => {
      const nickname = localStorage.getItem(`beatbond:nickname:${user.clerkId}`) || "";
      return `${user.fullName} ${nickname}`.toLowerCase().includes(debouncedSearch.toLowerCase());
    }).sort((first, second) => {
      const firstTime = first.lastMessageTime ? new Date(first.lastMessageTime).getTime() : 0;
      const secondTime = second.lastMessageTime ? new Date(second.lastMessageTime).getTime() : 0;
      return secondTime - firstTime;
    });

    const handleUserSelect = useCallback(
      (userId: string) => {
        onUserSelect?.(userId);
      },
      [onUserSelect]
    );

    const handleConfirmDelete = useCallback(() => {
      if (userToDelete) {
        onUserDelete?.(userToDelete);
      }
      setUserToDelete(null);
    }, [userToDelete, onUserDelete]);

    return (
      <div className={cn("flex flex-col h-full bg-background", className)}>
        {/* Search */}
        <div className="p-3 sm:p-4 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search messages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 sm:h-10 text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Users List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {isLoading && (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 rounded-lg">
                    <div className="h-11 w-11 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-40 rounded bg-muted/70 animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && isError && (
              <div className="text-center p-8 text-muted-foreground text-sm space-y-3">
                <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
                <p>Unable to load messages.</p>
                {onRetry && (
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    Retry
                  </Button>
                )}
              </div>
            )}

            {!isLoading && !isError && filteredUsers.map((user) => (
              <UserItem
                key={user.clerkId}
                user={user}
                nickname={localStorage.getItem(`beatbond:nickname:${user.clerkId}`) || undefined}
                isSelected={selectedUserId === user.clerkId}
                onSelect={handleUserSelect}
                onDelete={onUserDelete ? setUserToDelete : undefined}
              />
            ))}

            {!isLoading && !isError && filteredUsers.length === 0 && (
              <div className="text-center p-8 text-muted-foreground text-sm space-y-3">
                <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/70" />
                <p>{search ? "No users found" : "No friends available"}</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Remove-user confirmation dialog */}
        <AlertDialog
          open={!!userToDelete}
          onOpenChange={(open) => !open && setUserToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {userToDelete?.fullName}?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes {userToDelete?.fullName} from your friends list and
                chat list. They won't be notified, and you can add them again
                later if you change your mind.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Remove"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }
);

UserList.displayName = "UserList";
