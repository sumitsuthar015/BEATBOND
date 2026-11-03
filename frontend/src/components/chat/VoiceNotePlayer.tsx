import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatVoiceDuration } from "@/lib/voiceNotes";

type Props = { src: string; duration: number; isMine: boolean };

const VoiceNotePlayer = ({ src, duration, isMine }: Props) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [actualDuration, setActualDuration] = useState(duration || 0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onOtherPlay = (event: Event) => {
      if ((event as CustomEvent<HTMLAudioElement>).detail !== audio) audio.pause();
    };
    window.addEventListener("beatbond:voice-play", onOtherPlay);
    return () => window.removeEventListener("beatbond:voice-play", onOtherPlay);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
  }, [speed]);

  const play = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); return; }
    try {
      window.dispatchEvent(new CustomEvent("beatbond:voice-play", { detail: audio }));
      await audio.play();
    } catch {
      setFailed(true);
      setLoading(false);
    }
  };

  const retry = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setFailed(false);
    setLoading(true);
    audio.load();
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrent(value);
  };

  return (
    <div className={`my-1 flex w-[min(18rem,70vw)] items-center gap-2 rounded-xl px-2 py-2 ${isMine ? "bg-black/15" : "bg-background/60"}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => { setActualDuration(duration > 0 ? duration : Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); setLoading(false); }}
        onDurationChange={(event) => { if (!duration && Number.isFinite(event.currentTarget.duration)) setActualDuration(event.currentTarget.duration); }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onCanPlay={() => { setBuffering(false); setLoading(false); }}
        onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onError={() => { setFailed(true); setLoading(false); }}
      />
      {failed ? (
        <>
          <span className="min-w-0 flex-1 text-xs">Audio unavailable</span>
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={retry} aria-label="Retry loading voice note"><RotateCw className="size-4" /></Button>
        </>
      ) : (
        <>
          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={() => void play()} aria-label={playing ? "Pause voice note" : "Play voice note"}>
            {loading || buffering ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <div className="min-w-0 flex-1">
            <input
              aria-label="Seek voice note"
              aria-valuetext={`${formatVoiceDuration(current)} of ${formatVoiceDuration(actualDuration)}`}
              type="range"
              min={0}
              max={Math.max(0.1, actualDuration)}
              step={0.1}
              value={Math.min(current, actualDuration || 0)}
              onChange={(event) => seek(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer accent-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <div className="flex justify-between text-[10px] opacity-70"><span>{formatVoiceDuration(current)}</span><span>{formatVoiceDuration(actualDuration || duration)}</span></div>
          </div>
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="max-w-12 rounded bg-transparent text-[10px] focus-visible:outline focus-visible:outline-2"
          >
            {[0.5, 1, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
          </select>
        </>
      )}
    </div>
  );
};

export default VoiceNotePlayer;
