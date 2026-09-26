import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, Music2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { useMyProfile } from "@/hooks/useMyProfile";
import { axiosInstance } from "@/lib/axios";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";
import { profileMusicQueryKey } from "./profileQueries";

type ProfileMusicData = {
  visible: boolean;
  topArtists: { name: string; plays: number; imageUrl: string }[];
  recent: Song[];
};

type ProfileMusicProps = {
  userId: string;
  /** First name for the "keeps it private" message. */
  name: string;
  isOwnProfile?: boolean;
  /** Own profile pages already list recent songs elsewhere. */
  showRecent?: boolean;
};

const WHO_SEES = {
  none: "Only you can see your top artists and recently played songs.",
  friends: "Your friends can see your top artists and recently played songs.",
  everyone: "Everyone on BeatBond can see your top artists and recently played songs.",
};

/** Reminds you who can see this part of your profile. */
const OwnVisibility = () => {
  const { data } = useMyProfile();
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Eye className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{WHO_SEES[data?.historyPrivacy ?? "none"]}</span>
      <Link to="/settings" className="shrink-0 font-semibold text-primary">Change</Link>
    </p>
  );
};

/** Top artists and recently played songs, when the owner's privacy allows it. */
const ProfileMusic = ({ userId, name, isOwnProfile = false, showRecent = true }: ProfileMusicProps) => {
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const { data, isLoading } = useQuery<ProfileMusicData>({
    queryKey: profileMusicQueryKey(userId),
    queryFn: async () => (await axiosInstance.get(`/users/profile/${userId}/music`)).data,
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="h-28 animate-pulse rounded-2xl bg-white/[.04]" aria-label="Loading music taste" />;
  }
  if (!data) return null;
  if (!data.visible) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0" />
        {name} keeps their listening private.
      </div>
    );
  }
  if (!data.topArtists.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
        <Music2 className="size-4 shrink-0" />
        {isOwnProfile ? "Play some songs and your favourite artists will show up here." : `${name} hasn't played anything yet.`}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isOwnProfile && <OwnVisibility />}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Top artists</h2>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {data.topArtists.map((artist) => (
            <div key={artist.name} className="w-24 shrink-0 text-center">
              <div className="mx-auto size-20 overflow-hidden rounded-full bg-secondary shadow-lg shadow-black/30">
                {artist.imageUrl ? <img src={artist.imageUrl} alt="" className="size-full object-cover" /> : <Music2 className="m-auto mt-6 size-8 text-muted-foreground" />}
              </div>
              <p className="mt-2 truncate text-sm font-semibold">{artist.name}</p>
              <p className="text-xs text-muted-foreground">{artist.plays} {artist.plays === 1 ? "play" : "plays"}</p>
            </div>
          ))}
        </div>
      </section>

      {showRecent && data.recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Recently played</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.recent.slice(0, 6).map((song, index) => (
              <button
                key={song._id}
                type="button"
                onClick={() => playAlbum(data.recent, index)}
                className="flex items-center gap-3 rounded-xl bg-white/[.04] p-2 text-left transition-colors hover:bg-white/[.08]"
              >
                <img src={song.imageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{song.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{song.artist}</span>
                </span>
                <Play className="mr-2 size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProfileMusic;
