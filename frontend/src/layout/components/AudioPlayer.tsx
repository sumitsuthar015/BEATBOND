import { usePlayerStore } from "@/stores/usePlayerStore";
import { getOfflineAudioUrl, isDownloaded } from "@/lib/offlineDownloads";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const AudioPlayer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPlayNonce = useRef(0);
  const lastSource = useRef<string | null>(null);
  const lastPrefetchSong = useRef<string | null>(null);
  const currentSong = usePlayerStore((state) => state.currentSong);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const progress = usePlayerStore((state) => state.progress);
  const duration = usePlayerStore((state) => state.duration);
  const playNonce = usePlayerStore((state) => state.playNonce);
  const handleTrackEnded = usePlayerStore((state) => state.handleTrackEnded);
  const autoQueueRelatedOrTrending = usePlayerStore((state) => state.autoQueueRelatedOrTrending);
  const setIsPlaying = usePlayerStore((state) => state.setIsPlaying);
  const setProgress = usePlayerStore((state) => state.setProgress);
  const setDuration = usePlayerStore((state) => state.setDuration);
  // Which fallback stream the current track is on. It is keyed to the track so
  // a new song always starts from its best stream in the very first render;
  // resetting it in an effect let the previous song's fallback index leak into
  // one render, which started a load that the reset then aborted.
  const trackKey = `${currentSong?._id ?? ""}:${playNonce}`;
  const [fallback, setFallback] = useState({ trackKey, index: 0 });
  const sourceIndex = fallback.trackKey === trackKey ? fallback.index : 0;

  // Downloaded songs play from the saved copy (so they work offline and save
  // data). This is decided once per track: downloading the song that is already
  // playing must not swap its source mid-song.
  const songId = currentSong?._id;
  const networkUrl = currentSong?.audioUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startsDownloaded = useMemo(() => isDownloaded(songId), [trackKey]);
  const [offline, setOffline] = useState<{ trackKey: string; url: string | null }>({ trackKey: "", url: null });
  useEffect(() => {
    if (!startsDownloaded || !songId) return;
    let cancelled = false;
    let created: string | null = null;
    void getOfflineAudioUrl({ _id: songId, audioUrl: networkUrl ?? "" }).then((url) => {
      created = url;
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      setOffline({ trackKey, url });
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [trackKey, startsDownloaded, songId, networkUrl]);
  const offlineUrl = startsDownloaded && offline.trackKey === trackKey ? offline.url : null;
  const waitingForSavedCopy = startsDownloaded && offline.trackKey !== trackKey;

  const sources = useMemo(() => {
    if (!currentSong?.audioUrl) return [];
    return [offlineUrl, currentSong.audioUrl, ...(currentSong.audioFallbackUrls || [])]
      .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
  }, [currentSong, offlineUrl]);
  const source = waitingForSavedCopy ? null : sources[sourceIndex] || null;

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
          // Only a blocked autoplay means "stopped". A stream that fails to
          // load (NotSupportedError) is retried by onError with the next
          // quality, and switching streams aborts the old attempt (AbortError);
          // treating those as a stop was why the next song never started.
          if (err?.name !== "NotAllowedError") return;
          console.warn("Playback blocked by the browser:", err);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, playNonce, source, setIsPlaying]);

  // Refill before the end (30% remaining) instead of waiting for `ended`.
  // A per-track guard prevents timeupdate from causing repeat API calls.
  useEffect(() => {
    if (!isPlaying || !currentSong) return;
    const state = usePlayerStore.getState();
    const remaining = state.queue.length - state.currentIndex - 1;
    const trackDuration = duration || currentSong.duration || 0;
    const nearEnd = trackDuration > 0 ? progress / trackDuration >= 0.7 : progress >= 30;
    if (remaining < 3 && nearEnd && lastPrefetchSong.current !== currentSong._id) {
      lastPrefetchSong.current = currentSong._id;
      void autoQueueRelatedOrTrending();
    }
  }, [autoQueueRelatedOrTrending, currentSong, duration, isPlaying, progress]);

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
          setFallback({ trackKey, index: sourceIndex + 1 });
          return;
        }
        // Offline, skipping ahead would just fail through the whole queue.
        if (!navigator.onLine) {
          toast.error("You're offline. Only downloaded songs can play right now.", { id: "offline-playback" });
          setIsPlaying(false);
          return;
        }
        if (usePlayerStore.getState().isPlaying && source) void handleTrackEnded();
      }}
    />
  );
};

export default AudioPlayer;
