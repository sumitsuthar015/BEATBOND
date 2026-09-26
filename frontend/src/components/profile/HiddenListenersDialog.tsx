import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, Search } from "lucide-react";
import { toast } from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { axiosInstance } from "@/lib/axios";
import { cn } from "@/lib/utils";
import { hiddenListenersQueryKey, useHiddenListeners, type PersonSummary } from "./profileQueries";

/**
 * Pick friends who never see your listening: not the song you're playing,
 * not your top artists, not your recently played songs.
 */
export const HiddenListenersDialog = ({ trigger }: { trigger: ReactNode }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: hidden = [], isLoading: loadingHidden } = useHiddenListeners(open);
  const { data: friends = [], isLoading: loadingFriends } = useQuery<PersonSummary[]>({
    queryKey: ["friends"],
    queryFn: async () => (await axiosInstance.get("/friends")).data,
    enabled: open,
    staleTime: 30_000,
  });

  const hiddenIds = useMemo(() => new Set(hidden.map((person) => person.clerkId)), [hidden]);
  // Friends first; people hidden earlier who are no longer friends stay listed so they can be un-hidden.
  const people = useMemo(() => {
    const all = [...friends, ...hidden.filter((person) => !friends.some((friend) => friend.clerkId === person.clerkId))];
    const needle = search.trim().toLowerCase();
    return needle ? all.filter((person) => `${person.fullName} ${person.username ?? ""}`.toLowerCase().includes(needle)) : all;
  }, [friends, hidden, search]);

  const toggle = useMutation({
    mutationFn: ({ person, hide }: { person: PersonSummary; hide: boolean }) =>
      hide ? axiosInstance.put(`/users/music-hidden/${person.clerkId}`) : axiosInstance.delete(`/users/music-hidden/${person.clerkId}`),
    onMutate: ({ person, hide }) => {
      const previous = queryClient.getQueryData<PersonSummary[]>(hiddenListenersQueryKey);
      queryClient.setQueryData<PersonSummary[]>(hiddenListenersQueryKey, (current = []) =>
        hide ? [...current, person] : current.filter((item) => item.clerkId !== person.clerkId));
      return { previous };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(hiddenListenersQueryKey, context?.previous);
      toast.error("Could not update. Please try again.");
    },
    onSettled: (_, __, { person }) => void queryClient.invalidateQueries({ queryKey: ["userProfile", person.clerkId] }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hide my listening from…</DialogTitle>
          <DialogDescription>People you pick never see what you're playing, your top artists or your recently played songs, whatever your other settings are.</DialogDescription>
        </DialogHeader>
        {friends.length + hidden.length > 6 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search friends" className="pl-9" />
          </div>
        )}
        {loadingFriends || loadingHidden ? (
          <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : people.length ? (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {people.map((person) => {
              const isHidden = hiddenIds.has(person.clerkId);
              return (
                <li key={person.clerkId}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isHidden}
                    aria-label={`Hide my listening from ${person.fullName}`}
                    onClick={() => toggle.mutate({ person, hide: !isHidden })}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <Avatar className="size-10"><AvatarImage src={person.imageUrl} /><AvatarFallback>{person.fullName?.[0] ?? "U"}</AvatarFallback></Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{person.fullName}</span>
                    <span className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                      isHidden ? "bg-destructive/15 text-destructive" : "border text-foreground",
                    )}>
                      {isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      {isHidden ? "Hidden" : "Hide"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{search ? "No friends match your search." : "Add friends first, then choose who shouldn't see your listening."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
