import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { axiosInstance } from "@/lib/axios";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useClerk, useUser } from "@clerk/clerk-react";
import { toast } from "react-hot-toast";
import { useState, useEffect, useMemo, useCallback, memo } from "react";
import FriendRequestButton from "@/components/friends/FriendRequestButton";
import { useChatStore } from "@/stores/useChatStore";
import { beginBackNavigation } from "@/lib/routeHistory";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { ShareToMessageDialog } from "@/components/ShareToMessageDialog";
import type { Song } from "@/types";
import {
  MessageCircle,
  MessageSquare,
  Trash2,
  Users,
  Calendar,
  Mail,
  MapPin,
  Link2,
  Settings,
  Share2,
  Loader2,
  ArrowLeft,
  Lock,
  UserCheck,
  Clock,
  Shield,
  Headphones,
  Music2,
  Play,
  LogOut,
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




// Memoized Friend Card Component
const FriendCard = memo(({ friend }: any) => {
  const friendId = friend.id || friend.clerkId || friend._id;
  if (!friendId || friendId === 'undefined') return null;
  
  return (
    <Link to={`/profile/${friendId}`}>
      <Card className="cursor-pointer hover:bg-zinc-800/30 transition-all hover:scale-[1.02] active:scale-[0.98] border-zinc-800/50 backdrop-blur-sm group">
        <CardContent className="p-4">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-3">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 ring-2 ring-zinc-800 group-hover:ring-blue-500/50 transition-all">
                <AvatarImage src={friend.imageUrl} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500">
                  {friend.fullName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {friend.isOnline && (
                <div className="absolute bottom-0 right-0 h-3.5 w-3.5 bg-green-500 rounded-full border-2 border-zinc-900 ring-2 ring-green-500/20"></div>
              )}
            </div>
            <h4 className="font-semibold mb-0.5 truncate text-sm w-full">{friend.fullName}</h4>
            <p className="text-xs text-zinc-400 truncate w-full mb-2">@{friend.username}</p>
            {friend.mutualFriends !== undefined && friend.mutualFriends > 0 && (
              <Badge variant="secondary" className="text-xs">
                {friend.mutualFriends} mutual
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});

FriendCard.displayName = "FriendCard";

const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();
  const socket = useChatStore((state) => state.socket);
  const ownCurrentActivity = useChatStore((state) => state.currentActivity);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("about");
  const [profileActivity, setProfileActivity] = useState<string | null | undefined>(undefined);
  const setCurrentSong = usePlayerStore((state) => state.setCurrentSong);

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



interface CommentItem {
  _id: string;
  userId: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  songImageUrl: string;
  content: string;
  createdAt: string;
}

  const { data: userComments = [], isLoading: commentsLoading } = useQuery<CommentItem[]>({
    queryKey: ["userComments", userId],
    queryFn: async () => {
      if (!userId || userId === 'undefined' || userId === 'null') return [];
      return (await axiosInstance.get(`/comments/user/${userId}`)).data;
    },
    enabled: !!userId && userId !== 'undefined' && userId !== 'null',
    staleTime: 30000,
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return (await axiosInstance.delete(`/comments/${commentId}`)).data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["userComments", userId] });
      toast.success("Comment deleted");
    },
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

  const formatDate = useCallback((dateString?: string) => {
    if (!dateString) return "Recently";
    try {
      return new Date(dateString).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
      return "Recently";
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
            <Button onClick={() => navigate('/users')} variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Search
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#101010] pb-28 md:pb-8">
      {/* Cover Section - Fixed */}
      <div className="relative">
        <div className="h-32 sm:h-40 md:h-48 bg-gradient-to-br from-emerald-500/80 via-emerald-700/50 to-[#101010] relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.18),transparent_68%)]"></div>
          
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-black/50 hover:bg-black/70 backdrop-blur-sm z-10"
            onClick={() => navigate(beginBackNavigation(), { replace: true })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="absolute -bottom-12 sm:-bottom-14 md:-bottom-16 left-4 sm:left-6">
            <div className="relative group">
              <Avatar className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 border-4 border-zinc-900 shadow-xl ring-4 ring-zinc-800/50">
                <AvatarImage src={profile.imageUrl} alt={profile.fullName} />
                <AvatarFallback className="text-xl sm:text-2xl md:text-3xl bg-gradient-to-br from-blue-500 to-purple-500">
                  {profile.fullName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              
              {profile.isOnline && (
                <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2">
                  <div className="h-4 w-4 sm:h-5 sm:w-5 bg-green-500 rounded-full border-3 border-zinc-900 ring-2 ring-green-500/30"></div>
                </div>
              )}

              {isOwnProfile && (
                <Link to="/settings/profile" className="absolute inset-0 bg-black/0 group-hover:bg-black/50 rounded-full flex items-center justify-center transition-all">
                  <Settings className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Profile Info */}
        <div className="px-4 sm:px-6 pt-14 sm:pt-16 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-1">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">{profile.fullName}</h1>
                {!isOwnProfile && profile.friendshipStatus === "accepted" && (
                  <Badge variant="secondary" className="flex items-center gap-1 text-xs flex-shrink-0">
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

            <div className="flex gap-2 flex-shrink-0">
              {!isOwnProfile ? (
                <>
                  <div className="relative group">
                    <Button
                      onClick={handleStartChat}
                      disabled={!canMessage}
                      variant={canMessage ? "default" : "outline"}
                      size="sm"
                      className="flex items-center gap-2"
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
                  <Link to="/settings/profile">
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                      <span className="hidden xs:inline ml-2 text-sm">Edit</span>
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => void handleSignOut()} className="text-destructive hover:text-destructive">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden xs:inline ml-2 text-sm">Sign out</span>
                  </Button>
                </>
              )}
              
              <ShareToMessageDialog message={`Check out ${profile.fullName}'s profile on BeatBond:\n${window.location.href}`} trigger={<Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Share profile in a message"><Share2 className="h-4 w-4" /></Button>} />
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 sm:gap-6 py-3 border-y border-zinc-800/50">
            <div className="text-center">
              <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                {userComments.length}
              </div>
              <div className="text-xs text-zinc-400">Comments</div>
            </div>
            
            <button
              onClick={() => navigate(`/profile/${userId}/friends`)}
              className="text-center hover:bg-zinc-800/30 rounded-lg px-2 py-1 transition-colors"
            >
              <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
                {profile.friendsCount ?? friends.length}
              </div>
              <div className="text-xs text-zinc-400">Friends</div>
            </button>
            
            {!isOwnProfile && profile.mutualFriendsCount !== undefined && profile.mutualFriendsCount > 0 && (
              <button
                onClick={() => navigate(`/profile/${userId}/mutual`)}
                className="text-center hover:bg-zinc-800/30 rounded-lg px-2 py-1 transition-colors"
              >
                <div className="text-lg sm:text-xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">
                  {profile.mutualFriendsCount}
                </div>
                <div className="text-xs text-zinc-400">Mutual</div>
              </button>
            )}
          </div>

          {profile.canSeeMusicActivity && isListening && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-400 text-black">
                <Headphones className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-300">Listening activity</p>
                <p className="truncate text-sm text-white">{liveActivity}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Content */}
      <div className="px-4 sm:px-6 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="about" className="text-xs sm:text-sm">About</TabsTrigger>
              <TabsTrigger value="comments" className="text-xs sm:text-sm">
                Comments{userComments.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{userComments.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="about" className="space-y-4 mt-0">
              <Card className="overflow-hidden border-emerald-400/20 bg-gradient-to-r from-emerald-500/15 to-transparent">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-11 items-center justify-center rounded-full bg-emerald-400 text-black"><Music2 className="size-5" /></div>
                  <div><p className="font-semibold">{isOwnProfile ? "Your music corner" : `${profile.fullName.split(' ')[0]}'s music corner`}</p><p className="text-xs text-zinc-400">Connect, share activity and discover music together.</p></div>
                </CardContent>
              </Card>
              <Card className="border-zinc-800/50 backdrop-blur-sm">
                <CardContent className="p-4 sm:p-6 space-y-4">
                  {profile.bio && (
                    <div className="pb-4 border-b border-zinc-800/50">
                      <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-blue-500" />
                        About
                      </h3>
                      <p className="text-zinc-300 text-sm leading-relaxed">{profile.bio}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {profile.email && (
                      <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30 transition-colors">
                        <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500">Email</p>
                          <p className="text-sm text-zinc-300 break-all">{profile.email}</p>
                        </div>
                      </div>
                    )}

                    {profile.location && (
                      <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30 transition-colors">
                        <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                          <MapPin className="h-4 w-4 text-green-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500">Location</p>
                          <p className="text-sm text-zinc-300">{profile.location}</p>
                        </div>
                      </div>
                    )}

                    {profile.website && (
                      <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-800/30 transition-colors">
                        <div className="h-9 w-9 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                          <Link2 className="h-4 w-4 text-purple-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500">Website</p>
                          <a
                            href={profile.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:underline break-all"
                          >
                            {profile.website}
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-800/20">
                      <div className="h-9 w-9 rounded-full bg-pink-500/10 flex items-center justify-center flex-shrink-0">
                        <Calendar className="h-4 w-4 text-pink-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-500">Member since</p>
                        <p className="text-sm text-zinc-300">{formatDate(profile.joinedDate)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comments" className="space-y-3 mt-0">
              {commentsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="border-zinc-800/50">
                      <CardContent className="p-4 flex gap-3">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : userComments.length > 0 ? (
                userComments.map((comment) => (
                  <Card key={comment._id} className="border-zinc-800/50 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="relative size-12 rounded-lg bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0 border border-zinc-700">
                            {comment.songImageUrl ? (
                              <img src={comment.songImageUrl} alt={comment.songTitle} className="size-full object-cover" />
                            ) : (
                              <Music2 className="size-6 text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate text-white">{comment.songTitle}</p>
                            <p className="text-xs text-zinc-400 truncate">{comment.songArtist}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setCurrentSong({
                                _id: comment.songId,
                                title: comment.songTitle,
                                artist: comment.songArtist,
                                imageUrl: comment.songImageUrl,
                                audioUrl: "",
                                duration: 0,
                              } as Song);
                            }}
                            className="size-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-full"
                            title="Play Song"
                          >
                            <Play className="size-4 fill-current" />
                          </Button>

                          {isOwnProfile && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteCommentMutation.mutate(comment._id)}
                              disabled={deleteCommentMutation.isPending}
                              className="size-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-full"
                              title="Delete Comment"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="bg-zinc-800/40 rounded-xl p-3 border border-zinc-800/80">
                        <p className="text-xs text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                          {comment.content}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-2 text-right">
                          {getRelativeTime(comment.createdAt)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-zinc-800/50">
                  <CardContent className="py-12 text-center">
                    <div className="h-14 w-14 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="h-7 w-7 text-zinc-600" />
                    </div>
                    <p className="font-medium mb-1 text-sm">No comments yet</p>
                    <p className="text-xs text-zinc-500">
                      {isOwnProfile
                        ? "Comment on songs around BeatBond to see them displayed here!"
                        : `${profile.fullName.split(" ")[0]} hasn't commented on any songs yet.`}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
    </div>
  );
};

export default UserProfilePage;
