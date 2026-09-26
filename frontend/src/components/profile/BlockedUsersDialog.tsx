import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserX } from "lucide-react";
import { toast } from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { axiosInstance } from "@/lib/axios";
import { blockedUsersQueryKey, useBlockedUsers, type PersonSummary } from "./profileQueries";

export const BlockedUsersDialog = ({ trigger }: { trigger: ReactNode }) => {
  const queryClient = useQueryClient();
  const { data: blocked = [], isLoading } = useBlockedUsers();
  const unblock = useMutation({
    mutationFn: (user: PersonSummary) => axiosInstance.delete(`/users/block/${user.clerkId}`),
    onSuccess: (_, user) => {
      queryClient.setQueryData<PersonSummary[]>(blockedUsersQueryKey, (current = []) => current.filter((item) => item.clerkId !== user.clerkId));
      void queryClient.invalidateQueries({ queryKey: ["userProfile", user.clerkId] });
      toast.success(`${user.fullName} is unblocked`);
    },
    onError: () => toast.error("Could not unblock. Please try again."),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Blocked people</DialogTitle>
          <DialogDescription>They can't message you, send you friend requests, find you in search or see you on the map.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : blocked.length ? (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {blocked.map((user) => (
              <li key={user.clerkId} className="flex items-center gap-3 py-3">
                <Avatar className="size-10"><AvatarImage src={user.imageUrl} /><AvatarFallback>{user.fullName?.[0] ?? "U"}</AvatarFallback></Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{user.fullName}</span>
                  {user.username && <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>}
                </span>
                <Button size="sm" variant="outline" disabled={unblock.isPending && unblock.variables?.clerkId === user.clerkId} onClick={() => unblock.mutate(user)}>
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <UserX className="size-6" />
            You haven't blocked anyone.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
