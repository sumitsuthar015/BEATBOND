import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Headphones, MessageCircle, Music2, Share2, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { axiosInstance } from "@/lib/axios";
import { useChatStore } from "@/stores/useChatStore";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";

export interface ActivityFriend {
  clerkId: string;
  fullName: string;
  imageUrl: string;
}

interface FriendProfile extends ActivityFriend {
  username?: string;
  bio?: string;
  friendsCount?: number;
  isOnline?: boolean;
  currentActivity?: string | null;
  canSeeMusicActivity?: boolean;
}

interface FriendActivityProfileDialogProps {
  friend: ActivityFriend | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const listeningDetails = (activity?: string | null) => {
  if (!activity || activity === "Idle") return null;
  const match = activity.match(/^Playing\s+(.+?)\s+by\s+(.+)$/i);
  return match ? { song: match[1], artist: match[2] } : { song: activity, artist: null };
};

export function FriendActivityProfileDialog({
  friend,
  open,
  onOpenChange,
}: FriendActivityProfileDialogProps) {
  const navigate = useNavigate();
  const { onlineUsers, userActivities, isConnected } = useChatStore();
  const { data: profile, isLoading } = useQuery<FriendProfile>({
    queryKey: ["friendActivityProfile", friend?.clerkId],
    queryFn: async () => (await axiosInstance.get(`/users/profile/${friend!.clerkId}`)).data,
    enabled: open && Boolean(friend?.clerkId),
    staleTime: 30_000,
  });

  if (!friend) return null;

  const person = profile ?? friend;
  const isOnline = onlineUsers.has(friend.clerkId);
  // Socket activity is the source of truth while this dialog is open. The API value
  // gives the dialog a useful initial state before the socket has synchronized.
  const liveActivity = isConnected
    ? userActivities.get(friend.clerkId)
    : profile?.currentActivity;
  const track = listeningDetails(liveActivity);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <div className="h-24 bg-gradient-to-br from-primary/80 via-primary/50 to-violet-500/50" />
        <div className="px-6 pb-6">
          <div className="-mt-11 flex items-end justify-between gap-3">
            <Avatar className="h-20 w-20 border-4 border-background shadow-lg">
              <AvatarImage src={person.imageUrl} alt={person.fullName} />
              <AvatarFallback className="text-2xl">{person.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className={`mb-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${isOnline ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
              {isOnline ? "Online now" : "Offline"}
            </span>
          </div>

          <DialogHeader className="mt-4 text-left">
            <DialogTitle className="text-xl">{person.fullName}</DialogTitle>
            <DialogDescription>{profile?.username ? `@${profile.username}` : "Your friend"}</DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="mt-5 h-20 animate-pulse rounded-xl bg-muted" />
          ) : track ? (
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Music2 className="h-4 w-4 animate-pulse" /> Listening now
              </div>
              <p className="mt-2 truncate font-semibold">{track.song}</p>
              {track.artist && <p className="truncate text-sm text-muted-foreground">{track.artist}</p>}
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
              <Headphones className="h-5 w-5" />
              {isOnline ? "Online, but not listening to music right now" : "Not listening right now"}
            </div>
          )}

          <div className="mt-4 rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</p>
            <p className="mt-1.5 line-clamp-3 text-sm leading-6 text-foreground/85">{profile?.bio?.trim() || "No bio shared yet."}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => { onOpenChange(false); navigate(`/profile/${friend.clerkId}/friends`); }} className="rounded-xl border bg-background/50 p-3 text-left transition-colors hover:bg-muted">
              <Users className="mb-2 h-4 w-4 text-primary" />
              <p className="text-lg font-bold tabular-nums">{profile?.friendsCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Friends</p>
            </button>
            <div className="rounded-xl border bg-background/50 p-3">
              <span className={`mb-2 block h-4 w-4 rounded-full ${isOnline ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              <p className="text-sm font-bold">{isOnline ? "Online" : "Offline"}</p>
              <p className="text-xs text-muted-foreground">Current status</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <Button asChild type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              <Link to={`/profile/${friend.clerkId}`}><Users className="mr-2 h-4 w-4" /> View profile</Link>
            </Button>
            <ShareToMessageDialog
              message={`Shared ${person.fullName}'s profile`}
              sharedContent={{ type: "profile", title: person.fullName, subtitle: profile?.bio || "BeatBond profile", imageUrl: person.imageUrl, href: `/profile/${friend.clerkId}` }}
              trigger={<Button type="button" variant="outline" className="w-full"><Share2 className="mr-2 h-4 w-4" /> Share</Button>}
            />
            <Button asChild className="w-full" onClick={() => onOpenChange(false)}>
              <Link to={`/chat?userId=${friend.clerkId}`}>
                <MessageCircle className="mr-2 h-4 w-4" /> Message
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
