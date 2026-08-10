import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignedIn, SignedOut, useClerk, useUser } from "@clerk/clerk-react";
import {
  Home,
  Library,
  LogIn,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { memo } from "react";

const MobileNav = memo(() => {
  const location = useLocation();
  const { openSignIn } = useClerk();
  const { user } = useUser();

  const items = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: Library, label: "Library", path: "/library" },
    { icon: Sparkles, label: "Mood", path: "/mood" },
    { icon: Users, label: "Friends", path: user ? "/friends" : "/" },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md md:hidden">
        <SignedOut>
          <div className="flex h-16 items-center justify-center px-4">
            <Button
              onClick={() => openSignIn({ redirectUrl: "/" })}
              className="w-full max-w-xs gap-2 bg-white text-zinc-900 hover:bg-zinc-200"
            >
              <LogIn className="h-4 w-4" />
              Sign in
            </Button>
          </div>
        </SignedOut>

        <SignedIn>
          <div className="grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
            {items.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "min-w-0 touch-manipulation flex flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:text-[11px]",
                    isActive ? "text-white" : "text-zinc-500",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] sm:h-5 sm:w-5",
                      isActive && "text-sky-400",
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SignedIn>
      </nav>
      <div className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
    </>
  );
});

MobileNav.displayName = "MobileNav";

export default MobileNav;
