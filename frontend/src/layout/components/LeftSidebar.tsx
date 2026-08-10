import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignedIn, SignedOut, useClerk, useUser } from "@clerk/clerk-react";
import {
  Bell,
  Heart,
  HomeIcon,
  Library,
  LogIn,
  MapPin,
  MessageCircle,
  Settings,
  Sparkles,
  User,
  UserSearch,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface LeftSidebarProps {
  onNavigate?: () => void;
}

const mainNavItems = [
  { icon: HomeIcon, label: "Home", path: "/" },
  { icon: MessageCircle, label: "Messages", path: "/chat" },
  { icon: UserSearch, label: "Search Users", path: "/users" },
  { icon: MapPin, label: "Friends Map", path: "/map" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: Heart, label: "Mood Playlist", path: "/mood" },
  { icon: Sparkles, label: "Avatar Creator", path: "/avatar" },
  { icon: User, label: "Dashboard", path: "/dashboard" },
];

const LeftSidebar = ({ onNavigate }: LeftSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { openSignIn } = useClerk();
  const { user } = useUser();
  const handleNavigation = () => onNavigate?.();

  const handleGoogleSignIn = () => {
    openSignIn({
      redirectUrl: "/",
      appearance: { elements: { socialButtonsBlockButton: "gap-2" } },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border/50 bg-card/50 p-4 shadow-sm">
        <div className="min-h-0 space-y-2">
          <SignedOut>
            <div className="flex flex-col items-center gap-4 py-8">
              <LogIn className="size-12 text-muted-foreground" />
              <div className="text-center">
                <h3 className="text-lg font-semibold">Sign in to BeatBond</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Access playlists, friends, and more features
                </p>
              </div>
              <button
                onClick={handleGoogleSignIn}
                className={cn(
                  buttonVariants({ className: "w-full justify-center gap-2" }),
                )}
              >
                Continue with Google
              </button>
            </div>
          </SignedOut>

          <SignedIn>
            {mainNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleNavigation}
                className={cn(
                  buttonVariants({
                    variant: "ghost",
                    className: cn(
                      "w-full justify-start text-foreground transition-all duration-200 hover:bg-secondary/80",
                      location.pathname === item.path && "bg-secondary",
                    ),
                  }),
                )}
              >
                <item.icon className="mr-2 size-5" />
                <span className="md:inline">{item.label}</span>
              </Link>
            ))}

            <div className="hidden md:block">
              <button
                onClick={() => {
                  navigate("/library");
                  handleNavigation();
                }}
                className={cn(
                  buttonVariants({
                    variant: "ghost",
                    className: cn(
                      "w-full justify-start text-foreground transition-all duration-200 hover:bg-secondary/80",
                      location.pathname === "/library" && "bg-secondary",
                    ),
                  }),
                )}
              >
                <Library className="mr-2 size-5" />
                <span className="flex-1 text-left">Library</span>
              </button>
              <Link
                to="/liked-songs"
                onClick={handleNavigation}
                className={cn(
                  buttonVariants({
                    variant: "ghost",
                    className: cn(
                      "w-full justify-start text-foreground transition-all mt-2 duration-200 hover:bg-secondary/80",
                      location.pathname === "/liked-songs" && "bg-secondary",
                    ),
                  }),
                )}
              >
                <Heart className="mr-2 size-4 fill-current text-primary" />
                <span className="flex-1 text-left">Liked Songs</span>
              </Link>
            </div>
          </SignedIn>
        </div>
        <SignedIn>
          <div className="mt-auto border-t border-border/60 pt-3">
            <Link
              to="/me"
              onClick={handleNavigation}
              className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/80"
              aria-label="Open your profile"
            >
              <Avatar className="size-10 border border-border">
                <AvatarImage
                  src={user?.imageUrl}
                  alt={user?.fullName || "Your profile"}
                />
                <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {user?.fullName || "Your profile"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Profile & account
                </span>
              </span>
              <Settings className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </SignedIn>
      </div>
    </div>
  );
};

export default LeftSidebar;
