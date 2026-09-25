import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { axiosInstance } from "@/lib/axios";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useClerk, useUser } from "@clerk/clerk-react";
import { toast } from "react-hot-toast";
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import FriendRequestButton from "@/components/friends/FriendRequestButton";
import { useChatStore } from "@/stores/useChatStore";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";
import {
  MessageCircle,
  Settings,
  Share2,
  Loader2,
  Lock,
  UserCheck,
  Clock,
  Shield,
  LogOut,
  Disc3,
  Copy,
} from "lucide-react";

interface UserProfile {
  clerkId: string;
  fullName: string;
  username: string;
  imageUrl: string;
  bio: string;
  email: string;
  location?: string;
  website?: string;
  joinedDate?: string;
  friendsCount?: number;
  mutualFriendsCount?: number;
  friendshipSince?: string | null;
  conversationCount?: number;
  isFriend?: boolean;
  friendshipStatus?: "none" | "pending" | "accepted" | "blocked";
  isOnline?: boolean;
  lastSeen?: string;
  currentActivity?: string | null;
  canSeeMusicActivity?: boolean;
}



interface Friend {
  id?: string;
  clerkId?: string;
  _id?: string;
  fullName: string;
  username: string;
  imageUrl: string;
  isOnline?: boolean;
  mutualFriends?: number;
}




const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();
  const socket = useChatStore((state) => state.socket);
  const ownCurrentActivity = useChatStore((state) => state.currentActivity);
  const [profileActivity, setProfileActivity] = useState<string | null | undefined>(undefined);

  const isOwnProfile = user?.id === userId;

  // Validate userId on mount
  useEffect(() => {
    if (!userId || userId === 'undefined' || userId === 'null') {
      toast.error("Invalid profile link");
      navigate('/users', { replace: true });
    }
  }, [userId, navigate]);

  // Fetch user profile
  const {
    data: profile,
    isLoading,
    error,
    refetch,
  } = useQuery<UserProfile>({
    queryKey: ["userProfile", userId],
    queryFn: async () => {
      if (!userId || userId === 'undefined' || userId === 'null') {
        throw new Error("Invalid user ID");
      }
      try {
        const { data } = await axiosInstance.get(`/users/profile/${userId}`);
        return data;
      } catch (err: any) {
        // If viewing own profile and DB returned error, attempt auto-sync
        if (isOwnProfile && user) {
          try {
            await axiosInstance.post("/auth/callback", {
              email_addresses: user.primaryEmailAddress?.emailAddress,
              username: user.username,
              first_name: user.firstName,
              last_name: user.lastName,
              image_url: user.imageUrl,
            });
            const { data: retryData } = await axiosInstance.get(`/users/profile/${userId}`);
            return retryData;
          } catch (syncErr) {
            console.error("Auto-sync failed in profile page", syncErr);
          }
        }
        throw err;
      }
    },
    retry: 2,
    enabled: !!userId && userId !== 'undefined' && userId !== 'null',
    staleTime: 60000,
  });

  const { data: userComments = [] } = useQuery<Array<{ _id: string }>>({
    queryKey: ["userCommentsCount", userId],
    queryFn: async () => {
      if (!userId || userId === "undefined" || userId === "null") return [];
      return (await axiosInstance.get(`/comments/user/${userId}`)).data;
    },
    enabled: Boolean(userId) && userId !== "undefined" && userId !== "null",
    staleTime: 30_000,
  });



  // Fetch user's friends - with proper error handling
  const { data: friendsRaw = [] } = useQuery<Friend[]>({
    queryKey: ["userFriends", userId],
    queryFn: async () => {
      if (!userId || userId === 'undefined' || userId === 'null') return [];
      return (await axiosInstance.get(`/friends/user/${userId}`)).data;
    },
    // Friends count and the Friends tab should agree on the same data.
    enabled: !!userId && userId !== 'undefined' && userId !== 'null',
    retry: false,
    staleTime: 30000,
  });

  // Memoized friends processing
  const friends = useMemo(() => 
    friendsRaw
      .filter(friend => {
        const friendId = friend.id || friend.clerkId || friend._id;
        return friendId && friendId !== 'undefined' && friendId !== 'null';
      })
      .map(friend => ({
        ...friend,
        id: friend.id || friend.clerkId || friend._id || `temp-${Math.random()}`
      })),
    [friendsRaw]
  );

  const canMessage = profile?.isFriend || profile?.friendshipStatus === "accepted";
  // Keep a profile open on screen synchronized with the activity events. This
  // is intentionally local state so the displayed track changes immediately
  // even though the profile query itself is cached for a minute.
  useEffect(() => {
    setProfileActivity(profile?.currentActivity ?? null);
  }, [profile?.currentActivity, userId]);

  useEffect(() => {
    if (!userId) return;
    const onActivityUpdated = ({ userId: activityUserId, activity }: { userId: string; activity: string }) => {
      if (activityUserId === userId) setProfileActivity(activity);
    };
    const onActivityCleared = ({ userId: activityUserId }: { userId: string }) => {
      if (activityUserId === userId) setProfileActivity(null);
    };
    socket.on("activity_updated", onActivityUpdated);
    socket.on("activity_cleared", onActivityCleared);
    return () => {
      socket.off("activity_updated", onActivityUpdated);
      socket.off("activity_cleared", onActivityCleared);
    };
  }, [socket, userId]);

  const liveActivity = isOwnProfile
    ? ownCurrentActivity
    : profileActivity === undefined ? profile?.currentActivity : profileActivity;
  const isListening = Boolean(liveActivity && liveActivity.trim().toLowerCase() !== "idle");

  const handleStartChat = useCallback(() => {
    if (!canMessage) {
      toast.error("You can only message friends. Send them a friend request first!");
      return;
    }
    if (userId) navigate(`/chat?userId=${userId}`);
  }, [canMessage, userId, navigate]);
  const handleSignOut = async () => {
    await signOut({ redirectUrl: "/" });
  };
  const handleCopyProfileLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Profile link copied");
    } catch {
      toast.error("Could not copy the profile link");
    }
  }, []);

  const getRelativeTime = useCallback((dateString?: string) => {
    if (!dateString) return "Recently";
    try {
      const date = new Date(dateString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return "Recently";
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto" />
          <p className="text-zinc-400 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    const is404 = (error as any)?.response?.status === 404;
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="p-6 sm:p-8 text-center max-w-md border-zinc-800/50">
          <div className="text-4xl mb-4">{is404 ? "⚠️" : "🔄"}</div>
          <h2 className="text-lg sm:text-xl font-bold mb-2">
            {is404 ? "User not found" : "Could not load profile"}
          </h2>
          <p className="text-zinc-400 text-sm mb-6">
            {is404
              ? "This profile doesn't exist or has been removed."
              : "Something went wrong while connecting to the server. Please try again."}
          </p>
          <div className="flex flex-col gap-2">
            {!is404 && (
              <Button onClick={() => refetch()} className="w-full bg-emerald-500 text-black hover:bg-emerald-400">
                Try again
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#09090b] p-4 pb-28 text-zinc-100 sm:p-6 sm:pb-28 lg:p-8 lg:pb-10">
      {/* Cover Section - Fixed */}
      <motion.section
        className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/30"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: "easeOut" }}
      >
        <div className="relative h-36 bg-gradient-to-br from-primary/40 via-zinc-900 to-[#101010] sm:h-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,hsl(var(--primary)/.22),transparent_45%)]" />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-zinc-950/60 to-transparent" />
          
        </div>

        <div className="relative px-5 pb-6 sm:px-6">
          <motion.div
            className="relative -mt-14 mb-4 w-fit group"
            initial={{ opacity: 0, scale: 0.8, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.1 }}
          >
            <Avatar className="size-24 border-4 border-zinc-950 shadow-xl shadow-black/50 ring-1 ring-white/20 sm:size-28">
              <AvatarImage src={profile.imageUrl} alt={profile.fullName} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-zinc-500 text-xl text-primary-foreground sm:text-2xl md:text-3xl">
                {profile.fullName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            {profile.isOnline && (
              <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2">
                <div className="h-4 w-4 rounded-full border-2 border-zinc-950 bg-green-500 ring-2 ring-green-500/30 sm:h-5 sm:w-5" />
              </div>
            )}
            {isOwnProfile && (
              <Link to="/settings" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-all group-hover:bg-black/50">
                <Settings className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            )}
          </motion.div>

          <div className="mb-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex items-start gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{profile.fullName}</h1>
                {!isOwnProfile && profile.friendshipStatus === "accepted" && (
                  <Badge variant="secondary" className="flex shrink-0 items-center gap-1 border border-primary/25 bg-primary/10 text-xs text-primary">
                    <UserCheck className="h-3 w-3" />
                    Friends
                  </Badge>
                )}
              </div>
              <p className="text-zinc-400 text-sm mb-2">@{profile.username} · Music profile</p>
              
              {!isOwnProfile && (
                <div className="text-xs text-zinc-500">
                  {profile.isOnline ? (
                    <span className="flex items-center gap-1.5 text-green-500">
                      <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse"></span>
                      Active now
                    </span>
                  ) : profile.lastSeen ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      Active {getRelativeTime(profile.lastSeen)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {!isOwnProfile ? (
                <>
                  <div className="relative group">
                    <Button
                      onClick={handleStartChat}
                      disabled={!canMessage}
                      variant={canMessage ? "default" : "outline"}
                      className="h-10 rounded-xl bg-primary px-4 font-bold text-primary-foreground shadow-lg shadow-black/20 hover:bg-primary/90"
                    >
                      {canMessage ? <MessageCircle className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      <span className="hidden xs:inline text-sm">Message</span>
                    </Button>
                    
                    {!canMessage && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap">
                        <div className="bg-zinc-800 text-white text-xs rounded-lg py-1.5 px-2.5 shadow-xl border border-zinc-700">
                          <div className="flex items-center gap-1.5">
                            <Shield className="h-3 w-3" />
                            <span>Only friends can message</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <FriendRequestButton userId={userId!} allowRemove />
                </>
              ) : (
                <>
                  <Link to="/settings">
                    <Button variant="outline" className="h-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10">
                      <Settings className="h-4 w-4" />
                      <span className="hidden xs:inline ml-2 text-sm">Edit</span>
                    </Button>
                  </Link>
                  <Button variant="outline" className="h-10 rounded-xl border-white/10 bg-white/5 text-destructive hover:text-destructive" onClick={() => void handleSignOut()}>
                    <LogOut className="h-4 w-4" />
                    <span className="hidden xs:inline ml-2 text-sm">Sign out</span>
                  </Button>
                </>
              )}
              
              <Button variant="ghost" size="icon" className="size-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" aria-label="Copy profile link" onClick={() => void handleCopyProfileLink()}><Copy className="size-4" /></Button>
              <ShareToMessageDialog message={`Check out ${profile.fullName}'s profile on BeatBond:\n${window.location.href}`} trigger={<Button variant="ghost" size="icon" className="size-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10" aria-label="Share profile in a message"><Share2 className="size-4" /></Button>} />
            </div>
          </div>

          <motion.div
            className="mt-1 flex items-center gap-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <div>
              <p className="text-xl font-bold text-white">{userComments.length}</p>
              <p className="text-xs font-medium text-zinc-500">Comments</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/profile/${userId}/friends`)}
              className="text-left transition-colors hover:text-primary"
            >
              <p className="text-xl font-bold text-primary">{profile.friendsCount ?? friends.length}</p>
              <p className="text-xs font-medium text-zinc-500">Friends</p>
            </button>
          </motion.div>

          {profile.canSeeMusicActivity && isListening && (
            <motion.div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/15 to-transparent p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-black/20">
                <Disc3 className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Listening now</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-white">{liveActivity}</p>
              </div>
            </motion.div>
          )}
        </div>
      </motion.section>

          </div>
  );
};

export default UserProfilePage;
