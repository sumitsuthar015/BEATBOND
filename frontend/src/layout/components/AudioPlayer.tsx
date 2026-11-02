import { usePlayerStore } from "@/stores/usePlayerStore";
import { getOfflineAudioUrl, isDownloaded } from "@/lib/offlineDownloads";
import { orderStreams } from "@/lib/streamQuality";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";

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
  const podcastPlaybackSpeed = usePreferencesStore((state) => state.podcastPlaybackSpeed);
  const resumeAppliedFor = useRef<string | null>(null);
  const storyClipEndedFor = useRef<string | null>(null);
  const sleepTimerEndsAt = usePreferencesStore((state) => state.sleepTimerEndsAt);
  const setSleepTimer = usePreferencesStore((state) => state.setSleepTimer);
  const setSleepTimerAtTrackEnd = usePreferencesStore((state) => state.setSleepTimerAtTrackEnd);

  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    const remaining = sleepTimerEndsAt - Date.now();
    if (remaining <= 0) {
      setIsPlaying(false);
      setSleepTimer(null);
      toast("Sleep timer ended");
      return;
    }
    const timer = window.setTimeout(() => {
      setIsPlaying(false);
      setSleepTimer(null);
      toast("Sleep timer ended");
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [sleepTimerEndsAt, setIsPlaying, setSleepTimer]);

  const handleEnded = () => {
    const song = usePlayerStore.getState().currentSong;
    if (song?.podcastEpisodeId) {
      const total = usePlayerStore.getState().duration || song.duration || 0;
      void axiosInstance.put(`/v1/podcasts/episodes/${song.podcastEpisodeId}/progress`, { positionSeconds: total, completed: true }).catch(() => undefined);
    }
    if (usePreferencesStore.getState().sleepTimerAtTrackEnd) {
      setIsPlaying(false);
      setSleepTimerAtTrackEnd(false);
      toast("Sleep timer ended after this song");
      return;
    }
    void handleTrackEnded();
  };
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
    // Streaming quality is read as a song starts, so changing it in settings
    // never interrupts the song that is playing; it applies from the next one.
    const network = orderStreams([currentSong.audioUrl, ...(currentSong.audioFallbackUrls || [])], usePreferencesStore.getState().streamQuality);
    return [offlineUrl, ...network]
      .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
  }, [currentSong, offlineUrl]);
  const source = waitingForSavedCopy ? null : sources[sourceIndex] || null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = currentSong?.podcastEpisodeId ? podcastPlaybackSpeed : 1;
  }, [currentSong?.podcastEpisodeId, podcastPlaybackSpeed]);

  useEffect(() => {
    const episodeId = currentSong?.podcastEpisodeId;
    if (!episodeId) return;
    const saveProgress = (position: number, completed = false) => {
      if (!Number.isFinite(position) || position < 0) return;
      void axiosInstance.put(`/v1/podcasts/episodes/${episodeId}/progress`, { positionSeconds: position, completed }).catch(() => undefined);
    };
    const interval = window.setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.currentSong?.podcastEpisodeId === episodeId && state.isPlaying) {
        const total = state.duration || state.currentSong.duration || 0;
        saveProgress(state.progress, total > 0 && state.progress / total >= 0.95);
      }
    }, 10_000);
    const saveOnPageHide = () => {
      const state = usePlayerStore.getState();
      if (state.currentSong?.podcastEpisodeId === episodeId) saveProgress(state.progress);
    };
    window.addEventListener("pagehide", saveOnPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", saveOnPageHide);
      const state = usePlayerStore.getState();
      if (state.currentSong?.podcastEpisodeId === episodeId) saveProgress(state.progress);
    };
  }, [currentSong?.podcastEpisodeId]);

  useEffect(() => {
    const episodeId = currentSong?.podcastEpisodeId;
    if (!episodeId || isPlaying) return;
    const state = usePlayerStore.getState();
    if (state.currentSong?.podcastEpisodeId === episodeId) {
      void axiosInstance.put(`/v1/podcasts/episodes/${episodeId}/progress`, { positionSeconds: state.progress }).catch(() => undefined);
    }
  }, [currentSong?.podcastEpisodeId, isPlaying]);

  // The audio element is the single owner of media state. Never swap a live
  // source for a cached blob: doing so resets playback on mobile browsers.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!source) { audio.pause(); return; }
    if (lastSource.current === source) return;
    lastSource.current = source;
    storyClipEndedFor.current = null;
    audio.currentTime = 0;
    audio.load();
  }, [source]);

  // A nonce is emitted only for an explicit new-track/repeat action. Toggling
  // play/pause deliberately does not touch currentTime.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!source) return;

    if (lastPlayNonce.current !== playNonce) {
      audio.currentTime = 0;
      lastPlayNonce.current = playNonce;
      storyClipEndedFor.current = null;
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
      // Keep the OS media notification/lock-screen transport in sync. This is
      // what lets supported mobile browsers treat background audio as active
      // media when the installed PWA is moved out of the foreground.
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      navigator.mediaSession.setActionHandler("play", () => usePlayerStore.getState().setIsPlaying(true));
      navigator.mediaSession.setActionHandler("pause", () => usePlayerStore.getState().setIsPlaying(false));
      navigator.mediaSession.setActionHandler("nexttrack", () => void usePlayerStore.getState().playNext());
      navigator.mediaSession.setActionHandler("previoustrack", () => usePlayerStore.getState().playPrevious());
    } catch (error) {
      console.warn("Media Session is unavailable in this browser:", error);
    }
  }, [currentSong, isPlaying]);

  return (
    <audio
      id="global-audio-player"
      ref={audioRef}
      src={source || undefined}
      preload="metadata"
      playsInline
      onEnded={handleEnded}
      onTimeUpdate={(event) => {
        const audio = event.currentTarget;
        const song = usePlayerStore.getState().currentSong;
        if (song?.storyPostId && song.storyClipDurationSeconds) {
          const clipStart = Math.max(0, song.storyClipStartSeconds || 0);
          const clipEnd = clipStart + song.storyClipDurationSeconds;
          if (audio.currentTime < clipStart) audio.currentTime = clipStart;
          if (audio.currentTime >= clipEnd && storyClipEndedFor.current !== song.storyPostId) {
            storyClipEndedFor.current = song.storyPostId;
            audio.currentTime = clipEnd;
            setProgress(clipEnd);
            audio.pause();
            void handleTrackEnded();
            return;
          }
        }
        setProgress(audio.currentTime);
      }}
      onLoadedMetadata={(event) =>
        {
          const audio = event.currentTarget;
          setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
          const song = usePlayerStore.getState().currentSong;
          if (song?.storyPostId) {
            audio.currentTime = Math.max(0, song.storyClipStartSeconds || 0);
            storyClipEndedFor.current = null;
          } else if (song?.podcastEpisodeId && resumeAppliedFor.current !== trackKey) {
            const resumeAt = Math.max(0, song.podcastResumePosition || 0);
            if (resumeAt > 0 && (!Number.isFinite(audio.duration) || resumeAt < audio.duration)) audio.currentTime = resumeAt;
            resumeAppliedFor.current = trackKey;
          }
        }
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
