import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { MessageCircle, UserRound, Users } from "lucide-react";
import { axiosInstance } from "@/lib/axios";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import FriendRequestButton from "@/components/friends/FriendRequestButton";

type Friend = { clerkId: string; fullName: string; username?: string; imageUrl: string; isOnline?: boolean };

const ConnectionsPage = () => {
  const { userId, kind = "friends" } = useParams<{ userId: string; kind: "friends" | "followers" | "following" | "mutual" }>();
  const { user } = useUser();
  const title = kind === "mutual" ? "Mutual Friends" : kind === "following" ? "Following" : kind === "followers" ? "Followers" : "Friends";
  const isViewingOwnConnections = user?.id === userId;

  const { data = [], isLoading } = useQuery<Friend[]>({
    queryKey: ["connections", userId, kind],
    queryFn: async () => (await axiosInstance.get(kind === "mutual" ? `/friends/mutual/${userId}` : `/friends/user/${userId}`)).data,
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pb-8">
      <div className="mx-auto max-w-xl">
        <header className="mb-5 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Social</p>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">People you’re connected with on BeatBond.</p>
        </header>

        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-16 animate-pulse rounded-2xl bg-secondary/60" />
            ))}
          </div>
        ) : data.length ? (
          <div className="space-y-2.5">
            {data.map((friend) => {
              const isSelf = friend.clerkId === user?.id;

              return (
                <div key={friend.clerkId} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
                  <div className="relative shrink-0">
                    <Avatar className="size-11 border border-border">
                      <AvatarImage src={friend.imageUrl} alt={friend.fullName} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold">
                        {friend.fullName[0]}
                      </AvatarFallback>
                    </Avatar>
                    {friend.isOnline && (
                      <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-emerald-500" />
                    )}
                  </div>

                  <Link to={`/profile/${friend.clerkId}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{friend.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{friend.username || friend.clerkId}</p>
                  </Link>

                  {isSelf ? (
                    <span className="text-xs font-semibold text-muted-foreground px-3 py-1 rounded-full bg-secondary">
                      You
                    </span>
                  ) : isViewingOwnConnections ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link to={`/chat?userId=${friend.clerkId}`}>
                        <Button variant="outline" size="icon" aria-label={`Message ${friend.fullName}`} className="rounded-full size-9">
                          <MessageCircle className="size-4" />
                        </Button>
                      </Link>
                      <FriendRequestButton userId={friend.clerkId} allowRemove />
                    </div>
                  ) : (
                    <FriendRequestButton userId={friend.clerkId} showFriendActions />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <Users className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-semibold text-sm">No {title.toLowerCase()} yet</p>
            <Link to="/users" className="mt-3 inline-flex items-center text-sm font-semibold text-primary hover:underline">
              Find people <UserRound className="ml-1 size-4" />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
};

export default ConnectionsPage;
