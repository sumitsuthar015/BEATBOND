import { useState, type ReactNode } from "react";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
  Bell, CheckCheck, ChevronRight, CircleDot, Cookie, Download, Eye, EyeOff, FileText, Gauge, History, KeyRound, LayoutDashboard, ListMusic, LogOut, Mail, MapPin, Palette,
  Radio, Repeat, Sparkles, UserX, type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { BlockedUsersDialog } from "@/components/profile/BlockedUsersDialog";
import { HiddenListenersDialog } from "@/components/profile/HiddenListenersDialog";
import { PageBackButton } from "@/components/PageBackButton";
import { profileMusicQueryKey, useBlockedUsers, useHiddenListeners } from "@/components/profile/profileQueries";
import { useMyProfile, type ChatSettings, type MusicPrivacy } from "@/hooks/useMyProfile";
import { axiosInstance } from "@/lib/axios";
import { clearLocalListeningHistory } from "@/lib/listeningHistory";
import { getDownloadedSongs } from "@/lib/offlineDownloads";
import { clearSignals } from "@/lib/recommendations";
import { STREAM_QUALITIES, type StreamQuality } from "@/lib/streamQuality";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/theme-provider";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useLocationStore } from "@/stores/useLocationStore";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { PushNotificationSetting } from "@/components/notifications/PushNotificationSetting";
import { removeAllDownloads } from "@/lib/offlineDownloads";

const rowClass = "flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left";
const rowLinkClass = cn(rowClass, "transition-colors hover:bg-secondary/50");

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mb-6">
    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
    <div className="divide-y overflow-hidden rounded-3xl border bg-card">{children}</div>
  </section>
);

type RowBodyProps = { icon: LucideIcon; tone: string; title: string; detail?: ReactNode; end?: ReactNode; chevron?: boolean };

const RowBody = ({ icon: Icon, tone, title, detail, end, chevron }: RowBodyProps) => (
  <>
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", tone)}><Icon className="size-5" /></span>
    <span className="min-w-0 flex-1">
      <span className="block font-semibold">{title}</span>
      {detail && <span className="block text-sm text-muted-foreground">{detail}</span>}
    </span>
    {end}
    {chevron && <ChevronRight className="size-5 shrink-0 text-muted-foreground" />}
  </>
);

const LinkRow = ({ to, ...body }: RowBodyProps & { to: string }) => (
  <Link to={to} className={rowLinkClass}><RowBody chevron {...body} /></Link>
);

const Segmented = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
  <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-secondary/70 p-1 text-sm font-semibold" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={value === option.value}
        onClick={() => value !== option.value && onChange(option.value)}
        className={cn("rounded-lg px-2 py-2 transition-colors", value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/** A setting with a few choices, shown under its title. */
const ChoiceRow = <T extends string>({ icon, tone, title, detail, ...choice }: Omit<RowBodyProps, "end" | "chevron"> & { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) => (
  <div className="space-y-3 px-4 py-4">
    <div className="flex items-center gap-3"><RowBody icon={icon} tone={tone} title={title} detail={detail} /></div>
    <Segmented {...choice} />
  </div>
);

const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}
  >
    {/* In the dark theme the "on" track is near-white, so the knob flips dark. */}
    <span className={cn("absolute left-0 top-1 size-5 rounded-full shadow transition-transform", checked ? "translate-x-6 bg-primary-foreground" : "translate-x-1 bg-white")} />
  </button>
);

type PrivacyOption = { value: MusicPrivacy; label: string; detail: string };

const NOW_PLAYING_PRIVACY: PrivacyOption[] = [
  { value: "everyone", label: "Everyone", detail: "Anyone on BeatBond can see the song you're playing." },
  { value: "friends", label: "Friends", detail: "Your friends can see the song you're playing." },
  { value: "none", label: "Only me", detail: "No one sees the song you're playing." },
];

const HISTORY_PRIVACY: PrivacyOption[] = [
  { value: "everyone", label: "Everyone", detail: "Anyone on BeatBond can see these on your profile." },
  { value: "friends", label: "Friends", detail: "Your friends can see these on your profile." },
  { value: "none", label: "Only me", detail: "Only you can see these on your profile." },
];

const THEMES = [
  { value: "dark" as const, label: "Dark" },
  { value: "light" as const, label: "Light" },
  { value: "system" as const, label: "System" },
];

const SettingsPage = () => {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { data: blocked = [] } = useBlockedUsers(Boolean(user));
  const { data: hiddenFrom = [] } = useHiddenListeners(Boolean(user));
  // The top bar's admin button is desktop-only, so admins reach the dashboard from here on mobile.
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const { theme, setTheme } = useTheme();
  const streamQuality = usePreferencesStore((state) => state.streamQuality);
  const setStreamQuality = usePreferencesStore((state) => state.setStreamQuality);
  const autoplay = usePreferencesStore((state) => state.autoplay);
  const setAutoplay = usePreferencesStore((state) => state.setAutoplay);
  const isSharing = useLocationStore((state) => state.isSharing);
  const locationVisibility = useLocationStore((state) => state.visibility);
  const stopSharing = useLocationStore((state) => state.stopSharing);
  const [downloads] = useState(() => getDownloadedSongs().length);
  const [deletingAccount, setDeletingAccount] = useState(false);

  if (!user) {
    return (
      <main className="grid h-full place-items-center p-6 text-center">
        <div><h1 className="text-xl font-bold">Sign in to change your settings</h1><p className="mt-2 text-sm text-muted-foreground">Your profile, privacy and playback choices live here.</p></div>
      </main>
    );
  }

  const musicPrivacy = profile?.musicPrivacy ?? "friends";
  const historyPrivacy = profile?.historyPrivacy ?? "none";
  const changePrivacy = async (setting: "musicPrivacy" | "historyPrivacy", value: MusicPrivacy) => {
    const key = ["myProfile", user.id];
    const previous = setting === "musicPrivacy" ? musicPrivacy : historyPrivacy;
    queryClient.setQueryData(key, (current: object | undefined) => current && { ...current, [setting]: value });
    try {
      await axiosInstance.patch("/users/privacy", { [setting]: value });
      if (setting === "musicPrivacy") useChatStore.setState({ musicPrivacy: value });
      void queryClient.invalidateQueries({ queryKey: ["profileMusic"] });
    } catch {
      queryClient.setQueryData(key, (current: object | undefined) => current && { ...current, [setting]: previous });
      toast.error("Could not update your privacy. Please try again.");
    }
  };

  const chatSettings: ChatSettings = profile?.chatSettings ?? { readReceipts: true, showActivityStatus: true };
  const changeChatSetting = async (setting: keyof ChatSettings, value: boolean) => {
    const key = ["myProfile", user.id];
    const withValue = (next: boolean) => (current: { chatSettings?: ChatSettings } | undefined) => current && { ...current, chatSettings: { ...chatSettings, [setting]: next } };
    queryClient.setQueryData(key, withValue(value));
    try {
      await axiosInstance.patch("/users/chat-settings", { [setting]: value });
    } catch {
      queryClient.setQueryData(key, withValue(!value));
      toast.error("Could not update your chat settings. Please try again.");
    }
  };

  const changeEmailOptIn = async (value: boolean) => {
    const key = ["myProfile", user.id];
    queryClient.setQueryData(key, (current: object | undefined) => current && { ...current, emailMarketingOptIn: value });
    try {
      await axiosInstance.patch("/users/email-preferences", { emailMarketingOptIn: value });
      toast.success(value ? "Email updates enabled" : "You are unsubscribed from optional email updates");
    } catch {
      queryClient.setQueryData(key, (current: object | undefined) => current && { ...current, emailMarketingOptIn: !value });
      toast.error("Could not update your email preference. Please try again.");
    }
  };

  const clearHistory = async () => {
    try {
      await axiosInstance.delete("/users/listening-history");
      clearLocalListeningHistory(user.id);
      clearSignals(user.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["myListeningHistory"] }),
        queryClient.invalidateQueries({ queryKey: profileMusicQueryKey(user.id) }),
      ]);
      toast.success("Listening history cleared");
    } catch {
      toast.error("Could not clear your history. Please try again.");
    }
  };

  const quality = STREAM_QUALITIES.find((option) => option.value === streamQuality) ?? STREAM_QUALITIES[0];

  const deleteAccount = async () => {
    setDeletingAccount(true);
    try {
      await axiosInstance.delete("/users/account");
      clearLocalListeningHistory(user.id);
      clearSignals(user.id);
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("beatbond:listening-history:") || key.startsWith("beatbond:playback-signals:") || key.startsWith("beatbond:nickname:")) localStorage.removeItem(key);
      }
      localStorage.removeItem("beatbond:active-listener");
      localStorage.removeItem("beatbond:recent-searches");
      localStorage.removeItem("beatbond-map-view");
      localStorage.removeItem("beatbond:ai-provider-consent:v1");
      sessionStorage.removeItem("beatbond:legal-consent");
      await removeAllDownloads().catch(() => undefined);
      queryClient.clear();
      await signOut({ redirectUrl: "/" });
    } catch {
      toast.error("Account deletion could not be completed. Please contact support@beatbond.app.");
      setDeletingAccount(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] md:pb-8">
      <div className="mx-auto max-w-xl">
        <PageBackButton />
        <header className="mb-6"><h1 className="text-3xl font-bold">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Your profile, privacy and how BeatBond plays.</p></header>

        <section className="mb-6 rounded-3xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-14"><AvatarImage src={profile ? profile.imageUrl : user.imageUrl} alt={profile?.fullName || user.fullName || "Your profile photo"} /><AvatarFallback>{user.firstName?.[0] || "U"}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{profile?.fullName || user.fullName || "Your account"}</p>
              <p className="truncate text-sm text-muted-foreground">{profile?.username ? `@${profile.username}` : user.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <EditProfileDialog trigger={<Button variant="outline" className="w-full">Edit profile</Button>} />
            <Button variant="outline" asChild className="w-full"><Link to="/profile">View profile</Link></Button>
          </div>
        </section>

        {isAdmin && (
          <Section title="Admin">
            <LinkRow to="/admin" icon={LayoutDashboard} tone="bg-[#B266FF]/15 text-[#B266FF]" title="Admin dashboard" detail="Songs, users and comments" />
          </Section>
        )}

        <Section title="Account">
          <button type="button" onClick={() => openUserProfile()} className={rowLinkClass}>
            <RowBody chevron icon={KeyRound} tone="bg-sky-500/15 text-sky-500" title="Sign-in & security" detail={user.primaryEmailAddress?.emailAddress ?? "Email, password and connected accounts"} />
          </button>
          <LinkRow to="/avatar" icon={Sparkles} tone="bg-violet-500/15 text-violet-500" title="Avatar studio" detail="Create and update your avatar" />
        </Section>

        <Section title="Privacy">
          <ChoiceRow
            icon={Radio}
            tone="bg-[#B266FF]/15 text-[#B266FF]"
            title="Listening now"
            detail={NOW_PLAYING_PRIVACY.find((option) => option.value === musicPrivacy)?.detail}
            label="Who can see the song you're playing"
            value={musicPrivacy}
            options={NOW_PLAYING_PRIVACY}
            onChange={(value) => void changePrivacy("musicPrivacy", value)}
          />
          <ChoiceRow
            icon={Eye}
            tone="bg-violet-500/15 text-violet-500"
            title="Top artists & recently played"
            detail={HISTORY_PRIVACY.find((option) => option.value === historyPrivacy)?.detail}
            label="Who can see your top artists and recently played songs"
            value={historyPrivacy}
            options={HISTORY_PRIVACY}
            onChange={(value) => void changePrivacy("historyPrivacy", value)}
          />
          <HiddenListenersDialog
            trigger={(
              <button type="button" className={rowLinkClass}>
                <RowBody
                  chevron
                  icon={EyeOff}
                  tone="bg-rose-500/15 text-rose-500"
                  title="Hide my listening from…"
                  detail={hiddenFrom.length ? `Hidden from ${hiddenFrom.length} ${hiddenFrom.length === 1 ? "person" : "people"}` : "Pick friends who never see any of it"}
                />
              </button>
            )}
          />
          {isSharing ? (
            <div className={rowClass}>
              <RowBody
                icon={MapPin}
                tone="bg-rose-500/15 text-rose-500"
                title="Live location"
                detail={`Sharing with ${locationVisibility === "friends" ? "friends" : "everyone"}`}
                end={<Button size="sm" variant="outline" onClick={() => void stopSharing()}>Stop</Button>}
              />
            </div>
          ) : (
            <LinkRow to="/map" icon={MapPin} tone="bg-rose-500/15 text-rose-500" title="Live location" detail="Not sharing. Turn it on from the map." />
          )}
          <BlockedUsersDialog
            trigger={(
              <button type="button" className={rowLinkClass}>
                <RowBody chevron icon={UserX} tone="bg-zinc-500/15 text-zinc-500" title="Blocked people" detail={blocked.length ? `${blocked.length} blocked` : "No one blocked"} />
              </button>
            )}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className={rowLinkClass}>
                <RowBody icon={History} tone="bg-amber-500/15 text-amber-500" title="Clear listening history" detail="Recently played, top artists and recommendation history" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear your listening history?</AlertDialogTitle>
                <AlertDialogDescription>Your recently played songs and top artists will be removed, and recommendations will start fresh. Your playlists, liked songs and downloads stay.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void clearHistory()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Clear history</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        <Section title="Chats">
          <PushNotificationSetting />
          <div className={rowClass}>
            <RowBody
              icon={CheckCheck}
              tone="bg-sky-500/15 text-sky-500"
              title="Read receipts"
              detail="When off, friends won't see when you've read their messages, and you won't see theirs."
              end={<Switch checked={chatSettings.readReceipts} onChange={(value) => void changeChatSetting("readReceipts", value)} label="Read receipts" />}
            />
          </div>
          <div className={rowClass}>
            <RowBody
              icon={CircleDot}
              tone="bg-[#B266FF]/15 text-[#B266FF]"
              title="Show when I'm online"
              detail="When off, friends won't see you online or your last seen, and you won't see theirs."
              end={<Switch checked={chatSettings.showActivityStatus} onChange={(value) => void changeChatSetting("showActivityStatus", value)} label="Show when I'm online" />}
            />
          </div>
        </Section>

        <Section title="Playback">
          <ChoiceRow
            icon={Gauge}
            tone="bg-primary/15 text-primary"
            title="Streaming quality"
            detail={`${quality.detail}. Changes apply from the next song.`}
            label="Streaming quality"
            value={streamQuality}
            options={STREAM_QUALITIES.map(({ value, label }) => ({ value, label }))}
            onChange={(value: StreamQuality) => setStreamQuality(value)}
          />
          <div className={rowClass}>
            <RowBody
              icon={Repeat}
              tone="bg-indigo-500/15 text-indigo-500"
              title="Autoplay"
              detail="Keep playing similar songs when your queue ends"
              end={<Switch checked={autoplay} onChange={setAutoplay} label="Autoplay similar songs" />}
            />
          </div>
        </Section>

        <Section title="Appearance">
          <ChoiceRow icon={Palette} tone="bg-pink-500/15 text-pink-500" title="Theme" detail="System follows your device's setting" label="Theme" value={theme} options={THEMES} onChange={setTheme} />
        </Section>

        <Section title="More">
          <LinkRow to="/notifications" icon={Bell} tone="bg-amber-500/15 text-amber-500" title="Notifications" detail="Friend requests and activity" />
          <LinkRow to="/downloads" icon={Download} tone="bg-sky-500/15 text-sky-500" title="Downloads" detail={downloads ? `${downloads} ${downloads === 1 ? "song" : "songs"} saved for offline` : "Songs you save play offline"} />
          <LinkRow to="/dashboard" icon={ListMusic} tone="bg-[#B266FF]/15 text-[#B266FF]" title="Listening dashboard" detail="Your stats and saved music" />
        </Section>

        <Section title="Privacy & security">
          <LinkRow to="/privacy" icon={Eye} tone="bg-violet-500/15 text-violet-500" title="Privacy Policy" detail="What BeatBond stores and how it is used" />
          <LinkRow to="/terms" icon={FileText} tone="bg-sky-500/15 text-sky-500" title="Terms of Service" detail="Rules for using BeatBond" />
          <button type="button" className={rowLinkClass} onClick={() => window.dispatchEvent(new Event("beatbond:open-cookie-settings"))}>
            <RowBody chevron icon={Cookie} tone="bg-amber-500/15 text-amber-500" title="Storage & service preferences" detail="Required storage and optional Mapbox requests" />
          </button>
          <div className={rowClass}>
            <RowBody icon={Mail} tone="bg-sky-500/15 text-sky-500" title="Optional email updates" detail="Currently, BeatBond sends no marketing emails. You can opt in or unsubscribe here." end={<Switch checked={profile?.emailMarketingOptIn === true} onChange={(value) => void changeEmailOptIn(value)} label="Optional email updates" />} />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className={rowLinkClass}>
                <RowBody icon={UserX} tone="bg-destructive/15 text-destructive" title="Delete account" detail="Permanently remove your account and app data" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This deletes your profile, posts, comments, playlists, listening and search history, location, and chats from BeatBond, then removes your sign-in account. This cannot be undone. Offline downloads on this device will also be removed.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={deletingAccount} onClick={(event) => { event.preventDefault(); void deleteAccount(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  {deletingAccount ? "Deleting…" : "Delete my account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        <Button variant="outline" className="h-12 w-full rounded-2xl text-destructive hover:text-destructive" onClick={() => void signOut({ redirectUrl: "/" })}>
          <LogOut className="size-4" />Sign out
        </Button>
      </div>
    </main>
  );
};

export default SettingsPage;
