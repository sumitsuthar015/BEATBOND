import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";
import { LocateFixed, Navigation, Search, Box, Radio, X, Users, MessageCircle, Music2, UserRound, Wifi } from "lucide-react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { axiosInstance } from "@/lib/axios";
import { useChatStore } from "@/stores/useChatStore";
import FriendRequestButton from "@/components/friends/FriendRequestButton";
import { avatarUrl, type AvatarConfig } from "@/lib/avatar";

type Coordinates = { lat: number; lng: number };
type NearbyPlace = Coordinates & { id: string; name: string; category: string };
type LiveLocation = {
  userId: string; latitude: number; longitude: number; updatedAt?: string; isLive: boolean; isFriend: boolean; isOnline?: boolean;
  avatar?: AvatarConfig | null;
  user?: { fullName?: string; username?: string; imageUrl?: string; currentActivity?: string | null };
};

const INDIA_CENTER: L.LatLngExpression = [20.5937, 78.9629];
const MIN_SHARE_INTERVAL_MS = 15_000;
const MIN_CONTEXT_INTERVAL_MS = 60_000;
const escapeHtml = (value = "") => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);

const markerIcon = (color: string, label: string) => L.divIcon({ className: "friend-map-marker", iconSize: [40, 40], iconAnchor: [20, 20], html: `<span class="friend-map-marker__dot" style="--marker-color:${color}">${label}</span>` });
// Only a saved/customized avatar replaces the normal profile photo. This
// keeps profile photos visible for users who have never created an avatar.
const mapAvatarUrl = (user: LiveLocation) => {
  const hasCustomAvatar = Boolean(user.avatar?.options && Object.keys(user.avatar.options).length > 0);
  const profileImage = typeof user.user?.imageUrl === "string" ? user.user.imageUrl.trim() : "";
  return hasCustomAvatar ? avatarUrl(user.avatar, user.userId) : profileImage || undefined;
};
const liveUserIcon = (user: LiveLocation) => {
  const name = user.user?.fullName || "Live user";
  const imageUrl = mapAvatarUrl(user);
  const initial = escapeHtml((name.trim()[0] || "L").toUpperCase());
  // The fallback keeps the marker clean even when a profile-image host rejects
  // a stale URL or an image request fails.
  const avatar = imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" /><b class="live-user-marker__fallback">${initial}</b>` : `<b>${initial}</b>`;
  return L.divIcon({ className: `live-user-marker ${user.isLive ? "is-live" : "is-last-location"}`, iconSize: [48, 48], iconAnchor: [24, 24], html: `<span class="live-user-marker__avatar ${user.isFriend ? "is-friend" : ""}">${avatar}<i></i></span>` });
};

const MapPage = () => {
  const { isSignedIn } = useUser();
  const navigate = useNavigate();
  const socket = useChatStore((state) => state.socket);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const placeMarkersRef = useRef<L.Marker[]>([]);
  const liveMarkersRef = useRef(new Map<string, L.Marker>());
  const watchRef = useRef<number | null>(null);
  const sharingRef = useRef(false);
  const hasReceivedLiveFixRef = useRef(false);
  const lastSharedRef = useRef<{ point: L.LatLng; at: number } | null>(null);
  const lastContextRef = useRef<{ point: L.LatLng; at: number } | null>(null);
  const [query, setQuery] = useState("");
  const [areaName, setAreaName] = useState("");
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([]);
  const [selectedUser, setSelectedUser] = useState<LiveLocation | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");

  const drawPlaces = useCallback((places: NearbyPlace[]) => {
    placeMarkersRef.current.forEach((marker) => marker.remove());
    placeMarkersRef.current = places.map((place) => L.marker([place.lat, place.lng], { icon: markerIcon("#2563eb", "•") }).bindPopup(`<strong>${escapeHtml(place.name)}</strong><br><span>${escapeHtml(place.category)}</span>`).addTo(mapRef.current!));
  }, []);
  const loadContext = useCallback(async (location: Coordinates) => {
    try { const { data } = await axiosInstance.get<{ areaName: string; places: NearbyPlace[] }>("/locations/context", { params: location }); const places = (data.places || []).slice(0, 12); setAreaName(data.areaName || ""); setNearbyPlaces(places); if (mapRef.current) drawPlaces(places); } catch { /* Map remains useful without reverse geocoding. */ }
  }, [drawPlaces]);
  const loadLiveLocations = useCallback(async () => {
    if (!isSignedIn) return setLiveLocations([]);
    try { const { data } = await axiosInstance.get<LiveLocation[]>("/locations/live"); setLiveLocations(data); } catch { setLiveLocations([]); }
  }, [isSignedIn]);
  const shareLocation = useCallback(async (location: Coordinates) => {
    if (!sharingRef.current) return;
    const point = L.latLng(location.lat, location.lng); const previous = lastSharedRef.current; const now = Date.now();
    if (previous && now - previous.at < MIN_SHARE_INTERVAL_MS && previous.point.distanceTo(point) < 30) return;
    lastSharedRef.current = { point, at: now };
    try { await axiosInstance.put("/locations/me", { latitude: location.lat, longitude: location.lng, sharingEnabled: true }); } catch { /* Retry on the next position update. */ }
  }, []);
  const showPosition = useCallback((position: GeolocationPosition, focus = true) => {
    const location = { lat: position.coords.latitude, lng: position.coords.longitude }; const map = mapRef.current; if (!map) return;
    const point = L.latLng(location.lat, location.lng);
    if (!userMarkerRef.current) userMarkerRef.current = L.marker(point, { icon: markerIcon("#ef4444", "You") }).addTo(map); else userMarkerRef.current.setLatLng(point);
    if (focus) map.flyTo(point, 16, { duration: 0.7 });
    const previousContext = lastContextRef.current;
    if (focus || !previousContext || point.distanceTo(previousContext.point) > 500 || Date.now() - previousContext.at > MIN_CONTEXT_INTERVAL_MS) { lastContextRef.current = { point, at: Date.now() }; void loadContext(location); }
    void shareLocation(location);
  }, [loadContext, shareLocation]);
  const startSharing = useCallback(() => {
    if (!navigator.geolocation) return toast.error("Location is not supported by this browser.");
    if (sharingRef.current || watchRef.current !== null) return;
    sharingRef.current = true; hasReceivedLiveFixRef.current = false; setIsSharing(true);
    watchRef.current = navigator.geolocation.watchPosition((position) => { const focus = !hasReceivedLiveFixRef.current; hasReceivedLiveFixRef.current = true; showPosition(position, focus); }, () => { sharingRef.current = false; setIsSharing(false); if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; toast.error("Allow location access to share your live location."); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 });
  }, [showPosition]);
  const stopSharing = useCallback(async () => {
    sharingRef.current = false; setIsSharing(false); hasReceivedLiveFixRef.current = false; lastSharedRef.current = null;
    if (watchRef.current !== null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    try { await axiosInstance.delete("/locations/me"); } catch { toast.error("Could not turn off location sharing. Please try again."); }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true, preferCanvas: true, zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true, inertia: true }).setView(INDIA_CENTER, 5);
    mapRef.current = map; L.control.zoom({ position: "bottomright" }).addTo(map);
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, keepBuffer: 1, updateWhenIdle: true, attribution: "© OpenStreetMap contributors" }).addTo(map);
    let tilesLoaded = false; const tileTimeout = window.setTimeout(() => { if (!tilesLoaded) setMapStatus("error"); }, 15_000);
    tiles.once("load", () => { tilesLoaded = true; window.clearTimeout(tileTimeout); map.invalidateSize(); setMapStatus("ready"); });
    const resizeMap = () => map.invalidateSize(); window.addEventListener("resize", resizeMap); requestAnimationFrame(resizeMap);
    navigator.geolocation?.getCurrentPosition((position) => showPosition(position, false), () => undefined, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 });
    return () => { window.removeEventListener("resize", resizeMap); window.clearTimeout(tileTimeout); if (watchRef.current !== null) navigator.geolocation?.clearWatch(watchRef.current); map.remove(); mapRef.current = null; };
  }, [showPosition]);
  useEffect(() => { void loadLiveLocations(); const refresh = window.setInterval(() => void loadLiveLocations(), 20_000); return () => window.clearInterval(refresh); }, [loadLiveLocations]);
  useEffect(() => {
    const onFriendLocation = () => void loadLiveLocations(); socket.on("friend_location_updated", onFriendLocation); return () => { socket.off("friend_location_updated", onFriendLocation); };
  }, [socket, loadLiveLocations]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const activeIds = new Set(liveLocations.map((person) => person.userId));
    liveMarkersRef.current.forEach((marker, userId) => { if (!activeIds.has(userId)) { marker.remove(); liveMarkersRef.current.delete(userId); } });
    liveLocations.forEach((person) => {
      const point: L.LatLngExpression = [person.latitude, person.longitude]; const existing = liveMarkersRef.current.get(person.userId);
      if (existing) existing.setLatLng(point).setIcon(liveUserIcon(person));
      else liveMarkersRef.current.set(person.userId, L.marker(point, { icon: liveUserIcon(person), keyboard: true, title: person.user?.fullName || "Live user" }).on("click", () => setSelectedUser(person)).addTo(map));
    });
  }, [liveLocations]);

  const locateMe = () => { if (!navigator.geolocation) return toast.error("Location is not supported by this browser."); setIsLocating(true); navigator.geolocation.getCurrentPosition((position) => { showPosition(position, true); setIsLocating(false); }, () => { setIsLocating(false); toast.error("Allow location access to show your area on the map."); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 }); };
  const search = async (event: FormEvent) => { event.preventDefault(); const term = query.trim(); if (!term) return; setIsSearching(true); try { const { data } = await axiosInstance.get<{ lat: number; lng: number }>("/locations/search", { params: { q: term } }); mapRef.current?.flyTo([data.lat, data.lng], 16, { duration: 0.7 }); setQuery(""); } catch { toast.error("No matching place found."); } finally { setIsSearching(false); } };

  return <main className="friend-map isolate relative h-full min-h-[320px] overflow-hidden bg-zinc-950">
    <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Interactive live listeners map" />
    {mapStatus !== "ready" && <div className="absolute inset-0 z-20 grid place-items-center bg-zinc-950/80 p-6 text-center text-white backdrop-blur-sm"><div className="max-w-sm rounded-3xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl"><Box className="mx-auto mb-3 size-9 text-primary" /><h1 className="font-bold">{mapStatus === "loading" ? "Loading map…" : "Map connection failed"}</h1><p className="mt-2 text-sm text-zinc-400">{mapStatus === "loading" ? "Preparing streets and live listeners." : "Check your internet connection, then refresh this page."}</p></div></div>}
    <form onSubmit={search} className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 sm:left-6 sm:right-auto sm:w-[min(440px,calc(100%-3rem))]"><div className="relative"><Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a place…" className="h-12 rounded-2xl border-white/10 bg-zinc-950/85 pl-12 pr-12 text-white shadow-xl backdrop-blur-xl" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"><X className="size-5" /></button>}</div></form>
    <div className="map-action-controls absolute right-4 top-[calc(env(safe-area-inset-top)+4.5rem)] z-10 flex flex-col gap-2"><Button type="button" onClick={locateMe} disabled={isSearching || isLocating} className="h-10 gap-2 rounded-full bg-zinc-950/90 px-4 text-white shadow-xl backdrop-blur hover:bg-zinc-800"><LocateFixed className={`size-4 ${isLocating ? "animate-pulse" : ""}`} />{isLocating ? "Locating…" : "Locate me"}</Button><Button type="button" onClick={() => isSharing ? void stopSharing() : startSharing()} className={`h-10 gap-2 rounded-full px-4 shadow-xl ${isSharing ? "bg-rose-500 hover:bg-rose-600" : "bg-zinc-950/90 text-white hover:bg-zinc-800"}`} aria-pressed={isSharing}><Radio className={`size-4 ${isSharing ? "animate-pulse" : ""}`} />Location: {isSharing ? "On" : "Off"}</Button></div>
    <section className="absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-white/10 bg-zinc-950/85 p-4 text-white shadow-2xl backdrop-blur-xl sm:left-6 sm:right-auto sm:w-96"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-primary/20 text-primary"><Navigation className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate font-semibold">{areaName || "Live listeners map"}</p><p className="truncate text-xs text-zinc-400">{liveLocations.length ? `${liveLocations.filter((user) => user.isLive).length} live · ${liveLocations.filter((user) => !user.isLive).length} last locations` : "No saved locations yet"}</p></div><Users className="size-5 text-violet-300" /></div><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-zinc-400">{isSharing ? "Your location is visible on the live map" : "Share your location with BeatBond"}</p><Button type="button" size="sm" onClick={() => isSharing ? void stopSharing() : startSharing()} className={isSharing ? "bg-rose-500 hover:bg-rose-600" : ""}>{isSharing ? "Stop" : "Share live"}</Button></div>{nearbyPlaces.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{nearbyPlaces.slice(0, 5).map((place) => <button key={place.id} type="button" onClick={() => mapRef.current?.flyTo([place.lat, place.lng], 17, { duration: 0.7 })} className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20">{place.name}</button>)}</div>}</section>
    {selectedUser && <section className="absolute bottom-4 right-4 z-[1200] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-zinc-950/95 text-white shadow-2xl backdrop-blur-xl sm:bottom-6 sm:right-6"><button type="button" onClick={() => setSelectedUser(null)} aria-label="Close live user card" className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-black/45 text-zinc-300 hover:bg-white/15"><X className="size-4" /></button><div className="flex gap-3 p-4 pr-12"><div className="relative shrink-0"><div className="grid size-14 place-items-center overflow-hidden rounded-2xl bg-primary/20 text-lg font-bold text-primary">{mapAvatarUrl(selectedUser) ? <img src={mapAvatarUrl(selectedUser)} alt="" className="size-full object-cover" /> : (selectedUser.user?.fullName?.[0] || "L")}</div><span className={`absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-zinc-950 ${selectedUser.isLive ? "bg-emerald-500" : "bg-zinc-500"}`}><Wifi className="size-2.5" /></span></div><div className="min-w-0"><p className="truncate font-bold">{selectedUser.user?.fullName || "Live user"}</p><p className="truncate text-sm text-zinc-400">@{selectedUser.user?.username || "beatbond"}</p><p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${selectedUser.isLive ? "text-emerald-400" : "text-zinc-400"}`}><span className={`size-1.5 rounded-full ${selectedUser.isLive ? "animate-pulse bg-emerald-400" : "bg-zinc-500"}`} />{selectedUser.isLive ? "Live location shared" : "Last location shared"}</p></div></div><div className="border-y border-white/10 bg-white/[.035] px-4 py-3">{selectedUser.user?.currentActivity ? <p className="flex items-center gap-2 truncate text-sm text-violet-200"><Music2 className="size-4 shrink-0 text-violet-400" /><span className="truncate">Live listening: {selectedUser.user.currentActivity}</span></p> : <p className="text-sm text-zinc-400">{selectedUser.isLive ? "Live now on BeatBond" : "Location sharing is currently off"}</p>}</div><div className="flex flex-wrap gap-2 p-3"><Button size="sm" variant="outline" onClick={() => navigate(`/profile/${selectedUser.userId}`)} className="border-white/15 bg-white/5 hover:bg-white/10"><UserRound className="size-4" />View profile</Button>{selectedUser.isFriend ? <Button size="sm" onClick={() => navigate(`/chat?userId=${selectedUser.userId}`)}><MessageCircle className="size-4" />Chat</Button> : <FriendRequestButton userId={selectedUser.userId} />}</div></section>}
  </main>;
};
export default MapPage;
