import { AlbumOptionsMenu } from "@/components/AlbumOptionsMenu";
import { SongOptionsMenu } from "@/components/SongOptionsMenu";
import { 
  ArrowRight, 
  Clock3, 
  Loader2, 
  Search, 
  TrendingUp, 
  X, 
  Filter, 
  Mic, 
  Bookmark, 
  BookmarkPlus,
  Bell,
  Trash2,
  History,
  Sparkles,
  XCircle
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import PlayButton from "@/pages/home/components/PlayButton";
import { useDebounce } from "@/hooks/useDebounce";
import { useSearchStore } from "@/stores/useSearchStore";
import { cn } from "@/lib/utils";

// Type declaration for SpeechRecognition
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

type Filter = "all" | "songs" | "artists" | "albums" | "playlists";
const popular = ["Trending songs", "Arijit Singh", "Bollywood hits", "Punjabi songs", "Taylor Swift", "Romantic songs"];
const recentKey = "beatbond:recent-searches";

const readRecents = () => {
  try { return JSON.parse(localStorage.getItem(recentKey) || "[]") as string[]; } catch { return []; }
};

const SearchPage = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [recentSearches, setRecentSearches] = useState<string[]>(readRecents);
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  
  const { 
    searchQuery, 
    searchResults: songs, 
    artistResults: artists, 
    albumResults: albums, 
    playlistResults: playlists, 
    isLoading, 
    error, 
    setSearchQuery, 
    searchSongs, 
    clearSearch,
    filters,
    setFilters,
    suggestions,
    getSuggestions,
    clearSuggestions,
    searchHistory,
    loadSearchHistory,
    clearSearchHistory,
    deleteSearchHistoryEntry,
    savedSearches,
    loadSavedSearches,
    createSavedSearch,
    deleteSavedSearch,
    filterOptions,
    loadFilterOptions,
  } = useSearchStore();
  
  const query = useDebounce(searchQuery, 300);
  const displayedArtists = artists;
  const total = songs.length + artists.length + albums.length + playlists.length;
  const hasResults = total > 0;

  // Desktop search links to this screen with `?q=`. Hydrating the shared
  // store from that value guarantees mobile receives the exact same query and
  // therefore the same unified songs/artists/albums/playlists result set.
  useEffect(() => {
    const requestedQuery = urlSearchParams.get("q")?.trim() || "";
    if (requestedQuery && requestedQuery !== searchQuery) setSearchQuery(requestedQuery);
  }, [urlSearchParams, searchQuery, setSearchQuery]);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recog = new SpeechRecognition();
      recog.continuous = false;
      recog.interimResults = true;
      recog.lang = 'en-US';
      
      recog.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setSearchQuery(transcript);
      };
      
      recog.onerror = () => {
        setVoiceActive(false);
      };
      
      recog.onend = () => {
        setVoiceActive(false);
      };
      
      setRecognition(recog);
    }
  }, [setSearchQuery]);

  const startVoiceSearch = () => {
    if (recognition) {
      setVoiceActive(true);
      recognition.start();
    }
  };

  const stopVoiceSearch = () => {
    if (recognition) {
      recognition.stop();
      setVoiceActive(false);
    }
  };

  // Load data on mount
  useEffect(() => {
    loadSearchHistory();
    loadSavedSearches();
    loadFilterOptions();
  }, [loadSearchHistory, loadSavedSearches, loadFilterOptions]);

  // Search effect
  useEffect(() => {
    if (!query.trim()) { 
      clearSearch(); 
      clearSuggestions();
      return; 
    }
    searchSongs(query);
    getSuggestions(query);
    
    setRecentSearches((current) => {
      const next = [query.trim(), ...current.filter((item) => item.toLowerCase() !== query.trim().toLowerCase())].slice(0, 8);
      localStorage.setItem(recentKey, JSON.stringify(next));
      return next;
    });
  }, [query, searchSongs, clearSearch, clearSuggestions, getSuggestions]);

  const show = (section: Filter) => filter === "all" || filter === section;
  const chooseSearch = (value: string) => { setSearchQuery(value); setUrlSearchParams({ q: value }); inputRef.current?.focus(); };
  const formatDuration = (duration: number) => `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  const clearRecents = () => { localStorage.removeItem(recentKey); setRecentSearches([]); };

  const handleSaveSearch = async () => {
    if (!searchQuery.trim()) return;
    const name = prompt("Enter a name for this search:", searchQuery);
    if (name) {
      try {
        await createSavedSearch(name, searchQuery, filters, false);
        alert("Search saved successfully!");
      } catch {
        alert("Failed to save search");
      }
    }
  };

  const handleDeleteSavedSearch = async (id: string) => {
    if (confirm("Delete this saved search?")) {
      await deleteSavedSearch(id);
    }
  };

  const handleDeleteHistoryEntry = async (id: string) => {
    await deleteSearchHistoryEntry(id);
  };

  const handleClearHistory = async () => {
    if (confirm("Clear all search history?")) {
      await clearSearchHistory();
      setRecentSearches([]);
      localStorage.removeItem(recentKey);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-gradient-to-b from-background via-background to-secondary/20">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 pb-3 pt-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
            <div className="flex-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Discover</p>
              <h1 className="text-2xl font-bold tracking-tight">Search music</h1>
            </div>
            {user && (
              <Link
                to="/profile"
                className="shrink-0 p-0.5 rounded-full border border-primary/40 hover:border-primary transition-all shadow-sm active:scale-95 bg-secondary/40"
                title="Profile"
              >
                <Avatar className="size-8">
                  <AvatarImage src={user?.imageUrl} alt={user?.fullName || "Profile"} />
                  <AvatarFallback>{(user?.fullName || "U")[0]}</AvatarFallback>
                </Avatar>
              </Link>
            )}
          </div>
          
          <div className="relative mx-auto max-w-3xl">
            <div className="relative">
              <Search aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              
              {isLoading ? (
                <Loader2 aria-label="Searching" className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-primary" />
              ) : searchQuery ? (
                <button 
                  type="button" 
                  aria-label="Clear search" 
                  onClick={() => { clearSearch(); setUrlSearchParams({}); inputRef.current?.focus(); }} 
                  className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-5" />
                </button>
              ) : null}
              
              <Input 
                ref={inputRef} 
                value={searchQuery} 
                onChange={(e) => { const value = e.target.value; setSearchQuery(value); setUrlSearchParams(value.trim() ? { q: value } : {}); }} 
                placeholder="Songs, artists, albums…" 
                enterKeyHint="search" 
                className="h-12 rounded-2xl border-border bg-card/80 pl-12 pr-12 text-base shadow-sm placeholder:text-muted-foreground/80 sm:rounded-full"
                onFocus={() => setShowHistory(true)}
                onBlur={() => setTimeout(() => setShowHistory(false), 200)}
              />
            </div>

            {/* Voice Search Button */}
            <button
              type="button"
              onClick={voiceActive ? stopVoiceSearch : startVoiceSearch}
              className={cn(
                "absolute right-14 top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full transition-colors",
                voiceActive 
                  ? "bg-primary text-primary-foreground animate-pulse" 
                  : "text-muted-foreground hover:bg-secondary"
              )}
              aria-label={voiceActive ? "Stop voice search" : "Start voice search"}
            >
              <Mic className="size-5" />
            </button>

            {/* Filter Button */}
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" className="hidden sm:inline-flex absolute right-44 top-1/2 -translate-y-1/2 h-10">
                  <Filter className="size-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" side="bottom" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Filters</h3>
                    <Button variant="ghost" size="sm" onClick={() => setFilters({})}>Clear all</Button>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Genre</Label>
                    <Select value={filters.genre || ""} onValueChange={(v) => setFilters({ ...filters, genre: v || undefined })} >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All genres" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All genres</SelectItem>
                        {filterOptions.genres.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Language</Label>
                    <Select value={filters.language || ""} onValueChange={(v) => setFilters({ ...filters, language: v || undefined })} >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All languages" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All languages</SelectItem>
                        {filterOptions.languages.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Mood</Label>
                    <Select value={filters.mood || ""} onValueChange={(v) => setFilters({ ...filters, mood: v || undefined })} >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All moods" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All moods</SelectItem>
                        {filterOptions.moods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Year</Label>
                    <Select value={filters.year?.toString() || ""} onValueChange={(v) => setFilters({ ...filters, year: v ? Number(v) : undefined })} >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All years" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All years</SelectItem>
                        {filterOptions.years.map((y) => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Explicit Content</Label>
                    <Select value={filters.explicit?.toString() || ""} onValueChange={(v) => setFilters({ ...filters, explicit: v === "true" ? true : v === "false" ? false : undefined })} >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        <SelectItem value="true">Explicit only</SelectItem>
                        <SelectItem value="false">Clean only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Sort By</Label>
                    <Select value={filters.sortBy || "relevance"} onValueChange={(v) => setFilters({ ...filters, sortBy: v as any })} >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Relevance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="popularity">Popularity</SelectItem>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                        <SelectItem value="duration-asc">Duration: Short to Long</SelectItem>
                        <SelectItem value="duration-desc">Duration: Long to Short</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Duration Range</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Min (sec)"
                        value={filters.minDuration || ""}
                        onChange={(e) => setFilters({ ...filters, minDuration: e.target.value ? Number(e.target.value) : undefined })}
                        className="flex-1 h-8 px-2 text-sm border border-border rounded bg-background"
                      />
                      <span className="text-muted-foreground">-</span>
                      <input
                        type="number"
                        placeholder="Max (sec)"
                        value={filters.maxDuration || ""}
                        onChange={(e) => setFilters({ ...filters, maxDuration: e.target.value ? Number(e.target.value) : undefined })}
                        className="flex-1 h-8 px-2 text-sm border border-border rounded bg-background"
                      />
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Save Search Button */}
            {searchQuery && (
              <Button 
                variant="outline" 
                size="icon" 
                className="hidden sm:inline-flex absolute right-74 top-1/2 -translate-y-1/2 h-10"
                onClick={handleSaveSearch}
                aria-label="Save search"
              >
                <BookmarkPlus className="size-5" />
              </Button>
            )}
          </div>

          {searchQuery && (
            <div role="tablist" aria-label="Search result filters" className="mt-3 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {(["all", "songs", "artists", "albums", "playlists"] as Filter[]).map((item) => (
                <button 
                  role="tab" 
                  aria-selected={filter === item} 
                  key={item} 
                  onClick={() => setFilter(item)} 
                  className={cn(
                    "min-h-10 shrink-0 rounded-full px-4 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filter === item 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/75"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {/* Suggestions Dropdown */}
          {searchQuery && (suggestions.songs?.length > 0 || suggestions.artists?.length > 0 || suggestions.albums?.length > 0 || suggestions.playlists?.length > 0 || suggestions.popular?.length > 0) && (
            <div className="mt-2 absolute z-50 w-full max-w-3xl mx-auto animate-in fade-in-0 zoom-in-95">
              <div className="rounded-2xl border border-border/70 bg-card p-2 shadow-lg">
                {suggestions.songs?.length > 0 && (
                  <div>
                    <p className="px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">Songs</p>
                    {suggestions.songs.slice(0, 3).map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => chooseSearch(s.title)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <img src={s.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{s.subtitle}</p>
                        </div>
                        <Sparkles className="size-4 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.artists?.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">Artists</p>
                    {suggestions.artists.slice(0, 3).map((a: any) => (
                      <button
                        key={a.title}
                        onClick={() => chooseSearch(a.title)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <div className="size-10 rounded-full bg-secondary/50 flex items-center justify-center">
                          <span className="text-xs font-medium">{a.title.charAt(0)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.albums?.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">Albums</p>
                    {suggestions.albums.slice(0, 3).map((a: any) => (
                      <button
                        key={a.id}
                        onClick={() => chooseSearch(a.title)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <img src={a.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{a.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.playlists?.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">Playlists</p>
                    {suggestions.playlists.slice(0, 3).map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => chooseSearch(p.title)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <img src={p.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.popular?.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">Popular Searches</p>
                    {suggestions.popular.slice(0, 3).map((p: any) => (
                      <button
                        key={p.title}
                        onClick={() => chooseSearch(p.title)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <TrendingUp className="size-4 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{p.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Search History Dropdown */}
          {showHistory && !searchQuery && (recentSearches.length > 0 || searchHistory.length > 0) && (
            <div className="mt-2 absolute z-50 w-full max-w-3xl mx-auto animate-in fade-in-0 zoom-in-95">
              <div className="rounded-2xl border border-border/70 bg-card p-2 shadow-lg max-h-96 overflow-y-auto">
                {recentSearches.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-3 py-2">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Recent Searches</p>
                      <Button variant="ghost" size="sm" onClick={clearRecents}>
                        <Trash2 className="size-4" />
                        <span className="hidden sm:inline">Clear</span>
                      </Button>
                    </div>
                    {recentSearches.map((item) => (
                      <button
                        key={item}
                        onClick={() => chooseSearch(item)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <Clock3 className="size-4 text-muted-foreground" />
                        <span className="truncate text-sm">{item}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchHistory.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center justify-between px-3 py-2">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider">History</p>
                      <Button variant="ghost" size="sm" onClick={handleClearHistory}>
                        <Trash2 className="size-4" />
                        <span className="hidden sm:inline">Clear</span>
                      </Button>
                    </div>
                    {searchHistory.slice(0, 10).map((entry: any) => (
                      <button
                        key={entry._id || entry.timestamp}
                        onClick={() => chooseSearch(entry.query)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                      >
                        <History className="size-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{entry.query}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleDateString()} · {entry.resultCount} results
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); handleDeleteHistoryEntry(entry._id); }}>
                          <XCircle className="size-4" />
                        </Button>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Saved Searches Dropdown */}
          {savedSearches.length > 0 && !searchQuery && (
            <div className="mt-2 absolute z-50 w-full max-w-3xl mx-auto animate-in fade-in-0 zoom-in-95">
              <div className="rounded-2xl border border-border/70 bg-card p-2 shadow-lg">
                <p className="px-3 py-2 text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                  <Bookmark className="size-4" />
                  Saved Searches
                </p>
                {savedSearches.map((saved: any) => (
                  <div key={saved._id} className="px-2">
                    <button
                      onClick={() => chooseSearch(saved.query)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-xl hover:bg-secondary/50 transition-colors"
                    >
                      <Bookmark className="size-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{saved.name}</p>
                        <p className="truncate text-xs text-muted-foreground">"{saved.query}" · {saved.filters?.genre || "All genres"}</p>
                      </div>
                      {saved.notifyOnNewResults && <Bell className="size-4 text-primary" />}
                    </button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-full justify-end pr-2 -mt-1"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSavedSearch(saved._id); }}
                    >
                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-7xl space-y-7 px-4 pb-44 pt-5 sm:px-6 md:pb-8">
          {!searchQuery && (
            <>
              {recentSearches.length > 0 && (
                <section aria-labelledby="recent-heading">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 id="recent-heading" className="text-lg font-bold flex items-center gap-2">
                      <History className="size-5" />
                      Recent searches
                    </h2>
                    <Button variant="ghost" size="sm" onClick={clearRecents}>
                      <Trash2 className="size-4 mr-1" />
                      Clear
                    </Button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
                    {recentSearches.map((item) => (
                      <button 
                        key={item} 
                        onClick={() => chooseSearch(item)} 
                        className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-secondary px-4 text-sm hover:bg-secondary/75"
                      >
                        <Clock3 className="size-4 text-muted-foreground" />
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              
              {savedSearches.length > 0 && (
                <section aria-labelledby="saved-heading">
                  <div className="mb-3 flex items-center gap-2">
                    <Bookmark className="size-5 text-primary" />
                    <h2 id="saved-heading" className="text-lg font-bold">Saved Searches</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 lg:grid-cols-3">
                    {savedSearches.map((saved: any) => (
                      <button 
                        key={saved._id} 
                        onClick={() => chooseSearch(saved.query)} 
                        className="group min-h-24 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Bookmark className="size-4 text-primary" />
                          <span className="text-xs font-semibold text-primary">{saved.name}</span>
                        </div>
                        <p className="line-clamp-1 text-sm font-medium truncate">"{saved.query}"</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {saved.filters?.genre || "All genres"} · {saved.filters?.language || "All languages"}
                        </p>
                        {saved.notifyOnNewResults && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                            <Bell className="size-3" />
                            <span>Notifications on</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section aria-labelledby="popular-heading">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="size-5 text-primary" />
                  <h2 id="popular-heading" className="text-lg font-bold">Trending searches</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 lg:grid-cols-4">
                  {popular.map((item, index) => (
                    <button 
                      key={item} 
                      onClick={() => chooseSearch(item)} 
                      className="group min-h-24 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-xs font-semibold text-primary">0{index + 1}</span>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold">{item}</p>
                      <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          
          {isLoading && (
            <div role="status" className="flex flex-col items-center py-20 text-sm text-muted-foreground">
              <Loader2 className="mb-3 size-10 animate-spin text-primary" />
              Finding your next favourite…
            </div>
          )}
          
          {searchQuery && !isLoading && hasResults && (
            <>
              <div className="flex items-end justify-between gap-3">
                <h2 className="min-w-0 truncate text-xl font-bold sm:text-2xl">Results for “{searchQuery}”</h2>
                <span className="shrink-0 text-sm text-muted-foreground">{total} results</span>
              </div>
              
              {/* Spotify-style Top Result & Top Songs Section */}
              {filter === "all" && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                  {/* Top Result Card */}
                  {displayedArtists.length > 0 ? (
                    <div className="lg:col-span-2">
                      <h3 className="mb-3 text-lg font-bold">Top result</h3>
                      <button 
                        type="button" 
                        onClick={() => navigate(`/artist/${displayedArtists[0].id}`, { state: { artist: displayedArtists[0] } })} 
                        className="group relative flex min-h-[220px] w-full flex-col justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-secondary/30 p-5 text-left shadow-md transition-all hover:bg-secondary/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div>
                          <img 
                            src={displayedArtists[0].imageUrl || "/default-image.png"} 
                            alt={displayedArtists[0].name} 
                            loading="lazy" 
                            className="mb-4 size-24 rounded-full object-cover shadow-md transition-transform duration-300 group-hover:scale-105" 
                            onError={(e) => { (e.target as HTMLImageElement).src = "/default-image.png"; }}
                          />
                          <h4 className="text-2xl font-bold tracking-tight text-foreground line-clamp-1">{displayedArtists[0].name}</h4>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
                              {displayedArtists[0].isVerified ? "Verified Artist" : "Artist"}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  ) : songs.length > 0 ? (
                    <div className="lg:col-span-2">
                      <h3 className="mb-3 text-lg font-bold">Top result</h3>
                      <div className="group relative flex min-h-[220px] w-full flex-col justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-secondary/30 p-5 text-left shadow-md">
                        <div>
                          <img 
                            src={songs[0].imageUrl || "/default-image.png"} 
                            alt={songs[0].title} 
                            loading="lazy" 
                            className="mb-4 size-24 rounded-xl object-cover shadow-md" 
                          />
                          <h4 className="text-xl font-bold tracking-tight text-foreground line-clamp-1">{songs[0].title}</h4>
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{songs[0].artist}</p>
                          <span className="mt-2 inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider">
                            Song
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Songs List */}
                  {songs.length > 0 && (
                    <div className="lg:col-span-3">
                      <h3 className="mb-3 text-lg font-bold">Songs</h3>
                      <div className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card px-2">
                        {songs.slice(0, 4).map((song) => (
                          <div key={song._id} className="group flex min-h-16 items-center gap-3 py-2 px-1 hover:bg-secondary/40 rounded-xl transition-colors">
                            <div className="relative shrink-0">
                              <img src={song.imageUrl} alt={`${song.title} cover`} loading="lazy" className="size-12 rounded-lg object-cover" />
                              <PlayButton song={song} size="small" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{song.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                            </div>
                            {song.explicit && <span className="shrink-0 px-2 py-0.5 text-xs bg-destructive/10 text-destructive rounded">E</span>}
                            <span className="shrink-0 pr-1 text-xs tabular-nums text-muted-foreground">{formatDuration(song.duration)}</span>
                            <SongOptionsMenu song={song} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {show("artists") && displayedArtists.length > 0 && (
                <section>
                  <h3 className="mb-3 text-lg font-bold flex items-center gap-2">
                    <span>Artists</span>
                    <span className="text-sm font-normal text-muted-foreground">({displayedArtists.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 md:grid-cols-5">
                    {displayedArtists.map((artist) => (
                      <button 
                        key={artist.id} 
                        onClick={() => navigate(`/artist/${artist.id}`, { state: { artist } })} 
                        className="min-w-0 rounded-2xl bg-card p-3 text-left hover:bg-secondary/60 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
                      >
                        <img 
                          src={artist.imageUrl || "/default-image.png"} 
                          alt={`${artist.name} artist`} 
                          loading="lazy" 
                          className="mb-3 aspect-square w-full rounded-full object-cover shadow-sm" 
                          onError={(e) => { (e.target as HTMLImageElement).src = "/default-image.png"; }}
                        />
                        <p className="truncate font-semibold">{artist.name}</p>
                        <p className="text-xs text-muted-foreground">{artist.isVerified ? "Verified Artist" : "Artist"}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              
              {show("albums") && albums.length > 0 && (
                <section>
                  <h3 className="mb-3 text-lg font-bold flex items-center gap-2">
                    <span>Albums</span>
                    <span className="text-sm font-normal text-muted-foreground">({albums.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 md:grid-cols-5">
                    {albums.map((album) => (
                      <div 
                        key={album.id} 
                        onClick={() => navigate(`/album/${album.id}`)} 
                        className="group relative min-w-0 rounded-2xl bg-card p-3 text-left hover:bg-secondary/60 cursor-pointer"
                      >
                        <div className="relative mb-3 aspect-square w-full rounded-xl overflow-hidden">
                          <img src={album.imageUrl} alt={`${album.title} cover`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                          <div className="absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                            <AlbumOptionsMenu album={album} buttonClassName="grid size-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur-md hover:bg-black hover:scale-105 shadow-md border border-white/10 transition-all" />
                          </div>
                        </div>
                        <p className="truncate text-sm font-semibold">{album.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{album.artist} · {album.year}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              
              {show("playlists") && playlists.length > 0 && (
                <section>
                  <h3 className="mb-3 text-lg font-bold flex items-center gap-2">
                    <span>Playlists</span>
                    <span className="text-sm font-normal text-muted-foreground">({playlists.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 min-[460px]:grid-cols-3 md:grid-cols-5">
                    {playlists.map((playlist) => (
                      <button 
                        key={playlist.id} 
                        onClick={() => navigate(`/playlists/${playlist.id}`)} 
                        className="min-w-0 rounded-2xl bg-card p-3 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <img src={playlist.imageUrl} alt={`${playlist.name} cover`} loading="lazy" className="mb-3 aspect-square w-full rounded-xl object-cover" />
                        <p className="truncate text-sm font-semibold">{playlist.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{playlist.songCount} {playlist.songCount === 1 ? "song" : "songs"}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          
          {searchQuery && !isLoading && !hasResults && (
            <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center">
              <div className="mb-4 grid size-16 place-items-center rounded-full bg-secondary">
                <Search className="size-7 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-bold">{error ? "Search is unavailable" : "No results found"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {error || `We couldn't find “${searchQuery}”. Try a song, artist, or album name.`}
              </p>
              {error && (
                <Button onClick={() => searchSongs(searchQuery)} className="mt-5 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground">
                  Try again
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SearchPage;
