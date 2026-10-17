import { cn } from "@/lib/utils";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-react";
import {
  Home,
  Library,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { memo } from "react";
import SignInConsentButton from "@/components/privacy/SignInConsentButton";

const MobileNav = memo(() => {
  const location = useLocation();
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
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md md:hidden">
        <SignedOut>
          <div className="flex h-16 items-center justify-center px-4">
            <SignInConsentButton label="Sign in" className="w-full max-w-xs gap-2 bg-white text-zinc-900 hover:bg-zinc-200" />
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
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "min-w-0 touch-manipulation flex flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:text-[11px]",
                    isActive ? "text-white" : "text-zinc-300",
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
