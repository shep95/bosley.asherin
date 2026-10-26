import { useEffect, useState } from "react";
import VideoPlayer from "@/components/feed/VideoPlayer";
import { useStorageUrlState, type StorageBucket } from "@/lib/storageUrl";

/** Quiet, static tile for media that cannot be shown. No pulse: nothing is coming. */
const Unavailable = ({ className, label }: { className: string; label: string }) => (
  <div
    className={`glass-inset rounded-xl flex items-center justify-center ${className}`}
    role="img"
    aria-label={label}
  >
    <span className="text-xs font-light text-foreground/40">media unavailable</span>
  </div>
);

export default function StorageMedia({
  bucket,
  value,
  kind,
  className,
  imgClassName,
  alt,
  priority = false,
  aspectClassName,
}: {
  bucket: StorageBucket;
  value: string;
  kind: "image" | "video";
  className?: string;
  imgClassName?: string;
  alt?: string;
  /** Set on the first above-the-fold media only; everything else stays lazy. */
  priority?: boolean;
  /**
   * A fixed aspect-ratio box (e.g. "aspect-[4/3]") the image fills. The box is
   * the same size while signing, loaded, or failed, so nothing reflows (CLS).
   */
  aspectClassName?: string;
}) {
  const { url: resolvedUrl, status } = useStorageUrlState(bucket, value);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedUrl]);

  const unavailable = failed || status === "failed" || status === "empty";

  if (kind === "video") {
    // Videos must never be handed an empty src — an empty string makes the
    // browser re-request the document.
    if (unavailable) return <Unavailable className={`aspect-video ${className || ""}`} label={alt || "video unavailable"} />;
    return resolvedUrl ? (
      <VideoPlayer src={resolvedUrl} className={className} />
    ) : (
      <div className={`glass-inset rounded-xl animate-pulse aspect-video ${className || ""}`} />
    );
  }

  if (aspectClassName) {
    return (
      <div className={`relative overflow-hidden rounded-md ${aspectClassName} ${className || ""}`}>
        {unavailable ? (
          <Unavailable className="absolute inset-0" label={alt || "image unavailable"} />
        ) : !resolvedUrl ? (
          <div className="absolute inset-0 glass-inset animate-pulse" />
        ) : (
          <img
            src={resolvedUrl}
            alt={alt || ""}
            className={`absolute inset-0 w-full h-full object-cover ${imgClassName || ""}`}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "low"}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    );
  }

  // Media that no longer exists in storage should degrade to a quiet placeholder
  // rather than a broken-image glyph, which reads as a product defect.
  if (unavailable) {
    return <Unavailable className={`aspect-[4/3] ${imgClassName || className || ""}`} label={alt || "image unavailable"} />;
  }

  // Reserve the box while the URL is being signed so the feed does not reflow
  // under the reader's cursor when images land (CLS).
  if (!resolvedUrl) {
    return <div className={`glass-inset rounded-xl animate-pulse aspect-[4/3] ${imgClassName || className || ""}`} />;
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt || ""}
      className={imgClassName || className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
