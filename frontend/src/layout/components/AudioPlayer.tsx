import { usePlayerStore } from "@/stores/usePlayerStore";
import { useEffect, useMemo, useRef, useState } from "react";

const AudioPlayer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPlayNonce = useRef(0);
  const lastSource = useRef<string | null>(null);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const playNonce = usePlayerStore((state) => state.playNonce);
  const handleTrackEnded = usePlayerStore((state) => state.handleTrackEnded);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => {
    if (!currentSong?.audioUrl) return [];
    return [currentSong.audioUrl, ...(currentSong.audioFallbackUrls || [])]
      .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
  }, [currentSong]);
  const source = sources[sourceIndex] || null;

  useEffect(() => {
    setSourceIndex(0);
  }, [currentSong?._id, playNonce]);

  // The audio element is the single owner of media state. Never swap a live
  // source for a cached blob: doing so resets playback on mobile browsers.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source || lastSource.current === source) return;
    lastSource.current = source;
    audio.currentTime = 0;
    audio.load();
  }, [source]);

  // A nonce is emitted only for an explicit new-track/repeat action. Toggling
  // play/pause deliberately does not touch currentTime.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;

    if (lastPlayNonce.current !== playNonce) {
      audio.currentTime = 0;
      lastPlayNonce.current = playNonce;
    }

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // If browser blocked play (e.g. autoplay restriction), retry play once user interacts or handle cleanly
          console.warn("Playback error:", err);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, playNonce, source, setIsPlaying]);

  useEffect(() => {
    // Some mobile WebViews expose mediaSession but not MediaMetadata or every
    // action handler. This enhancement must never take down the app shell.
    if (
      !currentSong ||
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator) ||
      typeof MediaMetadata === "undefined"
    ) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentSong.title,
        artist: currentSong.artist,
        album: currentSong.albumName || "BeatBond",
        artwork: currentSong.imageUrl
          ? [{ src: currentSong.imageUrl, sizes: "512x512", type: "image/jpeg" }]
          : [],
      });
      navigator.mediaSession.setActionHandler("play", () => usePlayerStore.getState().setIsPlaying(true));
      navigator.mediaSession.setActionHandler("pause", () => usePlayerStore.getState().setIsPlaying(false));
      navigator.mediaSession.setActionHandler("nexttrack", () => void usePlayerStore.getState().playNext());
      navigator.mediaSession.setActionHandler("previoustrack", () => usePlayerStore.getState().playPrevious());
    } catch (error) {
      console.warn("Media Session is unavailable in this browser:", error);
    }
  }, [currentSong]);

  return (
    <audio
      id="global-audio-player"
      ref={audioRef}
      src={source || undefined}
      preload="metadata"
      playsInline
      onEnded={handleTrackEnded}
      onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) =>
        setDuration(
          Number.isFinite(event.currentTarget.duration)
            ? event.currentTarget.duration
            : 0
        )
      }
      onError={() => {
        // Saavn/CDN URLs are short-lived and a particular quality can be
        // unavailable in a region. Try the supplied lower-quality stream
        // before reporting playback as stopped.
        if (sourceIndex + 1 < sources.length) {
          setSourceIndex((index) => index + 1);
          return;
        }
        if (usePlayerStore.getState().isPlaying && source) setIsPlaying(false);
      }}
    />
  );
};

export default AudioPlayer;
