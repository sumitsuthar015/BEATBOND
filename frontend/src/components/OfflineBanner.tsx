import { useAuth } from "@clerk/clerk-react";
import { Download, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Tells listeners when they're offline (downloads still play) and, if the app
 * was opened offline, offers a reload once the connection returns so sign-in
 * and live features can load.
 */
const OfflineBanner = () => {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [wasOffline, setWasOffline] = useState(() => !navigator.onLine);
  const { isLoaded } = useAuth();

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => {
      setOnline(false);
      setWasOffline(true);
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!online) {
    return (
      <div role="status" className="relative z-20 mx-2 mt-2 flex items-center gap-3 rounded-xl px-4 py-2 border border-amber-500/30 bg-amber-500/15 text-sm">
        <WifiOff className="size-4 shrink-0 text-amber-500" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">You're offline.</span>{" "}
          <span className="text-muted-foreground">Your downloaded songs still play.</span>
        </p>
        <Link to="/downloads" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400">
          <Download className="size-3.5" aria-hidden />
          Downloads
        </Link>
      </div>
    );
  }

  // Opened offline, sign-in never loaded; a reload brings everything back.
  if (wasOffline && !isLoaded) {
    return (
      <div role="status" className="relative z-20 mx-2 mt-2 flex items-center gap-3 rounded-xl px-4 py-2 border border-emerald-500/30 bg-emerald-500/15 text-sm">
        <p className="min-w-0 flex-1">
          <span className="font-semibold">You're back online.</span>{" "}
          <span className="text-muted-foreground">Reload to sign in and see everything again.</span>
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-black hover:bg-emerald-400"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Reload
        </button>
      </div>
    );
  }

  return null;
};

export default OfflineBanner;
