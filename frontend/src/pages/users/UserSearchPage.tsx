import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import FriendRequestButton from "@/components/friends/FriendRequestButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  MessageCircle, 
  Search, 
  Users, 
  Filter,
  X,
  TrendingUp,
  UserPlus,
  Clock
} from "lucide-react";
import { axiosInstance } from "@/lib/axios";

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface User {
  clerkId: string;
  fullName: string;
  username?: string;
  imageUrl: string;
  bio?: string;
  isOnline?: boolean;
  friendsCount?: number;
  mutualFriends?: number;
  lastActive?: string;
}

type FilterType = "all" | "online" | "mutual";

const UserSearchPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [showFilters, setShowFilters] = useState(false);
  const navigate = useNavigate();

  // Debounce search query to reduce API calls
  const debouncedSearch = useDebounce(searchQuery, 400);

  // Fetch search results with optimized caching
  const { data: users = [], isLoading, isFetching } = useQuery<User[]>({
    queryKey: ["users", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.trim().length === 0) return [];
      try {
        const { data } = await axiosInstance.get(
          `/users/search?q=${encodeURIComponent(debouncedSearch)}`
        );
        return data;
      } catch (error) {
        console.error("Search error:", error);
        return [];
      }
    },
    enabled: debouncedSearch.length > 0,
    staleTime: 5000, // Fetch fresh search results promptly
    gcTime: 60000,
    refetchOnWindowFocus: true,
  });

  // Fetch suggested users
  const { data: suggestedUsers = [] } = useQuery<User[]>({
    queryKey: ["suggestedUsers"],
    queryFn: async () => {
      try {
        const { data } = await axiosInstance.get("/users/suggested");
        return data;
      } catch (error) {
        console.error("Suggested users error:", error);
        return [];
      }
    },
    staleTime: 10000,
  });

  // Filter users based on active filter
  const filteredUsers = useMemo(() => {
    if (activeFilter === "all") return users;
    if (activeFilter === "online") return users.filter(u => u.isOnline);
    if (activeFilter === "mutual") return users.filter(u => (u.mutualFriends ?? 0) > 0);
    return users;
  }, [users, activeFilter]);

  const handleMessageClick = useCallback((userId: string) => {
    navigate(`/chat?userId=${userId}`);
  }, [navigate]);

  const handleProfileClick = useCallback((userId: string) => {
    navigate(`/profile/${userId}`);
  }, [navigate]);

  const clearSearch = () => {
    setSearchQuery("");
  };

  const isSearching = searchQuery.length > 0;
  const showLoadingState = isLoading && !isFetching;

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto w-full">
          <div className="relative mb-3 flex items-center justify-between pl-20 sm:mb-4 md:pl-0">
            <div className="w-full text-center">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Find Users</h1>
              <p className="text-zinc-400 text-xs sm:text-sm mt-1 hidden sm:block">
                Search for people to connect with
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 md:hidden"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 h-4 w-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or username..."
              className="pl-10 pr-10 bg-zinc-800/50 border-zinc-700 focus:border-blue-500 transition-colors h-10 sm:h-11"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {isFetching && !isLoading && (
              <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              </div>
            )}
          </div>

          {/* Filter Tabs - Desktop */}
          {isSearching && (
            <div className="mt-3 hidden md:block">
              <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)}>
                <TabsList className="grid w-full grid-cols-3 h-9">
                  <TabsTrigger value="all" className="text-xs">
                    All ({users.length})
                  </TabsTrigger>
                  <TabsTrigger value="online" className="text-xs">
                    Online ({users.filter(u => u.isOnline).length})
                  </TabsTrigger>
                  <TabsTrigger value="mutual" className="text-xs">
                    Mutual ({users.filter(u => (u.mutualFriends ?? 0) > 0).length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* Filter Pills - Mobile */}
          {isSearching && showFilters && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-2 md:hidden scrollbar-hide">
              <Badge
                variant={activeFilter === "all" ? "default" : "outline"}
                className="cursor-pointer whitespace-nowrap"
                onClick={() => setActiveFilter("all")}
              >
                All ({users.length})
              </Badge>
              <Badge
                variant={activeFilter === "online" ? "default" : "outline"}
                className="cursor-pointer whitespace-nowrap"
                onClick={() => setActiveFilter("online")}
              >
                Online ({users.filter(u => u.isOnline).length})
              </Badge>
              <Badge
                variant={activeFilter === "mutual" ? "default" : "outline"}
                className="cursor-pointer whitespace-nowrap"
                onClick={() => setActiveFilter("mutual")}
              >
                Mutual ({users.filter(u => (u.mutualFriends ?? 0) > 0).length})
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto w-full">
          <div className="space-y-2 sm:space-y-3">
            {showLoadingState ? (
              <div className="flex items-center justify-center py-16 sm:py-20">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 animate-spin text-zinc-400 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">Searching...</p>
                </div>
              </div>
            ) : isSearching ? (
              filteredUsers.length > 0 ? (
                <>
                  {filteredUsers.map((user) => (
                    <Card
                      key={user.clerkId}
                      className="hover:bg-zinc-800/50 transition-all hover:scale-[1.01] active:scale-[0.99] border-zinc-800"
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-start sm:items-center gap-3">
                          <div
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleProfileClick(user.clerkId)}
                          >
                            <div className="relative">
                              <Avatar className="h-12 w-12 sm:h-14 sm:w-14">
                                <AvatarImage src={user.imageUrl} alt={user.fullName} />
                                <AvatarFallback className="text-sm sm:text-base">
                                  {user.fullName.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {user.isOnline && (
                                <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-zinc-900" />
                              )}
                            </div>
                          </div>
                          
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => handleProfileClick(user.clerkId)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm sm:text-base">
                                  {user.fullName}
                                </p>
                                {user.username && (
                                  <p className="text-xs sm:text-sm text-zinc-400 truncate">
                                    @{user.username}
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {user.bio && (
                              <p className="text-xs text-zinc-500 line-clamp-2 mt-1">
                                {user.bio}
                              </p>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {user.mutualFriends !== undefined && user.mutualFriends > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  <Users className="h-3 w-3 mr-1" />
                                  {user.mutualFriends} mutual
                                </Badge>
                              )}
                              {user.friendsCount !== undefined && (
                                <Badge variant="outline" className="text-xs">
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  {user.friendsCount} friends
                                </Badge>
                              )}
                              {user.lastActive && !user.isOnline && (
                                <Badge variant="outline" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {user.lastActive}
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 sm:h-9 sm:w-9"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMessageClick(user.clerkId);
                              }}
                              title="Send message"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <FriendRequestButton userId={user.clerkId} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <div className="text-center py-16 sm:py-20">
                  <Users className="h-12 w-12 sm:h-16 sm:w-16 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400 mb-2 text-sm sm:text-base">No users found</p>
                  <p className="text-xs sm:text-sm text-zinc-500">
                    Try a different search term or filter
                  </p>
                </div>
              )
            ) : (
              <>
                {/* Suggested Users Section */}
                {suggestedUsers.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3 sm:mb-4">
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                      <h2 className="text-base sm:text-lg font-semibold">Suggested for you</h2>
                    </div>
                    <div className="space-y-2 sm:space-y-3">
                      {suggestedUsers.slice(0, 5).map((user) => (
                        <Card
                          key={user.clerkId}
                          className="hover:bg-zinc-800/50 transition-all hover:scale-[1.01] active:scale-[0.99] border-zinc-800"
                        >
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => handleProfileClick(user.clerkId)}
                              >
                                <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                                  <AvatarImage src={user.imageUrl} alt={user.fullName} />
                                  <AvatarFallback className="text-sm">
                                    {user.fullName.charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                              
                              <div 
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => handleProfileClick(user.clerkId)}
                              >
                                <p className="font-medium truncate text-sm sm:text-base">
                                  {user.fullName}
                                </p>
                                {user.mutualFriends !== undefined && user.mutualFriends > 0 && (
                                  <p className="text-xs text-zinc-400">
                                    {user.mutualFriends} mutual friend{user.mutualFriends > 1 ? 's' : ''}
                                  </p>
                                )}
                              </div>

                              <FriendRequestButton userId={user.clerkId} />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                <div className="text-center py-16 sm:py-20">
                  <Search className="h-12 w-12 sm:h-16 sm:w-16 text-zinc-600 mx-auto mb-4" />
                  <p className="text-zinc-400 mb-2 text-sm sm:text-base">
                    Start typing to search for users
                  </p>
                  <p className="text-xs sm:text-sm text-zinc-500">
                    Find friends by name or username
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default UserSearchPage;
