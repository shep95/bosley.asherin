import { Loader2 } from "lucide-react";

/** A quiet "more" at the foot of a paged list. Renders nothing when there is no next page. */
const LoadMoreButton = ({
  hasMore,
  loading,
  onClick,
  label = "more",
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  label?: string;
}) => {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center py-4">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="quiet h-10 px-3 rounded-md text-[13px] inline-flex items-center gap-2"
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {loading ? "loading…" : label}
      </button>
    </div>
  );
};

export default LoadMoreButton;
