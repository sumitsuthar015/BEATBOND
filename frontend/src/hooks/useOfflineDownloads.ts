import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { downloadSongForOffline, getDownloadedSongs, isDownloading, removeDownloadedSong, type OfflineSong } from "@/lib/offlineDownloads";
import type { Song } from "@/types";

/** Your downloaded songs, kept current as downloads start, finish or are removed. */
export const useOfflineDownloads = () => {
  const [downloads, setDownloads] = useState<OfflineSong[]>(getDownloadedSongs);
  // Also re-renders when a download starts or ends, so isDownloading() is fresh.
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setDownloads(getDownloadedSongs());
      setVersion((version) => version + 1);
    };
    window.addEventListener("beatbond-downloads-changed", refresh);
    return () => window.removeEventListener("beatbond-downloads-changed", refresh);
  }, []);
  return downloads;
};

/**
 * One song's download state for any button or menu: saved, saving, or not,
 * and a toggle that downloads it or removes the saved copy.
 */
export const useSongDownload = (song: Song | null | undefined) => {
  const downloads = useOfflineDownloads();
  const songId = song?._id;
  const downloaded = Boolean(songId) && downloads.some((item) => item._id === songId);
  const downloading = isDownloading(songId);

  const toggle = useCallback(async () => {
    if (!song || isDownloading(song._id)) return;
    if (downloaded) {
      await removeDownloadedSong(song);
      toast.success(`Removed "${song.title}" from downloads`);
      return;
    }
    if (!song.audioUrl) {
      toast.error("No audio file available for this song");
      return;
    }
    const toastId = `download-${song._id}`;
    toast.loading(`Downloading "${song.title}"…`, { id: toastId });
    try {
      await downloadSongForOffline(song);
      toast.success(`"${song.title}" is ready to play offline`, { id: toastId });
    } catch {
      toast.error("Couldn't download this song. Try again in a moment.", { id: toastId });
    }
  }, [song, downloaded]);

  return { downloaded, downloading, toggle };
};
