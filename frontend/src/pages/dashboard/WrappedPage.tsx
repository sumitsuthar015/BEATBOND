import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Clock3, Disc3, Share2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { PageBackButton } from "@/components/PageBackButton";
import { Button } from "@/components/ui/button";
import { axiosInstance } from "@/lib/axios";

type Wrapped = { range: "month" | "year"; label: string; totalPlays: number; minutesListened: number; completedTracks: number; topSongs: { songId: string; title: string; artist: string; imageUrl: string; plays: number }[]; topArtists: { name: string; plays: number }[]; topGenres: { name: string; plays: number }[] };

const buildShareCard = async (data: Wrapped) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare your recap image.");
  const background = context.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, "#21113f"); background.addColorStop(0.55, "#13111b"); background.addColorStop(1, "#071a26");
  context.fillStyle = background; context.fillRect(0, 0, 1080, 1350);
  const glow = context.createRadialGradient(910, 130, 30, 910, 130, 540);
  glow.addColorStop(0, "rgba(178,102,255,.55)"); glow.addColorStop(1, "rgba(178,102,255,0)");
  context.fillStyle = glow; context.fillRect(0, 0, 1080, 760);
  context.fillStyle = "#d6b8ff"; context.font = "600 34px system-ui"; context.fillText(`BEATBOND  /  ${data.label.toUpperCase()}`, 84, 112);
  context.fillStyle = "#ffffff"; context.font = "900 102px system-ui"; context.fillText("Your sound.", 78, 270);
  context.font = "500 34px system-ui"; context.fillStyle = "#c8c4d4"; context.fillText("A snapshot of the music you played", 86, 328);
  const cards = [{ label: "MINUTES", value: data.minutesListened.toLocaleString() }, { label: "PLAYS", value: data.totalPlays.toLocaleString() }, { label: "FULL PLAYS", value: data.completedTracks.toLocaleString() }];
  cards.forEach((item, index) => {
    const x = 82 + index * 315;
    context.fillStyle = "rgba(255,255,255,.09)"; context.beginPath(); context.roundRect(x, 390, 286, 210, 28); context.fill();
    context.fillStyle = "#c8c4d4"; context.font = "700 22px system-ui"; context.fillText(item.label, x + 24, 438);
    context.fillStyle = "#ffffff"; context.font = "800 54px system-ui"; context.fillText(item.value.slice(0, 9), x + 24, 526);
  });
  context.fillStyle = "#d6b8ff"; context.font = "700 24px system-ui"; context.fillText("TOP ARTIST", 88, 704);
  context.fillStyle = "#ffffff"; context.font = "800 54px system-ui"; context.fillText((data.topArtists[0]?.name || "Still to be discovered").slice(0, 30), 84, 772);
  context.fillStyle = "#c8c4d4"; context.font = "500 28px system-ui";
  data.topGenres.slice(0, 3).forEach((genre, index) => context.fillText(`${index + 1}. ${genre.name.slice(0, 36)}  ·  ${genre.plays} plays`, 90, 856 + index * 48));
  context.fillStyle = "rgba(255,255,255,.12)"; context.fillRect(84, 1070, 912, 2);
  context.fillStyle = "#ffffff"; context.font = "700 28px system-ui"; context.fillText("Made with BeatBond", 86, 1130);
  context.fillStyle = "#a39caf"; context.font = "500 22px system-ui"; context.fillText("Your listening, your story.", 86, 1172);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export the recap image.")), "image/png"));
  return new File([blob], "beatbond-wrapped.png", { type: "image/png" });
};

const WrappedPage = () => {
  const [range, setRange] = useState<"month" | "year">("month");
  const { data, isLoading, isError } = useQuery<Wrapped>({ queryKey: ["wrapped", range], queryFn: async () => (await axiosInstance.get(`/users/wrapped?range=${range}`)).data });
  const share = async () => {
    if (!data) return;
    const text = `My BeatBond ${data.label}: ${data.minutesListened} minutes of music, ${data.totalPlays} plays, and my top artist was ${data.topArtists[0]?.name || "still to be discovered"}.`;
    try {
      const file = await buildShareCard(data);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "My BeatBond Wrapped", text, files: [file] });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a"); link.href = url; link.download = file.name; link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (navigator.share) await navigator.share({ title: "My BeatBond Wrapped", text });
        else { await navigator.clipboard.writeText(text); toast.success("Recap image downloaded and caption copied."); }
      }
    } catch (error) { if ((error as Error).name !== "AbortError") toast.error("Could not share your recap."); }
  };

  return <main className="h-full overflow-y-auto px-4 py-5 pb-24 sm:px-6"><div className="mx-auto max-w-4xl space-y-5"><PageBackButton /><header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-primary">Your listening story</p><h1 className="text-3xl font-bold">BeatBond Wrapped</h1></div><div className="flex gap-2" role="group" aria-label="Recap period"><Button variant={range === "month" ? "default" : "outline"} onClick={() => setRange("month")}>This month</Button><Button variant={range === "year" ? "default" : "outline"} onClick={() => setRange("year")}>This year</Button></div></header>
    {isLoading ? <div className="rounded-3xl border bg-card p-8 text-muted-foreground" role="status">Building your recap…</div> : isError ? <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-destructive">Your listening recap could not load.</div> : data ? <>
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/20 via-card to-fuchsia-500/10 p-6 sm:p-9" aria-label={`${data.label} listening recap`}><div className="absolute -right-12 -top-12 size-48 rounded-full bg-primary/10 blur-2xl" /><div className="relative"><p className="text-sm font-medium text-muted-foreground">{data.label}</p><h2 className="mt-1 text-4xl font-black tracking-tight sm:text-6xl">Your sound.</h2><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-background/70 p-4"><Clock3 className="mb-3 size-5 text-primary" /><p className="text-2xl font-bold">{data.minutesListened.toLocaleString()}</p><p className="text-xs text-muted-foreground">minutes listened</p></div><div className="rounded-2xl bg-background/70 p-4"><Disc3 className="mb-3 size-5 text-primary" /><p className="text-2xl font-bold">{data.totalPlays.toLocaleString()}</p><p className="text-xs text-muted-foreground">plays recorded</p></div><div className="col-span-2 rounded-2xl bg-background/70 p-4 sm:col-span-1"><CalendarRange className="mb-3 size-5 text-primary" /><p className="text-2xl font-bold">{data.completedTracks.toLocaleString()}</p><p className="text-xs text-muted-foreground">tracks played through</p></div></div><Button className="mt-5" onClick={() => void share()}><Share2 className="mr-2 size-4" />Share recap</Button></div></section>
      <div className="grid gap-4 md:grid-cols-3"><section className="rounded-2xl border bg-card p-4"><h3 className="mb-3 font-semibold">Top artists</h3>{data.topArtists.length ? data.topArtists.map((artist, index) => <p key={artist.name} className="flex justify-between gap-2 border-b py-2 text-sm last:border-0"><span className="truncate">{index + 1}. {artist.name}</span><span className="text-muted-foreground">{artist.plays}</span></p>) : <p className="text-sm text-muted-foreground">Keep listening to build your recap.</p>}</section><section className="rounded-2xl border bg-card p-4"><h3 className="mb-3 font-semibold">Top genres</h3>{data.topGenres.length ? data.topGenres.map((genre, index) => <p key={genre.name} className="flex justify-between gap-2 border-b py-2 text-sm last:border-0"><span className="truncate">{index + 1}. {genre.name}</span><span className="text-muted-foreground">{genre.plays}</span></p>) : <p className="text-sm text-muted-foreground">No genre data yet.</p>}</section><section className="rounded-2xl border bg-card p-4"><h3 className="mb-3 font-semibold">Most played</h3>{data.topSongs.length ? data.topSongs.map((song) => <div key={song.songId} className="flex items-center gap-2 border-b py-2 last:border-0"><img src={song.imageUrl || "/default-image.png"} alt="" className="size-9 rounded object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{song.title}</p><p className="truncate text-xs text-muted-foreground">{song.artist}</p></div><span className="text-xs text-muted-foreground">{song.plays}×</span></div>) : <p className="text-sm text-muted-foreground">No plays in this period yet.</p>}</section></div>
    </> : null}</div></main>;
};

export default WrappedPage;
