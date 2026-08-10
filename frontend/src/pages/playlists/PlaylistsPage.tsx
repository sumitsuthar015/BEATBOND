import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import {
  Download,
  Music2,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import { PlaylistCard } from "@/components/PlaylistCard";

const PlaylistsPage = () => {
  const { user } = useUser();
  const {
    playlists,
    isLoading,
    error,
    fetchPlaylists,
    createPlaylist,
  } = usePlaylistStore();
  const [query, setQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (user) void fetchPlaylists();
  }, [user, fetchPlaylists]);

  useEffect(() => {
    const id = searchParams.get("open");
    if (!id) return;
    const playlist = playlists.find((item) => item.id === id);
    if (playlist) navigate(`/playlists/${playlist.id}`, { replace: true });
  }, [playlists, searchParams, navigate]);

  const visible = useMemo(
    () =>
      playlists.filter((playlist) =>
        playlist.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [playlists, query],
  );

  const create = async () => {
    if (!name.trim()) return;
    const playlist = await createPlaylist(name.trim(), description.trim());
    if (playlist) {
      setName("");
      setDescription("");
      setIsCreateOpen(false);
    }
  };

  if (!user) {
    return (
      <main className="grid h-full place-items-center p-6 text-center">
        <div>
          <Music2 className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h1 className="text-xl font-bold">Your playlists are waiting</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to create and save playlists.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 sm:pt-8 md:pb-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 flex items-end justify-between gap-3">
          <div className="flex-1 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Your library
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Playlists
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your music, saved to your account.
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="shrink-0">
            <Plus className="mr-1 size-4" />
            New
          </Button>
        </header>
        <div className="relative mb-5 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your playlists"
            className="h-11 rounded-xl pl-10"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="aspect-[.9] animate-pulse rounded-2xl bg-secondary"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/40 p-6 text-center">
            <p className="font-semibold">Couldn't load playlists</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-4" onClick={() => void fetchPlaylists()}>
              Try again
            </Button>
          </div>
        ) : visible.length ? (
          <div className="space-y-7">
            {visible.some((playlist) => playlist.downloadedAt) && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Download className="size-5 text-primary" />
                  <h2 className="text-lg font-bold">Downloaded playlists</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                  {visible.filter((playlist) => playlist.downloadedAt).map((playlist) => (
                    <PlaylistCard key={playlist.id} playlist={playlist} />
                  ))}
                </div>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-lg font-bold">Your playlists</h2>
              <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {visible.filter((playlist) => !playlist.downloadedAt).map((playlist) => (
                  <PlaylistCard key={playlist.id} playlist={playlist} />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed py-16 text-center">
            <Music2 className="mx-auto mb-3 size-9 text-muted-foreground" />
            <h2 className="font-bold">
              {query ? "No matching playlists" : "Create your first playlist"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {query
                ? "Try another search."
                : "Add songs from the player whenever you find a favourite."}
            </p>
            {!query && (
              <Button className="mt-5" onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-1 size-4" />
                Create playlist
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New playlist</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void create()}
            placeholder="Playlist name"
            maxLength={100}
          />
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description (optional)" maxLength={500} />
          <Button onClick={() => void create()} disabled={!name.trim()}>
            Create playlist
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default PlaylistsPage;
