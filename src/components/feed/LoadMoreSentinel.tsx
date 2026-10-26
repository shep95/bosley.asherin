import { useEffect, useRef } from "react";

/**
 * Bottom-of-list marker for paginated feeds. When it scrolls within reach the
 * next page loads; the visible "more" button is the fallback (and keyboard
 * path) when IntersectionObserver is unavailable or the page is short.
 */
const LoadMoreSentinel = ({
  hasMore,
  isLoading,
  onLoadMore,
  endLabel,
  isError = false,
}: {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  /** Shown once the server has returned a short page. Omit to show nothing. */
  endLabel?: string;
  isError?: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || isLoading || isError || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isLoading, isError]);

  if (!hasMore) {
    return endLabel ? (
      <p className="px-5 sm:px-8 py-6 text-[13px] font-light text-foreground/40">{endLabel}</p>
    ) : null;
  }

  return (
    <div ref={ref} className="px-5 sm:px-8 py-6">
      {isError ? (
        <button onClick={onLoadMore} className="text-[14px] text-foreground hover:text-signal transition-colors">
          could not load more. <span className="text-foreground/50">try again</span>
        </button>
      ) : (
        <button
          onClick={onLoadMore}
          disabled={isLoading}
          className="text-[14px] text-foreground hover:text-signal transition-colors disabled:text-foreground/40"
        >
          {isLoading ? "loading…" : "more"}
        </button>
      )}
    </div>
  );
};

export default LoadMoreSentinel;
