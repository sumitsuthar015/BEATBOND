import { useUser } from "@clerk/clerk-react";
import { Bell, ChevronRight, Palette, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { useMyProfile } from "@/hooks/useMyProfile";

const settings = [
  { icon: Sparkles, title: "Avatar studio", detail: "Create and update your avatar", to: "/avatar", tone: "bg-violet-500/15 text-violet-400" },
  { icon: UserRound, title: "Profile & account", detail: "Name, photo and public profile", to: "/me", tone: "bg-sky-500/15 text-sky-400" },
  { icon: Bell, title: "Notifications", detail: "Friend requests and activity updates", to: "/notifications", tone: "bg-amber-500/15 text-amber-400" },
  { icon: Palette, title: "Listening dashboard", detail: "Saved music and recent activity", to: "/dashboard", tone: "bg-emerald-500/15 text-emerald-400" },
];

const SettingsPage = () => {
  const { user } = useUser();
  const { data: profile } = useMyProfile();
  return <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] md:pb-8"><div className="mx-auto max-w-xl">
    <header className="mb-6"><p className="text-sm font-semibold text-primary">Account centre</p><h1 className="mt-1 text-3xl font-bold">Settings</h1><p className="mt-2 text-sm text-muted-foreground">Manage how your BeatBond profile looks and works.</p></header>
    <section className="mb-6 flex items-center gap-3 rounded-3xl border bg-card p-4"><Avatar className="size-14"><AvatarImage src={profile?.imageUrl || user?.imageUrl} /><AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate font-semibold">{profile?.fullName || user?.fullName || "Your account"}</p><p className="truncate text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p></div><EditProfileDialog /></section>
    <section className="overflow-hidden rounded-3xl border bg-card">{settings.map(({ icon: Icon, title, detail, to, tone }) => <Link key={to} to={to} className="flex min-h-[76px] items-center gap-3 border-b px-4 last:border-0 hover:bg-secondary/50"><span className={`grid size-10 place-items-center rounded-2xl ${tone}`}><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="block truncate text-sm text-muted-foreground">{detail}</span></span><ChevronRight className="size-5 text-muted-foreground" /></Link>)}</section>
    <section className="mt-6 rounded-3xl border border-primary/20 bg-primary/5 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Your privacy</h2><p className="mt-1 text-sm text-muted-foreground">Location sharing is always controlled from Friends map, so you choose when friends can see you.</p><Link to="/map" className="mt-3 inline-block text-sm font-semibold text-primary">Open Friends map</Link></div></div></section>
  </div></main>;
};

export default SettingsPage;
