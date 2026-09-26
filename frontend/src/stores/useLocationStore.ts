import { create } from "zustand";
import { toast } from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { createLocationFilter, distanceMeters, type Fix } from "@/lib/geo";

export type LocationVisibility = "everyone" | "friends";
export type LocationPermission = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

interface LocationStore {
  /** Your smoothed position, while anything is watching it. */
  fix: Fix | null;
  isSharing: boolean;
  isLocating: boolean;
  visibility: LocationVisibility;
  permission: LocationPermission;
  /** Keeps GPS running for `holder` (e.g. the open map) until `unwatch`. */
  watch: (holder: string) => void;
  unwatch: (holder: string) => void;
  checkPermission: () => Promise<void>;
  /** Resolves with your position as soon as there is one, or null. */
  locate: () => Promise<Fix | null>;
  startSharing: () => void;
  stopSharing: () => Promise<void>;
  setVisibility: (visibility: LocationVisibility) => Promise<void>;
  /** After sign-in: load the saved preference and resume sharing if it was on. */
  syncPreference: () => Promise<void>;
  /** After sign-out: stop locally (the server can't be reached without a token). */
  signOut: () => void;
}

// A moving phone reports often; send when it has moved enough to matter.
const SEND_MIN_INTERVAL_MS = 5_000;
const SEND_MIN_DISTANCE_M = 15;
// A still phone may report nothing for minutes. Checking in every minute keeps
// its pin live for others (the server treats 3 minutes of silence as closed).
const HEARTBEAT_MS = 60_000;
const LOCATE_TIMEOUT_MS = 15_000;

const hasGeolocation = () => typeof navigator !== "undefined" && "geolocation" in navigator;

const filter = createLocationFilter();
const holders = new Set<string>();
const waiters = new Set<(fix: Fix | null) => void>();
let watchId: number | null = null;
let heartbeat: number | null = null;
let lastSent: { fix: Fix; at: number } | null = null;
let sending = false;

const toFix = ({ coords, timestamp }: GeolocationPosition): Fix => ({
  lat: coords.latitude,
  lng: coords.longitude,
  accuracy: coords.accuracy,
  heading: Number.isFinite(coords.heading) ? coords.heading : null,
  speed: Number.isFinite(coords.speed) ? coords.speed : null,
  timestamp,
});

const settleWaiters = (fix: Fix | null) => {
  waiters.forEach((resolve) => resolve(fix));
  waiters.clear();
};

const stopWatch = () => {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
};

const release = (holder: string) => {
  holders.delete(holder);
  if (!holders.size) stopWatch();
};

const stopHeartbeat = () => {
  if (heartbeat !== null) window.clearInterval(heartbeat);
  heartbeat = null;
};

const send = async (force = false) => {
  const { fix, isSharing, visibility } = useLocationStore.getState();
  if (!isSharing || !fix || sending) return;
  const now = Date.now();
  if (!force && lastSent) {
    const heartbeatDue = now - lastSent.at >= HEARTBEAT_MS - 5_000;
    const tooSoon = now - lastSent.at < SEND_MIN_INTERVAL_MS;
    const barelyMoved = distanceMeters(lastSent.fix, fix) < Math.max(SEND_MIN_DISTANCE_M, fix.accuracy / 2);
    if (!heartbeatDue && (tooSoon || barelyMoved)) return;
  }
  sending = true;
  try {
    await axiosInstance.put("/locations/me", {
      latitude: fix.lat,
      longitude: fix.lng,
      accuracy: Math.round(fix.accuracy),
      sharingEnabled: true,
      visibility,
    });
    lastSent = { fix, at: now };
  } catch {
    /* Retried on the next position or heartbeat. */
  } finally {
    sending = false;
  }
};

const onPosition = (position: GeolocationPosition) => {
  const fix = filter.push(toFix(position));
  if (!fix) return;
  useLocationStore.setState({ fix, permission: "granted" });
  settleWaiters(fix);
  void send();
};

const onError = (error: GeolocationPositionError) => {
  // Timeouts and "position unavailable" are temporary; the watch keeps trying.
  if (error.code !== error.PERMISSION_DENIED) return;
  holders.clear();
  stopWatch();
  settleWaiters(null);
  const { isSharing } = useLocationStore.getState();
  useLocationStore.setState({ permission: "denied", isLocating: false });
  if (isSharing) {
    void useLocationStore.getState().stopSharing();
    toast.error("Allow location access to share your live location.");
  }
};

const ensureWatch = () => {
  if (watchId !== null || !hasGeolocation()) return;
  watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 2_000 });
};

const queryPermission = async (): Promise<LocationPermission> => {
  if (!hasGeolocation()) return "unsupported";
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    status.onchange = () => useLocationStore.setState({ permission: status.state });
    return status.state;
  } catch {
    return "unknown";
  }
};

export const useLocationStore = create<LocationStore>((set, get) => ({
  fix: null,
  isSharing: false,
  isLocating: false,
  visibility: "everyone",
  permission: hasGeolocation() ? "unknown" : "unsupported",

  watch: (holder) => {
    holders.add(holder);
    ensureWatch();
  },
  unwatch: release,
  checkPermission: async () => set({ permission: await queryPermission() }),

  locate: async () => {
    if (!hasGeolocation()) {
      toast.error("Location is not supported by this browser.");
      return null;
    }
    const { fix } = get();
    const wasWatching = watchId !== null;
    const locateHolder = `locate-${Date.now()}`;
    holders.add(locateHolder);
    ensureWatch();
    // Keep GPS on a little longer so the first rough fix can sharpen.
    window.setTimeout(() => release(locateHolder), 30_000);
    // A running watch only reports when the position changes, so its last
    // fix is current even if it's old.
    if (fix && (wasWatching || Date.now() - fix.timestamp < 10_000)) return fix;

    set({ isLocating: true });
    // Ask for a fresh reading too: a new watch can take a while to report.
    navigator.geolocation.getCurrentPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATE_TIMEOUT_MS });
    const found = await new Promise<Fix | null>((resolve) => {
      const timer = window.setTimeout(() => {
        waiters.delete(done);
        resolve(null);
      }, LOCATE_TIMEOUT_MS);
      const done = (next: Fix | null) => {
        window.clearTimeout(timer);
        resolve(next);
      };
      waiters.add(done);
    });
    set({ isLocating: false });
    if (!found) {
      toast.error(get().permission === "denied" ? "Allow location access to show where you are." : "Couldn't find your location. Try again outside or near a window.");
    }
    return found;
  },

  startSharing: () => {
    if (!hasGeolocation()) {
      toast.error("Location is not supported by this browser.");
      return;
    }
    if (get().isSharing) return;
    lastSent = null;
    set({ isSharing: true });
    holders.add("share");
    ensureWatch();
    stopHeartbeat();
    heartbeat = window.setInterval(() => void send(), 20_000);
    void send(true);
  },

  stopSharing: async () => {
    set({ isSharing: false });
    lastSent = null;
    stopHeartbeat();
    release("share");
    try {
      await axiosInstance.delete("/locations/me");
    } catch {
      toast.error("Could not turn off location sharing. Please try again.");
    }
  },

  setVisibility: async (visibility) => {
    const previous = get().visibility;
    set({ visibility });
    try {
      await axiosInstance.patch("/locations/me/visibility", { visibility });
    } catch {
      set({ visibility: previous });
      toast.error("Could not update location visibility. Please try again.");
    }
  },

  syncPreference: async () => {
    try {
      const [{ data }, permission] = await Promise.all([
        axiosInstance.get<{ sharingEnabled: boolean; visibility: LocationVisibility }>("/locations/me"),
        queryPermission(),
      ]);
      set({ visibility: data.visibility === "friends" ? "friends" : "everyone", permission });
      if (!data.sharingEnabled || get().isSharing) return;
      // Sharing survives closing the app, but it can only resume without a
      // prompt. Otherwise turn it off so others don't see a frozen pin as live.
      if (permission === "granted") get().startSharing();
      else await axiosInstance.delete("/locations/me").catch(() => undefined);
    } catch {
      /* The map still works before a preference has been saved. */
    }
  },

  signOut: () => {
    lastSent = null;
    stopHeartbeat();
    release("share");
    set({ isSharing: false, visibility: "everyone" });
  },
}));
