import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Headphones, Loader2, Music2, Sparkles } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { axiosInstance } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { SongListRow } from "@/components/SongListRow";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";

type BlendResult = { friend: { clerkId: string; fullName: string; imageUrl: string }; tasteMatch: number; sharedSongCount: number; playlist: Song[] };

const BlendPage = () => {
  const { friendId = "" } = useParams();
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const { data, isLoading, error } = useQuery<BlendResult>({ queryKey: ["blend", friendId], queryFn: async () => (await axiosInstance.get(`/friends/blend/${encodeURIComponent(friendId)}`)).data, enabled: Boolean(friendId) });

  return <main className="h-full overflow-y-auto px-4 pb-28 pt-4 sm:px-6 md:pb-8"><div className="mx-auto max-w-3xl"><Link to="/friends" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Friends</Link><header className="mb-5 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6"><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="size-6" /></div><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Blend playlist</p><h1 className="text-2xl font-bold">You + {data?.friend.fullName || "your friend"}</h1></div></div><p className="mt-3 text-sm text-muted-foreground">A shared playlist built from both listening histories, with a taste match score based on the songs you both play.</p>{data && <div className="mt-5 flex flex-wrap gap-3"><div className="rounded-xl border border-border bg-background/70 px-4 py-3"><p className="text-2xl font-bold text-primary">{data.tasteMatch}%</p><p className="text-xs text-muted-foreground">Taste match</p></div><div className="rounded-xl border border-border bg-background/70 px-4 py-3"><p className="text-2xl font-bold">{data.sharedSongCount}</p><p className="text-xs text-muted-foreground">Songs in common</p></div><Button className="ml-auto self-center" disabled={!data.playlist.length} onClick={() => playAlbum(data.playlist, 0)}><Headphones className="mr-2 size-4" />Play blend</Button></div>}</header>{isLoading ? <div className="flex justify-center p-8"><Loader2 className="size-6 animate-spin text-primary" /></div> : error ? <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{(error as any).response?.data?.message || "Could not create this blend."}</p> : data?.playlist.length ? <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Blend playlist">{data.playlist.map((song, index) => <SongListRow key={`${song._id}-${index}`} song={song} index={index} onPlay={() => playAlbum(data.playlist, index)} />)}</section> : <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Music2 className="mx-auto mb-3 size-8" />Listen to some songs together in the app to start your blend.</div>}</div></main>;
};
export default BlendPage;
