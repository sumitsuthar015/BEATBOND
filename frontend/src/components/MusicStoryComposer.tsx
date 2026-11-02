import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pause, Play } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Song } from "@/types";

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const MusicStoryComposer = ({ song, open, onOpenChange, onCreated }: { song: Song | null; open: boolean; onOpenChange: (open: boolean) => void; onCreated?: () => void }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const queryClient = useQueryClient();
  const [audioDuration, setAudioDuration] = useState(0);
  const [clipDuration, setClipDuration] = useState(15);
  const [clipStart, setClipStart] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClipStart(0);
    setIsPreviewing(false);
    setAudioDuration(0);
  }, [song?._id, open]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPreviewing) return;
    if (audio.currentTime >= clipStart + clipDuration) {
      audio.pause();
      audio.currentTime = clipStart;
      setIsPreviewing(false);
    }
  }, [clipDuration, clipStart, isPreviewing]);

  const togglePreview = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPreviewing) { audio.pause(); setIsPreviewing(false); return; }
    audio.currentTime = clipStart;
    try { await audio.play(); setIsPreviewing(true); }
    catch { toast.error("Could not preview this song."); }
  };

  const shareStory = async () => {
    if (!song || !audioDuration || clipStart + clipDuration > audioDuration) return;
    setSaving(true);
    try {
      await axiosInstance.post("/posts/stories", { song, clipStartSeconds: clipStart, clipDurationSeconds: clipDuration });
      await queryClient.invalidateQueries({ queryKey: ["musicStories"] });
      onCreated?.();
      onOpenChange(false);
      toast.success("Your song clip is live in your story for 24 hours.");
    } catch (error: any) { toast.error(error.response?.data?.message || "Could not share this song clip."); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) { audioRef.current?.pause(); setIsPreviewing(false); } onOpenChange(nextOpen); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
      <DialogHeader><DialogTitle>Choose a song section</DialogTitle><DialogDescription>Select a 10–15 second clip to share in your story.</DialogDescription></DialogHeader>
      {song && <div className="space-y-4">
        <div className="flex items-center gap-3"><img src={song.imageUrl} alt="" className="size-12 rounded-lg object-cover" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{song.title}</p><p className="truncate text-xs text-muted-foreground">{song.artist}</p></div></div>
        <audio ref={audioRef} src={song.audioUrl || undefined} preload="metadata" onLoadedMetadata={(event) => { const length = event.currentTarget.duration; setAudioDuration(Number.isFinite(length) ? length : 0); }} onTimeUpdate={() => { const audio = audioRef.current; if (audio && audio.currentTime >= clipStart + clipDuration && isPreviewing) { audio.pause(); audio.currentTime = clipStart; setIsPreviewing(false); } }} onEnded={() => setIsPreviewing(false)} />
        <div className="flex items-center gap-3"><Button type="button" size="icon" variant="outline" aria-label={isPreviewing ? "Pause clip preview" : "Preview selected clip"} disabled={!audioDuration || clipStart + clipDuration > audioDuration} onClick={() => void togglePreview()}>{isPreviewing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button><div className="min-w-0 flex-1"><label htmlFor="story-clip-start" className="mb-1 block text-sm font-medium">Clip starts at {formatTime(clipStart)}</label><input id="story-clip-start" type="range" min={0} max={Math.max(0, audioDuration - clipDuration)} step={0.5} value={Math.min(clipStart, Math.max(0, audioDuration - clipDuration))} onChange={(event) => { audioRef.current?.pause(); setIsPreviewing(false); setClipStart(Number(event.target.value)); }} disabled={!audioDuration} className="w-full accent-primary" /></div></div>
        <div className="flex items-center justify-between gap-3"><label htmlFor="story-clip-duration" className="text-sm font-medium">Clip length</label><select id="story-clip-duration" value={clipDuration} onChange={(event) => { const nextDuration = Number(event.target.value); setClipDuration(nextDuration); setClipStart((start) => Math.min(start, Math.max(0, audioDuration - nextDuration))); }} className="rounded-md border border-input bg-background px-3 py-2 text-sm"><option value={10}>10 seconds</option><option value={12}>12 seconds</option><option value={15}>15 seconds</option></select></div>
        {audioDuration > 0 && clipDuration > audioDuration && <p role="alert" className="text-sm text-destructive">This song is shorter than the selected clip.</p>}
        <Button type="button" className="w-full" disabled={saving || !audioDuration || clipStart + clipDuration > audioDuration} onClick={() => void shareStory()}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Share {clipDuration}s clip to story</Button>
      </div>}
    </DialogContent>
  </Dialog>;
};
