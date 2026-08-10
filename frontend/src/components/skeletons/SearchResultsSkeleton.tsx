const SearchResultsSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card animate-pulse">
          <div className="w-12 h-12 bg-zinc-800 rounded-md" />
          <div className="space-y-2 flex-1">
            <div className="h-4 bg-zinc-800 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default SearchResultsSkeleton; 