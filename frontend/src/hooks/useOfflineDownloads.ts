import { getDownloadedSongs, type OfflineSong } from "@/lib/offlineDownloads";
import { useEffect, useState } from "react";

export const useOfflineDownloads = () => {
  const [downloads, setDownloads] = useState<OfflineSong[]>(getDownloadedSongs);
  useEffect(() => {
    const refresh = () => setDownloads(getDownloadedSongs());
    window.addEventListener("beatbond-downloads-changed", refresh);
    return () => window.removeEventListener("beatbond-downloads-changed", refresh);
  }, []);
  return downloads;
};
