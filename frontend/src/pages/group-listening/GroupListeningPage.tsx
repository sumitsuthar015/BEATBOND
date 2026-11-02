import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, Copy, Headphones, Loader2, Music2, Pause, Play, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroupSocket, estimateServerOffset, type GroupSocket } from "@/lib/groupListeningSocket";

type RoomMember = { id: string; name: string; joinedAt: number };
type RoomState = {
  code: string; hostId: string; members: RoomMember[]; trackUrl: string | null; title: string;
  duration: number; playing: boolean; position: number; positionUpdatedAt: number; serverTime: number;
};
type Ack = { ok?: boolean; error?: string; state?: RoomState };

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};
const positionAt = (state: RoomState, serverNow: number) =>
  Math.max(0, state.position + (state.playing ? (serverNow - state.positionUpdatedAt) / 1000 : 0));

const GroupListeningPage = () => {
  const { getToken, userId } = useAuth();
  const socketRef = useRef<GroupSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<string | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const recoveringRef = useRef(false);
  const roomCodeRef = useRef("");
  const nameRef = useRef("");
  const targetRef = useRef<number | null>(null);
  const [socket, setSocket] = useState<GroupSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [songUrl, setSongUrl] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const applyState = useCallback((next: RoomState) => {
    roomRef.current = next;
    setRoom(next);
    roomCodeRef.current = next.code;
    setSeekDraft(null);
  }, []);

  useEffect(() => {
    let disposed = false;
    let liveSocket: GroupSocket | null = null;
    const connect = async () => {
      if (!userId) { setBusy(false); setError("Sign in to use Group Listening."); return; }
      const token = await getToken();
      if (!token || disposed) { setBusy(false); setError("Sign in to use Group Listening."); return; }
      liveSocket = createGroupSocket(getToken);
      socketRef.current = liveSocket;
      setSocket(liveSocket);
      liveSocket.on("connect", () => {
        setConnected(true); setBusy(false); setError("");
        if (recoveringRef.current && roomCodeRef.current) {
          liveSocket?.emit("room:join", { code: roomCodeRef.current, name: nameRef.current }, (result: Ack) => {
            if (result.error) setError(result.error);
            else if (result.state) applyState(result.state);
          });
        }
        recoveringRef.current = true;
        void estimateServerOffset(liveSocket!).then((offset) => { if (!disposed) setServerOffset(offset); });
      });
      liveSocket.on("disconnect", () => setConnected(false));
      liveSocket.on("connect_error", (reason: Error) => { setBusy(false); setError(reason.message || "Could not connect to the group server."); });
      liveSocket.on("room:state", applyState);
      liveSocket.connect();
    };
    void connect().catch((cause) => { setBusy(false); setError(cause instanceof Error ? cause.message : "Could not connect."); });
    return () => {
      disposed = true;
      liveSocket?.removeAllListeners();
      liveSocket?.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [applyState, getToken, userId]);

  useEffect(() => {
    if (!socket || !connected) return;
    let cancelled = false;
    const calibrate = async () => {
      const offset = await estimateServerOffset(socket);
      if (!cancelled) setServerOffset(offset);
    };
    const timer = window.setInterval(() => void calibrate(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [connected, socket]);

  useEffect(() => {
    if (!room) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [room]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!room?.trackUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      sourceRef.current = null;
      return;
    }
    if (sourceRef.current !== room.trackUrl) {
      sourceRef.current = room.trackUrl;
      audio.src = room.trackUrl;
      audio.load();
    }
    const target = positionAt(room, Date.now() + serverOffset);
    targetRef.current = target;
    if (Number.isFinite(audio.duration) && audio.readyState >= 1) audio.currentTime = target;
    if (room.playing) {
      void audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    } else {
      audio.pause();
      setBlocked(false);
    }
  }, [room, serverOffset]);

  useEffect(() => () => audioRef.current?.pause(), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const applyPendingTarget = () => {
      if (targetRef.current !== null && Number.isFinite(audio.duration)) audio.currentTime = Math.min(targetRef.current, audio.duration);
    };
    audio.addEventListener("loadedmetadata", applyPendingTarget);
    return () => audio.removeEventListener("loadedmetadata", applyPendingTarget);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !room?.trackUrl) return;
    const timer = window.setInterval(() => {
      const state = roomRef.current;
      if (!state || !audio.readyState) return;
      const target = positionAt(state, Date.now() + serverOffset);
      if (Math.abs(audio.currentTime - target) > 0.6) audio.currentTime = target;
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [room?.trackUrl, serverOffset]);

  const emit = (event: string, payload: Record<string, unknown> = {}) => {
    setError("");
    socketRef.current?.emit(event, payload, (result: Ack) => {
      if (result.error) setError(result.error);
      if (result.state) applyState(result.state);
    });
  };
  const createRoom = () => { nameRef.current = name.trim(); emit("room:create", { name: name.trim() }); };
  const joinRoom = () => { nameRef.current = name.trim(); emit("room:join", { name: name.trim(), code: codeInput.trim().toUpperCase() }); };
  const leaveRoom = () => {
    socketRef.current?.emit("room:leave"); roomCodeRef.current = ""; roomRef.current = null;
    setRoom(null); setBlocked(false); setError("");
  };
  const enableSound = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = roomRef.current ? positionAt(roomRef.current, Date.now() + serverOffset) : 0;
    audio.currentTime = target;
    void audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };
  const copyCode = async () => {
    if (!room) return;
    try { await navigator.clipboard.writeText(room.code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setError("Could not copy the room code. Select and copy it manually."); }
  };

  const host = Boolean(room && userId && room.hostId === userId);
  const currentPosition = room ? positionAt(room, now + serverOffset) : 0;
  const shownPosition = seekDraft ?? currentPosition;

  return (
    <main className="h-full min-h-0 overflow-y-auto px-4 pb-28 pt-4 sm:px-6 md:pb-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"><ArrowLeft className="size-4" /> Back to music</Link>
        <header className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Headphones className="size-5" /></div>
          <div><h1 className="text-2xl font-bold tracking-tight">Group Listening</h1><p className="text-sm text-muted-foreground">Share a room and listen in sync.</p></div>
        </header>
        {!room ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">Join your friends</h2><span className={`text-xs ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>{connected ? "Connected" : "Connecting…"}</span></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2"><Label htmlFor="group-name">Your name</Label><Input id="group-name" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name shown to the group" autoComplete="nickname" /></div>
                <Button className="w-full" disabled={!connected || !name.trim()} onClick={createRoom}><Users className="mr-2 size-4" /> Create group</Button>
              </div>
              <div className="space-y-4 rounded-xl border border-border/70 bg-background/50 p-4">
                <div className="space-y-2"><Label htmlFor="group-code">Group code</Label><Input id="group-code" maxLength={5} value={codeInput} onChange={(event) => setCodeInput(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ""))} placeholder="ABCDE" autoCapitalize="characters" /></div>
                <Button variant="outline" className="w-full" disabled={!connected || !name.trim() || codeInput.length !== 5} onClick={joinRoom}>Join group</Button>
              </div>
            </div>
            {busy && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Connecting to rooms…</p>}
            {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
          </section>
        ) : (
          <div className="space-y-5">
            <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Room code</p><div className="mt-1 flex items-center gap-2"><span className="font-mono text-3xl font-bold tracking-[0.22em]" aria-label={`Room code ${room.code}`}>{room.code}</span><Button variant="ghost" size="icon" aria-label="Copy room code" onClick={() => void copyCode()}><Copy className="size-4" /></Button><span className="text-xs text-muted-foreground" aria-live="polite">{copied ? "Copied" : ""}</span></div></div>
                <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-sm"><Users className="size-4 text-primary" /><span>{room.members.length} listening</span><span className={`size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} aria-label={connected ? "Connected" : "Reconnecting"} /></div>
              </div>
              <div className="mt-5 border-t border-border/70 pt-4"><h2 className="mb-3 text-sm font-semibold">Members</h2><ul className="flex flex-wrap gap-2">{room.members.map((member, index) => <li key={`${member.id}-${member.joinedAt}`} className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1.5 text-sm"><span className="grid size-6 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{member.name.slice(0, 1).toUpperCase()}</span>{member.name}{member.id === room.hostId && <span className="text-xs text-primary">Host</span>}{index === 0 && member.id === room.hostId ? <span className="sr-only">group host</span> : null}</li>)}</ul></div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
              <div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-xl bg-secondary text-muted-foreground"><Music2 className="size-5" /></div><div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">Now listening</p><h2 className="truncate text-lg font-semibold">{room.title || "No song loaded yet"}</h2></div></div>
              {room.trackUrl && <div className="mt-5">
                <div className="flex items-center gap-3"><span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{formatTime(shownPosition)}</span><input aria-label="Playback position" type="range" min={0} max={Math.max(1, room.duration || 1)} step={0.1} value={Math.min(shownPosition, room.duration || shownPosition)} disabled={!host || !room.duration} onChange={(event) => setSeekDraft(Number(event.target.value))} onPointerUp={(event) => { if (host) emit("host:seek", { position: Number(event.currentTarget.value) }); }} onKeyUp={(event) => { if (host) emit("host:seek", { position: Number(event.currentTarget.value) }); }} className="h-2 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed" /><span className="w-10 text-xs tabular-nums text-muted-foreground">{formatTime(room.duration)}</span></div>
                {host ? <div className="mt-4 flex items-center justify-center gap-3"><Button size="icon" className="size-12 rounded-full" aria-label={room.playing ? "Pause playback" : "Start playback"} onClick={() => emit(room.playing ? "host:pause" : "host:play")}>{room.playing ? <Pause className="size-5" /> : <Play className="size-5" />}</Button><span className="sr-only">Only you, as host, can control playback.</span></div> : <div className="mt-3 flex items-center justify-center gap-2"><Button size="icon" variant="outline" className="size-10 rounded-full" aria-label="Playback controls disabled for listeners" disabled><Play className="size-4" /></Button><p className="text-xs text-muted-foreground">The host controls playback.</p></div>}
                {blocked && <div className="mt-4 text-center"><Button variant="outline" onClick={enableSound}>Tap to enable sound</Button></div>}
              </div>}
              {host ? <form className="mt-6 grid gap-3 border-t border-border/70 pt-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); emit("host:load", { url: songUrl.trim(), title: songTitle.trim() }); }}><div className="space-y-2"><Label htmlFor="group-song-title">Song title</Label><Input id="group-song-title" maxLength={120} value={songTitle} onChange={(event) => setSongTitle(event.target.value)} placeholder="Song title" required /></div><div className="space-y-2"><Label htmlFor="group-song-url">Audio URL</Label><Input id="group-song-url" type="url" value={songUrl} onChange={(event) => setSongUrl(event.target.value)} placeholder="https://…" required /></div><Button type="submit" disabled={!songTitle.trim() || !songUrl.trim()}>Load song</Button></form> : <div className="mt-5 border-t border-border/70 pt-4"><p className="text-center text-sm text-muted-foreground">The host controls playback.</p></div>}
              {error && <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
            </section>
            {blocked && !room.trackUrl && <p className="text-sm text-muted-foreground">Tap to enable sound when a song is playing.</p>}
            <div className="flex justify-end"><Button variant="ghost" onClick={leaveRoom}>Leave group</Button></div>
          </div>
        )}
              <audio ref={audioRef} preload="metadata" onLoadedMetadata={(event) => { const audio = event.currentTarget; if (targetRef.current !== null) audio.currentTime = Math.min(targetRef.current, Number.isFinite(audio.duration) ? audio.duration : targetRef.current); const current = roomRef.current; if (current && userId === current.hostId && current.trackUrl && current.duration === 0 && Number.isFinite(audio.duration)) emit("host:load", { url: current.trackUrl, title: current.title, duration: audio.duration }); }} onEnded={() => { if (roomRef.current && userId === roomRef.current.hostId) emit("host:pause"); }} onTimeUpdate={() => setNow(Date.now())} onError={() => setError("This audio URL could not be played. Ask the host to load another song.")} />
      </div>
    </main>
  );
};

export default GroupListeningPage;
