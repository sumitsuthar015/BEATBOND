import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Loader2, Music2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBackButton } from "@/components/PageBackButton";
import { axiosInstance } from "@/lib/axios";
import { mapSaavnSong } from "@/lib/saavn";
import { usePlaylistStore } from "@/stores/usePlaylistStore";
import type { Song } from "@/types";

const AIPlaylistPage = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const createPlaylist = usePlaylistStore((state) => state.createPlaylist);
  const fetchPlaylists = usePlaylistStore((state) => state.fetchPlaylists);
  const [prompt, setPrompt] = useState("");
  const [consent, setConsent] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlistName, setPlaylistName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const generate = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true); setSongs([]);
    try {
      const { data } = await axiosInstance.post("/playlists/generate", { prompt, thirdPartyConsent: consent });
      const mapped = (data.songs as unknown[]).map((song) => mapSaavnSong(song)).filter((song): song is Song => Boolean(song));
      if (!mapped.length) throw new Error("No playable songs were returned. Try a more specific vibe.");
      setSongs(mapped); setPlaylistName(data.name); setDescription(data.description);
    } catch (cause: any) { setError(cause.response?.data?.message || cause.message || "Couldn't generate a playlist."); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!user || !songs.length) return;
    setSaving(true);
    try {
      const playlist = await createPlaylist(playlistName, description, songs[0]);
      if (!playlist) return;
      for (const song of songs.slice(1)) await axiosInstance.post(`/playlists/${playlist.id}/songs`, { song });
      await fetchPlaylists();
      toast.success("Your AI playlist is saved.");
      navigate(`/playlists/${playlist.id}`);
    } catch (cause: any) { toast.error(cause.response?.data?.message || "Playlist created, but some songs could not be added."); await fetchPlaylists(); }
    finally { setSaving(false); }
  };

  return <main className="h-full overflow-y-auto px-4 py-5 pb-24 sm:px-6"><div className="mx-auto max-w-3xl space-y-5"><PageBackButton /><header><p className="text-sm text-primary">Personalized by AI</p><h1 className="text-3xl font-bold">AI playlist generator</h1><p className="mt-1 text-sm text-muted-foreground">Describe a mood or moment. BeatBond picks playable songs from its music catalogue.</p></header>
    <form onSubmit={(event) => void generate(event)} className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6"><label htmlFor="playlist-vibe" className="text-sm font-semibold">What should it sound like?</label><Input id="playlist-vibe" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={300} minLength={8} required placeholder="Rainy evening drive, old Hindi songs…" /><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" /><span>I agree to send this prompt and a list of catalogue songs to Groq to select the playlist. <a href="/privacy" className="underline" target="_blank" rel="noreferrer">Privacy details</a></span></label><Button type="submit" disabled={!consent || prompt.trim().length < 8 || loading}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{loading ? "Finding your sound…" : "Generate playlist"}</Button></form>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {!!songs.length && <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6"><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Playlist name" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={100} /><Button onClick={() => void save()} disabled={!playlistName.trim() || saving}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Save playlist</Button></div><p className="text-sm text-muted-foreground">{description}</p><div className="divide-y">{songs.map((song, index) => <div key={`${song._id}-${index}`} className="flex items-center gap-3 py-2"><span className="w-5 text-xs text-muted-foreground">{index + 1}</span><img src={song.imageUrl} alt="" className="size-10 rounded object-cover" /><div className="min-w-0"><p className="truncate text-sm font-medium">{song.title}</p><p className="truncate text-xs text-muted-foreground">{song.artist}</p></div></div>)}</div></section>}
    {!songs.length && !loading && !error && <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground"><Music2 className="mx-auto mb-2 size-7" />Generated tracks will appear here for you to review.</div>}
  </div></main>;
};

export default AIPlaylistPage;
