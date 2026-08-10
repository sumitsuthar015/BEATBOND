import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { LocateFixed, Navigation, Search, Box, Radio, X, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { axiosInstance } from "@/lib/axios";
import { useChatStore } from "@/stores/useChatStore";

type Coordinates = { lat: number; lng: number };
type NearbyPlace = Coordinates & { id: string; name: string; category: string };
type FriendLocation = {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt?: string;
  user?: { fullName?: string; imageUrl?: string; currentActivity?: string | null };
  isOnline?: boolean;
};

const INDIA_CENTER: L.LatLngExpression = [20.5937, 78.9629];
const MIN_SHARE_INTERVAL_MS = 15_000;
const MIN_CONTEXT_INTERVAL_MS = 60_000;

const markerIcon = (color: string, label: string) => L.divIcon({
  className: "friend-map-marker",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -22],
  html: `<span class="friend-map-marker__dot" style="--marker-color:${color}">${label}</span>`,
});

const escapeHtml = (value = "") => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);

const MapPage = () => {
  const { isSignedIn } = useUser();
  const socket = useChatStore((state) => state.socket);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const placeMarkersRef = useRef<L.Marker[]>([]);
  const friendMarkersRef = useRef(new Map<string, L.Marker>());
  const watchRef = useRef<number | null>(null);
  const sharingRef = useRef(false);
  const hasReceivedLiveFixRef = useRef(false);
  const lastSharedRef = useRef<{ point: L.LatLng; at: number } | null>(null);
  const lastContextRef = useRef<{ point: L.LatLng; at: number } | null>(null);
  const [query, setQuery] = useState("");
  const [areaName, setAreaName] = useState("");
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [friendLocations, setFriendLocations] = useState<FriendLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");

  const drawPlaces = useCallback((places: NearbyPlace[]) => {
    placeMarkersRef.current.forEach((marker) => marker.remove());
    placeMarkersRef.current = places.map((place) => L.marker([place.lat, place.lng], { icon: markerIcon("#2563eb", "•") })
      .bindPopup(`<strong>${escapeHtml(place.name)}</strong><br><span>${escapeHtml(place.category)}</span>`)
      .addTo(mapRef.current!));
  }, []);

  const loadContext = useCallback(async (location: Coordinates) => {
    try {
      const { data } = await axiosInstance.get<{ areaName: string; places: NearbyPlace[] }>("/locations/context", { params: location });
      const places = (data.places || []).slice(0, 12);
      setAreaName(data.areaName || "");
      setNearbyPlaces(places);
      if (mapRef.current) drawPlaces(places);
    } catch {
      // The map and live locations continue to work if reverse geocoding is unavailable.
    }
  }, [drawPlaces]);

  const loadFriendLocations = useCallback(async () => {
    if (!isSignedIn) {
      setFriendLocations([]);
      return;
    }
    try {
      const { data } = await axiosInstance.get<FriendLocation[]>("/locations/friends");
      setFriendLocations(data);
    } catch {
      setFriendLocations([]);
    }
  }, [isSignedIn]);

  const shareLocation = useCallback(async (location: Coordinates) => {
    if (!sharingRef.current) return;
    const point = L.latLng(location.lat, location.lng);
    const previous = lastSharedRef.current;
    const now = Date.now();
    if (previous && now - previous.at < MIN_SHARE_INTERVAL_MS && previous.point.distanceTo(point) < 30) return;
    lastSharedRef.current = { point, at: now };
    try {
      await axiosInstance.put("/locations/me", { latitude: location.lat, longitude: location.lng, sharingEnabled: true });
    } catch {
      // Keep the local map responsive; the next movement/retry will attempt again.
    }
  }, []);

  const showPosition = useCallback((position: GeolocationPosition, focus = true) => {
    const location = { lat: position.coords.latitude, lng: position.coords.longitude };
    const map = mapRef.current;
    if (!map) return;
    const point = L.latLng(location.lat, location.lng);
    if (!userMarkerRef.current) userMarkerRef.current = L.marker(point, { icon: markerIcon("#ef4444", "You") }).addTo(map);
    else userMarkerRef.current.setLatLng(point);
    if (focus) map.flyTo(point, 16, { duration: 0.7 });
    const previousContext = lastContextRef.current;
    if (focus || !previousContext || point.distanceTo(previousContext.point) > 500 || Date.now() - previousContext.at > MIN_CONTEXT_INTERVAL_MS) {
      lastContextRef.current = { point, at: Date.now() };
      void loadContext(location);
    }
    void shareLocation(location);
  }, [loadContext, shareLocation]);

  const startSharing = useCallback(() => {
    if (!navigator.geolocation) return toast.error("Location is not supported by this browser.");
    if (sharingRef.current || watchRef.current !== null) return;
    sharingRef.current = true;
    hasReceivedLiveFixRef.current = false;
    setIsSharing(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const focus = !hasReceivedLiveFixRef.current;
        hasReceivedLiveFixRef.current = true;
        showPosition(position, focus);
      },
      () => {
        sharingRef.current = false;
        setIsSharing(false);
        if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
        toast.error("Allow location access to share your live location.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  }, [showPosition]);

  const stopSharing = useCallback(async () => {
    sharingRef.current = false;
    setIsSharing(false);
    hasReceivedLiveFixRef.current = false;
    lastSharedRef.current = null;
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    try {
      await axiosInstance.delete("/locations/me");
    } catch {
      toast.error("Could not turn off location sharing. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      inertia: true,
      inertiaDeceleration: 2600,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
    }).setView(INDIA_CENTER, 5);
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, keepBuffer: 1, updateWhenIdle: true, attribution: "© OpenStreetMap contributors" }).addTo(map);
    let tilesLoaded = false;
    const tileTimeout = window.setTimeout(() => {
      if (!tilesLoaded) setMapStatus("error");
    }, 15_000);
    tiles.once("load", () => {
      tilesLoaded = true;
      window.clearTimeout(tileTimeout);
      map.invalidateSize();
      setMapStatus("ready");
    });
    const resizeMap = () => map.invalidateSize();
    window.addEventListener("resize", resizeMap);
    requestAnimationFrame(resizeMap);
    navigator.geolocation?.getCurrentPosition((position) => showPosition(position, false), () => undefined, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 });
    return () => {
      window.removeEventListener("resize", resizeMap);
      window.clearTimeout(tileTimeout);
      if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [showPosition]);

  useEffect(() => { void loadFriendLocations(); }, [loadFriendLocations]);

  useEffect(() => {
    const onFriendLocation = ({ userId, location }: { userId: string; location: FriendLocation | null }) => {
      setFriendLocations((current) => {
        if (!location) return current.filter((friend) => friend.userId !== userId);
        const existing = current.find((friend) => friend.userId === userId);
        const updated = { ...existing, ...location, userId };
        return existing ? current.map((friend) => friend.userId === userId ? updated : friend) : [...current, updated];
      });
    };
    socket.on("friend_location_updated", onFriendLocation);
    return () => { socket.off("friend_location_updated", onFriendLocation); };
  }, [socket]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activeIds = new Set(friendLocations.map((friend) => friend.userId));
    friendMarkersRef.current.forEach((marker, userId) => {
      if (!activeIds.has(userId)) { marker.remove(); friendMarkersRef.current.delete(userId); }
    });
    friendLocations.forEach((friend) => {
      const point: L.LatLngExpression = [friend.latitude, friend.longitude];
      const name = friend.user?.fullName || "Friend";
      const label = (name.trim()[0] || "F").toUpperCase();
      const popup = `<strong>${escapeHtml(name)}</strong><br><span>${friend.isOnline ? "Live now" : "Last shared location"}${friend.user?.currentActivity ? ` · ${escapeHtml(friend.user.currentActivity)}` : ""}</span>`;
      const existing = friendMarkersRef.current.get(friend.userId);
      if (existing) existing.setLatLng(point).bindPopup(popup);
      else friendMarkersRef.current.set(friend.userId, L.marker(point, { icon: markerIcon("#7c3aed", label) }).bindPopup(popup).addTo(map));
    });
  }, [friendLocations]);

  const locateMe = () => {
    if (!navigator.geolocation) return toast.error("Location is not supported by this browser.");
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { showPosition(position, true); setIsLocating(false); },
      () => { setIsLocating(false); toast.error("Allow location access to show your area on the map."); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 },
    );
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setIsSearching(true);
    try {
      const { data } = await axiosInstance.get<{ lat: number; lng: number }>("/locations/search", { params: { q: term } });
      mapRef.current?.flyTo([data.lat, data.lng], 16, { duration: 0.7 });
      setQuery("");
    } catch { toast.error("No matching place found."); }
    finally { setIsSearching(false); }
  };

  return <main className="friend-map isolate relative h-full min-h-[320px] overflow-hidden bg-zinc-950">
    <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Interactive friends map" />
    {mapStatus !== "ready" && <div className="absolute inset-0 z-20 grid place-items-center bg-zinc-950/80 p-6 text-center text-white backdrop-blur-sm"><div className="max-w-sm rounded-3xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl"><Box className="mx-auto mb-3 size-9 text-primary" /><h1 className="font-bold">{mapStatus === "loading" ? "Loading map…" : "Map connection failed"}</h1><p className="mt-2 text-sm text-zinc-400">{mapStatus === "loading" ? "Preparing streets and friend locations." : "Check your internet connection, then refresh this page."}</p></div></div>}
    <form onSubmit={search} className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 sm:left-6 sm:right-auto sm:w-[min(440px,calc(100%-3rem))]"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a place…" className="h-12 rounded-2xl border-white/10 bg-zinc-950/85 pl-12 pr-12 text-white shadow-xl backdrop-blur-xl" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"><X className="size-5" /></button>}</div></form>
    <div className="map-action-controls absolute right-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-10 flex flex-col gap-2">
      <Button type="button" onClick={locateMe} disabled={isSearching || isLocating} className="h-10 gap-2 rounded-full bg-zinc-950/90 px-4 text-white shadow-xl backdrop-blur hover:bg-zinc-800"><LocateFixed className={`size-4 ${isLocating ? "animate-pulse" : ""}`} />{isLocating ? "Locating…" : "Locate me"}</Button>
      <Button type="button" onClick={() => isSharing ? void stopSharing() : startSharing()} className={`h-10 gap-2 rounded-full px-4 shadow-xl ${isSharing ? "bg-rose-500 hover:bg-rose-600" : "bg-zinc-950/90 text-white hover:bg-zinc-800"}`} aria-pressed={isSharing}><Radio className={`size-4 ${isSharing ? "animate-pulse" : ""}`} />Location: {isSharing ? "On" : "Off"}</Button>
    </div>
    <section className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-white/10 bg-zinc-950/85 p-4 text-white shadow-2xl backdrop-blur-xl sm:left-6 sm:right-auto sm:w-96"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary/20 text-primary"><Navigation className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{areaName || "Friends map"}</p><p className="truncate text-xs text-zinc-400">{friendLocations.length ? `${friendLocations.length} friend${friendLocations.length === 1 ? "" : "s"} sharing location` : "No friends are sharing location yet"}</p></div><Users className="size-5 text-violet-300" /></div><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-zinc-400">{isSharing ? "Your live location is shared with friends" : "Share your live location with friends"}</p><Button type="button" size="sm" onClick={() => isSharing ? void stopSharing() : startSharing()} className={isSharing ? "bg-rose-500 hover:bg-rose-600" : ""}>{isSharing ? "Stop" : "Share live"}</Button></div>{nearbyPlaces.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{nearbyPlaces.slice(0, 5).map((place) => <button key={place.id} type="button" onClick={() => mapRef.current?.flyTo([place.lat, place.lng], 17, { duration: 0.7 })} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">{place.name}</button>)}</div>}</section>
  </main>;
};

export default MapPage;
