const FeaturedGridSkeleton = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center bg-card/50 rounded-lg overflow-hidden animate-pulse
							 border border-border/50 shadow-sm"
        >
          <div className="w-16 sm:w-20 h-16 sm:h-20 bg-secondary/60 flex-shrink-0" />
          <div className="flex-1 p-4 space-y-2">
            <div className="h-4 bg-secondary/60 rounded-lg w-3/4" />
            <div className="h-3 bg-secondary/60 rounded-lg w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
};
export default FeaturedGridSkeleton;
