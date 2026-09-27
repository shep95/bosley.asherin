import { useEffect, useState } from "react";
import VideoPlayer from "@/components/feed/VideoPlayer";
import { useStorageUrl, type StorageBucket } from "@/lib/storageUrl";

export default function StorageMedia({
  bucket,
  value,
  kind,
  className,
  imgClassName,
  alt,
  priority = false,
}: {
  bucket: StorageBucket;
  value: string;
  kind: "image" | "video";
  className?: string;
  imgClassName?: string;
  alt?: string;
  /** Set on the first above-the-fold media only; everything else stays lazy. */
  priority?: boolean;
}) {
  const resolvedUrl = useStorageUrl(bucket, value);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedUrl]);

  if (kind === "video") {
    // Videos resolve to a signed URL like images, but must never be handed an
    // empty src — an empty string makes the browser re-request the document.
    return resolvedUrl ? (
      <VideoPlayer src={resolvedUrl} className={className} />
    ) : (
      <div className={`glass-inset rounded-xl animate-pulse aspect-video ${className || ""}`} />
    );
  }

  // Media that no longer exists in storage should degrade to a quiet placeholder
  // rather than a broken-image glyph, which reads as a product defect.
  if (failed) {
    return (
      <div
        className={`glass-inset rounded-xl flex items-center justify-center py-10 ${imgClassName || className || ""}`}
        role="img"
        aria-label={alt || "Media unavailable"}
      >
        <span className="text-xs text-foreground/50">Media unavailable</span>
      </div>
    );
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
      onError={() => setFailed(true)}
    />
  );
}
