import { CalendarDays, Link2, MapPin } from "lucide-react";

type ProfileDetailsProps = { location?: string; website?: string; joinedDate?: string };

const hostOf = (website: string) => {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website;
  }
};

/** Location, website and join date, each shown only when it is set. */
const ProfileDetails = ({ location, website, joinedDate }: ProfileDetailsProps) => {
  const joined = joinedDate ? new Date(joinedDate).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
  if (!location && !website && !joined) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {location && <span className="flex items-center gap-1.5"><MapPin className="size-4" />{location}</span>}
      {website && (
        <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-primary hover:underline">
          <Link2 className="size-4" />{hostOf(website)}
        </a>
      )}
      {joined && <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />Joined {joined}</span>}
    </div>
  );
};

export default ProfileDetails;
