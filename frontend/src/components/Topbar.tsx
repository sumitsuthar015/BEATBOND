import { SignedOut, SignedIn, useUser } from "@clerk/clerk-react";
import { LayoutDashboard, Search, Loader2, X, Music2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import SignInOAuthButtons from "./SignInOAuthButtons";
import { useAuthStore } from "@/stores/useAuthStore";
import { useSearchStore } from "@/stores/useSearchStore";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";
import { Input } from "./ui/input";
import { useEffect, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import PlayButton from "@/pages/home/components/PlayButton";
import { InstallAppButton } from "./InstallAppButton";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useMyProfile } from "@/hooks/useMyProfile";

const Topbar = ({ showInstall = false }: { showInstall?: boolean }) => {
  const { user } = useUser();
  const { data: profile } = useMyProfile();
  const { isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const {
    searchQuery,
    searchResults,
    artistResults,
    isLoading,
    setSearchQuery,
    searchSongs,
    clearSearch,
  } = useSearchStore();
  const [showResults, setShowResults] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(searchQuery, 500);

  useEffect(() => {
    if (debouncedSearch && debouncedSearch.trim().length > 0) {
      searchSongs(debouncedSearch);
      setShowResults(true);
    } else if (!debouncedSearch) {
      clearSearch();
      setShowResults(false);
    }
  }, [debouncedSearch, searchSongs, clearSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const renderSearchResult = (song: any) => song;

  const handleResultClick = () => {
    setShowResults(false);
    clearSearch();
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3 sm:p-4 
                    sticky top-0 bg-background/75 dark:bg-background/90 backdrop-blur-md 
                    z-10 border-b border-border">
      
      {/* Logo - Always on Left */}
      <Link to="/" className="flex items-center gap-2 flex-shrink-0">
        <div className="size-7 sm:size-8 md:size-10 rounded-lg bg-primary flex items-center justify-center">
          <Music2 className="size-4 sm:size-5 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight text-sm sm:text-base">
          BeatBond
        </span>
      </Link>

      {/* Desktop Search - Hidden on Mobile */}
      <div className="hidden md:flex flex-1 max-w-md mx-4" ref={searchRef}>
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 
                           text-muted-foreground size-4" />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 
                             text-muted-foreground size-4 animate-spin" />
          )}
          {searchQuery && !isLoading && (
            <button
              onClick={() => {
                clearSearch();
                setShowResults(false);
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 
                       text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            onFocus={() => searchQuery && setShowResults(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchQuery.trim()) {
                setShowResults(false);
                navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }
            }}
            placeholder="Search songs, albums..."
            className="w-full pl-10 pr-10 bg-secondary/50 dark:bg-secondary/30 
                     border-border focus:ring-primary"
          />

          {/* Desktop Search Results */}
          {showResults && searchQuery && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card rounded-lg 
                          shadow-xl max-h-96 overflow-y-auto border border-border z-50">
              {isLoading && (
                <div className="p-4 text-center">
                  <Loader2 className="size-6 animate-spin mx-auto text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Searching...</p>
                </div>
              )}
              {!isLoading && artistResults.length === 0 && searchResults.length === 0 && (
                <div className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    No results found for "{searchQuery}"
                  </p>
                </div>
              )}
              {artistResults.length > 0 && (
                <div className="border-b border-border bg-secondary/30 p-2">
                  <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-primary">Top Artist</p>
                  {artistResults.slice(0, 1).map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => {
                        setShowResults(false);
                        navigate(`/artist/${artist.id}`, { state: { artist } });
                      }}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-all hover:bg-secondary/60 active:scale-[0.99]"
                    >
                      <img
                        src={artist.imageUrl || "/default-image.png"}
                        alt={artist.name}
                        className="size-11 rounded-full object-cover shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/default-image.png";
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{artist.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {artist.isVerified ? "Verified Artist" : "Artist"}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!isLoading && Array.isArray(searchResults) && searchResults.length > 0 && (
                <>
                  <div className="p-2 border-b border-border">
                    <p className="text-xs text-muted-foreground px-2">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                    </p>
                  </div>
                  {searchResults.map((song) => (
                    <div
                      key={song._id}
                      className="flex items-center gap-3 p-3 hover:bg-secondary/50 
                               transition-all duration-200 group cursor-pointer relative"
                      onClick={handleResultClick}
                    >
                      <img
                        src={song.imageUrl || "/default-image.png"}
                        alt={song.title}
                        className="h-12 w-12 object-cover rounded shadow-md flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/default-image.png";
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {song.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {song.artist}
                        </p>
                      </div>
                      <PlayButton song={renderSearchResult(song)} size="small" />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setShowResults(false); navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`); }}
                    className="m-2 w-[calc(100%-1rem)] rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary"
                  >
                    View all results
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
        {/* Admin Dashboard Link */}
        {isAdmin && (
          <Link
            to="/admin"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "hidden lg:flex hover:bg-secondary/50 transition-colors"
            )}
          >
            <LayoutDashboard className="size-4 mr-2" />
            <span className="hidden xl:inline">Admin Dashboard</span>
            <span className="xl:hidden">Admin</span>
          </Link>
        )}

        {/* Notification Badge - Only for signed in users
        <SignedIn>
          <div className="hidden sm:block">
            <NotificationBadge />
          </div>
        </SignedIn> */}

        {/* Auth Buttons */}
        <SignedOut>
          <div className="hidden sm:block">
            <SignInOAuthButtons />
          </div>
        </SignedOut>

        <SignedIn>
          <div className="flex items-center gap-2">
            {showInstall && <InstallAppButton />}
            <Link
              to="/profile"
              className="md:hidden flex items-center gap-2 rounded-full p-0.5 border border-primary/40 hover:border-primary transition-all shadow-sm active:scale-95 bg-secondary/40"
              title="My Profile"
              aria-label="My Profile"
            >
              <Avatar className="size-8 sm:size-9">
                <AvatarImage src={profile?.imageUrl || user?.imageUrl} alt={profile?.fullName || user?.fullName || "Profile"} />
                <AvatarFallback>{(profile?.fullName || user?.fullName || "U")[0]}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </SignedIn>
        <SignedOut>
          {showInstall && <InstallAppButton />}
        </SignedOut>
      </div>
    </div>
  );
};

export default Topbar;
