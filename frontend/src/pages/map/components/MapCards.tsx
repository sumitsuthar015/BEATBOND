import { useNavigate } from "react-router-dom";
import { MessageCircle, Radio, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import FriendRequestButton from "@/components/friends/FriendRequestButton";
import { distanceMeters, formatAgo, formatDistance } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useLocationStore, type LocationVisibility } from "@/stores/useLocationStore";
import { displayName, isLiveNow, nowPlaying, personImage, type LiveLocation } from "../mapTypes";

const card = "rounded-3xl border border-white/10 bg-zinc-950/90 p-4 text-white shadow-2xl backdrop-blur-xl";

export const ShareCard = ({ isSignedIn }: { isSignedIn: boolean }) => {
  const fix = useLocationStore((state) => state.fix);
  const isSharing = useLocationStore((state) => state.isSharing);
  const visibility = useLocationStore((state) => state.visibility);
  const permission = useLocationStore((state) => state.permission);
  const startSharing = useLocationStore((state) => state.startSharing);
  const stopSharing = useLocationStore((state) => state.stopSharing);
  const setVisibility = useLocationStore((state) => state.setVisibility);

  if (!isSignedIn) {
    return <div className={cn(card, "text-sm text-zinc-300")}>Sign in to share your location and see your friends on the map.</div>;
  }

  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", isSharing ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-zinc-300")}>
          <Radio className={cn("size-5", isSharing && "animate-pulse")} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Share live location</p>
          <p className="truncate text-xs text-zinc-400">
            {isSharing
              ? `${visibility === "friends" ? "Friends" : "Everyone"} can see you${fix ? ` · ±${formatDistance(fix.accuracy)}` : " · finding you…"}`
              : "Off. No one can see where you are."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isSharing}
          aria-label="Share live location"
          onClick={() => (isSharing ? void stopSharing() : startSharing())}
          className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", isSharing ? "bg-emerald-500" : "bg-zinc-700")}
        >
          <span className={cn("absolute left-0 top-1 size-5 rounded-full bg-white shadow transition-transform", isSharing ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>
      {isSharing && (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1 text-xs font-semibold" role="radiogroup" aria-label="Who can see your location">
          {(["everyone", "friends"] as LocationVisibility[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={visibility === option}
              onClick={() => visibility !== option && void setVisibility(option)}
              className={cn("rounded-lg py-1.5 transition-colors", visibility === option ? "bg-white/15 text-white" : "text-zinc-400 hover:text-white")}
            >
              {option === "everyone" ? "Everyone" : "Friends only"}
            </button>
          ))}
        </div>
      )}
      {permission === "denied" && (
        <p className="mt-2 text-xs text-amber-300">Location is blocked for BeatBond. Allow it in your browser or phone settings.</p>
      )}
    </div>
  );
};

type PersonCardProps = { person: LiveLocation; now: number; activity: string | null; onClose: () => void };

export const PersonCard = ({ person, now, activity, onClose }: PersonCardProps) => {
  const navigate = useNavigate();
  const fix = useLocationStore((state) => state.fix);
  const live = isLiveNow(person, now);
  const image = personImage(person);
  const track = nowPlaying(activity);
  const distance = fix ? formatDistance(distanceMeters(fix, { lat: person.latitude, lng: person.longitude })) : null;

  return (
    <div className={cn(card, "relative")}>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-white/5 text-zinc-300 hover:bg-white/15">
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-10">
        <span className="relative shrink-0">
          <span className={cn("grid size-12 place-items-center overflow-hidden rounded-full bg-violet-500/20 font-bold text-violet-200 ring-2", person.isFriend ? "ring-emerald-400/80" : "ring-violet-400/70", !live && "opacity-70 grayscale")}>
            {image ? <img src={image} alt="" className="size-full object-cover" /> : displayName(person)[0]?.toUpperCase()}
          </span>
          {live && <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-zinc-950 bg-emerald-400" aria-hidden />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold">{displayName(person)}</p>
          <p className={cn("truncate text-xs", live ? "text-emerald-400" : "text-zinc-400")}>
            {[live ? "Live now" : `Last seen ${formatAgo(person.updatedAt, now)}`, distance && `${distance} away`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {track && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-white/[.05] px-3 py-2 text-sm text-violet-200">
          <span className="map-eq shrink-0" aria-hidden><i /><i /><i /></span>
          <span className="min-w-0 truncate">{track}</span>
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/profile/${person.userId}`)} className="flex-1 border-white/15 bg-white/5 hover:bg-white/10">
          <UserRound className="size-4" />Profile
        </Button>
        {person.isFriend ? (
          <Button size="sm" className="flex-1" onClick={() => navigate(`/chat?userId=${person.userId}`)}>
            <MessageCircle className="size-4" />Chat
          </Button>
        ) : (
          <FriendRequestButton userId={person.userId} />
        )}
      </div>
    </div>
  );
};
