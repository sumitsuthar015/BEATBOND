import { useEffect, useState } from "react";
import { Heart, Library, Music2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useMusicStore } from "@/stores/useMusicStore";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import { useSavedAlbumsStore } from "@/stores/useSavedAlbumsStore";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { DownloadsCover } from "@/components/DownloadsCover";
import { fetchSavedArtists, LIKED_ARTISTS_UPDATED_EVENT, savedArtistsFromSocket, type SavedArtist } from "@/lib/savedArtists";
import { useChatStore } from "@/stores/useChatStore";

import { PlaylistCard } from "@/components/PlaylistCard";
import { AlbumOptionsMenu } from "@/components/AlbumOptionsMenu";

const LibraryPage = () => {
  const navigate = useNavigate();
  const albums = useMusicStore((state) => state.albums);
  const fetchAlbums = useMusicStore((state) => state.fetchAlbums);
  const playlists = usePlaylistStore((state) => state.playlists);
  const fetchPlaylists = usePlaylistStore((state) => state.fetchPlaylists);
  const savedAlbums = useSavedAlbumsStore((state) => state.savedAlbums);
  const downloads = useOfflineDownloads();
  const { user } = useUser();
  const socket = useChatStore((state) => state.socket);
  const [savedArtists, setSavedArtists] = useState<SavedArtist[]>([]);

  // Combine backend albums + saved custom/saavn albums without duplicates
  const allLibraryAlbums = [
    ...savedAlbums,
    ...albums.filter((a) => !savedAlbums.some((s) => s.id === a._id)),
  ];

  useEffect(() => { void fetchAlbums(); void fetchPlaylists(); }, [fetchAlbums, fetchPlaylists]);
  useEffect(() => { if (user) void fetchSavedArtists(user.id).then(setSavedArtists).catch(() => setSavedArtists([])); }, [user]);
  useEffect(() => { const update = (artists: any[]) => setSavedArtists(savedArtistsFromSocket(artists)); socket.on("liked_artists_updated", update); return () => { socket.off("liked_artists_updated", update); }; }, [socket]);
  useEffect(() => { const update = (event: Event) => setSavedArtists((event as CustomEvent<SavedArtist[]>).detail); window.addEventListener(LIKED_ARTISTS_UPDATED_EVENT, update); return () => window.removeEventListener(LIKED_ARTISTS_UPDATED_EVENT, update); }, []);

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 sm:pt-8 md:pb-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="text-center"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Your music</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Library</h1><p className="mt-1 text-sm text-muted-foreground">Liked music, artists, playlists, and offline downloads in one place.</p></header>

        <section>
          <div className="mb-3 flex items-center gap-2"><Library className="size-5 text-primary" /><h2 className="text-xl font-bold">Your playlists</h2></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <button onClick={() => navigate("/downloads")} className="min-w-0 rounded-2xl border bg-card p-2.5 text-left transition-colors hover:bg-secondary/50">
              <DownloadsCover songs={downloads} className="aspect-square w-full rounded-xl" />
              <p className="mt-2 truncate text-sm font-semibold">Downloads</p><p className="text-xs text-muted-foreground">{downloads.length} {downloads.length === 1 ? "song" : "songs"}</p>
            </button>
            {playlists.filter((playlist) => !playlist.downloadedAt).map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} />)}
          </div>
          {!playlists.length && <p className="mt-3 text-sm text-muted-foreground">Create a playlist from the player and it will appear here.</p>}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2"><Heart className="size-5 text-primary" /><h2 className="text-xl font-bold">Liked artists</h2></div>
          {savedArtists.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{savedArtists.map((artist) => <Link key={artist.id} to={`/artist/${artist.id}`} className="min-w-0 rounded-2xl border bg-card p-2.5 transition-colors hover:bg-secondary/50"><img src={artist.image?.[2]?.url || artist.image?.[0]?.url || "/default-image.png"} alt="" className="aspect-square w-full rounded-xl object-cover" /><p className="mt-2 truncate text-sm font-semibold">{artist.name}</p><p className="text-xs text-muted-foreground">Artist</p></Link>)}</div> : <p className="text-sm text-muted-foreground">Like an artist to save them here.</p>}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2"><Music2 className="size-5 text-primary" /><h2 className="text-xl font-bold">Albums</h2></div>
          {allLibraryAlbums.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {allLibraryAlbums.map((album) => {
                const albumId = album.id || album._id;
                const albumTitle = album.name || album.title;
                const albumImage = album.imageUrl || album.image?.[2]?.url;
                return (
                  <div key={albumId} onClick={() => navigate(`/album/${albumId}`)} className="group relative min-w-0 rounded-2xl border bg-card p-2.5 cursor-pointer transition-colors hover:bg-secondary/50">
                    <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-xl">
                      <img src={albumImage} alt={albumTitle} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <div className="absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                        <AlbumOptionsMenu album={album} buttonClassName="grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur-md hover:bg-black hover:scale-105 shadow-md border border-white/10 transition-all" />
                      </div>
                    </div>
                    <p className="truncate text-sm font-semibold">{albumTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{album.artist}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Saved albums will appear here.</p>
          )}
        </section>
      </div>
    </main>
  );
};

export default LibraryPage;
