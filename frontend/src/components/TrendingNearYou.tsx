import { useQuery } from "@tanstack/react-query";
import { MapPin, Music2 } from "lucide-react";
import { Link } from "react-router-dom";
import { axiosInstance } from "@/lib/axios";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";

type Trend = Song & { listeners: number; plays: number };
type TrendResponse = { available: boolean; radiusKm: number; songs: Trend[] };

const TrendingNearYou = () => {
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const { data } = useQuery<TrendResponse>({ queryKey: ["trendingNearby"], queryFn: async () => (await axiosInstance.get("/locations/trending")).data, staleTime: 5 * 60_000, retry: 1 });
  if (!data?.available) return <section className="mb-6 rounded-2xl border border-border bg-card/60 p-4"><div className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 text-primary" /><div><h2 className="text-sm font-bold">Trending near you</h2><p className="mt-1 text-xs text-muted-foreground">Share your location on the <Link to="/map" className="font-semibold text-primary underline-offset-2 hover:underline">Friends Map</Link> to see popular songs nearby. Only listening activity visible under each friend’s privacy settings is counted.</p></div></div></section>;
  if (!data.songs.length) return null;
  return <section className="mb-6" aria-label="Trending near you"><div className="mb-3 flex items-center gap-2"><MapPin className="size-4 text-primary" /><h2 className="text-lg font-bold">Trending near you</h2><span className="text-xs text-muted-foreground">within {data.radiusKm} km</span></div><div className="grid gap-2 sm:grid-cols-2">{data.songs.slice(0, 6).map((song) => <button type="button" key={`${song._id}-${song.title}`} onClick={() => playAlbum([song], 0)} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-card/70 p-3 text-left transition-colors hover:bg-secondary/60"><img src={song.imageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{song.title}</span><span className="block truncate text-xs text-muted-foreground">{song.artist}</span></span><span className="shrink-0 text-right text-[10px] text-muted-foreground"><Music2 className="mx-auto mb-0.5 size-3 text-primary" />{song.listeners} listeners</span></button>)}</div></section>;
};
export default TrendingNearYou;
