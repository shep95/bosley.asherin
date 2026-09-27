const FeedSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="stagger" aria-busy="true" aria-label="loading posts">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="row px-5 sm:px-8 py-5" style={{ "--i": i } as React.CSSProperties}>
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
          <div className="flex-1 space-y-2.5 pt-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-24 rounded bg-foreground/[0.08] animate-pulse" />
              <div className="h-3 w-14 rounded bg-foreground/[0.05] animate-pulse" />
            </div>
            <div className="h-3 w-full rounded bg-foreground/[0.06] animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-foreground/[0.06] animate-pulse" />
            <div className="h-3 w-2/5 rounded bg-foreground/[0.06] animate-pulse" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default FeedSkeleton;
