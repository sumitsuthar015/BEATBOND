import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { chooseVoiceMimeType, clampVoiceDuration, formatVoiceDuration } from "@/lib/voiceNotes";
import VoiceNotePlayer from "./VoiceNotePlayer";

type Phase = "idle" | "recording" | "paused" | "preview" | "uploading";
type Props = {
  showTrigger: boolean;
  maxDuration: number;
  onActiveChange: (active: boolean) => void;
  onDiscard: (clientMessageId: string) => void;
  onSend: (blob: Blob, duration: number, clientMessageId: string, signal: AbortSignal, onProgress: (progress: number) => void) => Promise<void>;
};

const newClientMessageId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const VoiceNoteRecorder = ({ showTrigger, maxDuration, onActiveChange, onDiscard, onSend }: Props) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [clientMessageId, setClientMessageId] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const cancelledRef = useRef(false);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef("");

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setBlob(null);
  };

  const reset = () => {
    clearPreview();
    releaseStream();
    recorderRef.current = null;
    chunksRef.current = [];
    elapsedRef.current = 0;
    setElapsed(0);
    setProgress(0);
    setError("");
    setClientMessageId("");
    setPhase("idle");
    onActiveChange(false);
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => {
      const total = elapsedRef.current + (Date.now() - startedAtRef.current) / 1000;
      setElapsed(total);
      if (total >= maxDuration && recorderRef.current?.state === "recording") {
        elapsedRef.current = maxDuration;
        recorderRef.current.stop();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase, maxDuration]);

  useEffect(() => { previewUrlRef.current = previewUrl; }, [previewUrl]);

  useEffect(() => () => {
    cancelledRef.current = true;
    uploadControllerRef.current?.abort();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = chooseVoiceMimeType(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      elapsedRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setClientMessageId(newClientMessageId());
      setError("");
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => { cancelledRef.current = true; setError("Recording stopped unexpectedly. Please try again."); releaseStream(); setPhase("idle"); onActiveChange(false); };
      recorder.onstop = () => {
        releaseStream();
        if (cancelledRef.current) return;
        const measured = clampVoiceDuration(elapsedRef.current, maxDuration);
        setElapsed(measured);
        if (measured < 0.3) {
          setError("Record at least 0.3 seconds of audio.");
          setPhase("idle");
          onActiveChange(false);
          return;
        }
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!recorded.size) {
          setError("No audio was captured. Check microphone access and try again.");
          setPhase("idle");
          onActiveChange(false);
          return;
        }
        setBlob(recorded);
        setPreviewUrl(URL.createObjectURL(recorded));
        setPhase("preview");
      };
      recorder.start(250);
      setPhase("recording");
      onActiveChange(true);
    } catch (cause) {
      const name = (cause as DOMException)?.name;
      const message = name === "NotFoundError" ? "No microphone was found on this device."
        : name === "NotAllowedError" || name === "SecurityError" ? "Allow microphone access to record a voice note."
          : "Could not start recording. Check your microphone and try again.";
      toast.error(message);
      releaseStream();
    }
  };

  const finish = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (recorder.state === "recording") elapsedRef.current += (Date.now() - startedAtRef.current) / 1000;
      recorder.stop();
    }
  };

  const pause = () => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    elapsedRef.current += (Date.now() - startedAtRef.current) / 1000;
    recorder.pause();
    setPhase("paused");
  };

  const resume = () => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "paused") return;
    startedAtRef.current = Date.now();
    recorder.resume();
    setPhase("recording");
  };

  const discard = () => {
    const discardedId = clientMessageId;
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    reset();
    if (discardedId) onDiscard(discardedId);
  };

  const send = async () => {
    if (!blob || !clientMessageId || phase === "uploading") return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setProgress(0);
    setError("");
    setPhase("uploading");
    try {
      await onSend(blob, elapsed, clientMessageId, controller.signal, setProgress);
      reset();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Audio could not be sent. Retry when your connection is available.");
      setPhase("preview");
    } finally {
      uploadControllerRef.current = null;
    }
  };

  if (phase === "idle") {
    return (
      <div className="relative flex shrink-0 flex-col">
        {showTrigger && <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 rounded-full" onClick={() => void start()} aria-label="Record voice message" title="Record voice message"><Mic className="size-5" /></Button>}
        {error && <span className="absolute -top-9 left-2 rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground" role="status">{error}</span>}
      </div>
    );
  }

  if (phase === "recording" || phase === "paused") {
    const bars = [22, 38, 55, 31, 67, 44, 76, 35, 59, 27, 70, 42, 62, 30, 52, 72, 38, 58, 24, 65];
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 px-1" aria-label={phase === "paused" ? "Recording paused" : "Recording voice message"}>
        <span className="shrink-0 font-mono text-xs tabular-nums" aria-live="off">{formatVoiceDuration(elapsed)}</span>
        <div className="flex h-7 min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden" aria-hidden="true">
          {bars.map((height, index) => <span key={index} className={`w-1 shrink-0 rounded-full bg-primary ${phase === "recording" ? "animate-pulse" : "opacity-40"}`} style={{ height: `${height}%`, animationDelay: `${index * 35}ms` }} />)}
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={phase === "paused" ? resume : pause} aria-label={phase === "paused" ? "Resume recording" : "Pause recording"}>{phase === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}</Button>
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={discard} aria-label="Discard recording"><Trash2 className="size-4" /></Button>
        <Button type="button" size="icon" className="size-9 shrink-0 rounded-full" onClick={finish} aria-label="Preview recording"><Square className="size-4 fill-current" /></Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
      {previewUrl && <VoiceNotePlayer src={previewUrl} duration={elapsed} isMine />}
      {phase === "uploading" ? (
        <>
          <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Uploading voice message" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={() => uploadControllerRef.current?.abort()} aria-label="Cancel upload"><Square className="size-4" /></Button>
          <Loader2 className="size-4 animate-spin" aria-label="Uploading" />
        </>
      ) : (
        <>
          <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-full" onClick={discard} aria-label="Discard voice message"><Trash2 className="size-4" /></Button>
          <Button type="button" size="icon" className="size-9 shrink-0 rounded-full" onClick={() => void send()} aria-label={error ? "Retry sending voice message" : "Send voice message"}><Send className="size-4" /></Button>
        </>
      )}
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  );
};

export default VoiceNoteRecorder;
