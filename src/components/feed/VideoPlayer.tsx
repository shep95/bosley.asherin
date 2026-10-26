import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Download, Loader2, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VideoPlayerProps {
  src: string;
  className?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer = ({ src, className = "" }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hideControlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { toast } = useToast();

  // A new source gets a fresh chance.
  useEffect(() => {
    setHasError(false);
    setIsLoading(true);
  }, [src]);

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto-hide controls when playing
  const resetHideTimeout = useCallback(() => {
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    setShowControls(true);
    if (isPlaying) {
      hideControlsTimeout.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideControlsTimeout.current) {
        clearTimeout(hideControlsTimeout.current);
      }
    } else {
      resetHideTimeout();
    }
  }, [isPlaying, resetHideTimeout]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
        // Auto-unmute when user clicks to play
        if (isMuted) {
          videoRef.current.muted = false;
          setIsMuted(false);
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (v && !isDragging) {
      setCurrentTime(v.currentTime);
      // Streams and some WebM files report NaN/Infinity until fully buffered.
      setProgress(Number.isFinite(v.duration) && v.duration > 0 ? (v.currentTime / v.duration) * 100 : 0);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      setDuration(Number.isFinite(d) ? d : 0);
      setIsLoading(false);
    }
  };

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
    setIsPlaying(false);
  };

  /** Seek to a fraction of the video, only when the duration is known. */
  const seekToPercent = (percent: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(duration) || duration <= 0) return;
    const newTime = (percent / 100) * duration;
    v.currentTime = newTime;
    setProgress(percent);
    setCurrentTime(newTime);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (progressRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      seekToPercent(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    }
  };

  const handleProgressDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && progressRef.current) {
      const rect = progressRef.current.getBoundingClientRect();
      seekToPercent(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    }
  };

  const handleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDownloading(true);
    let objectUrl: string | null = null;
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`download failed (${response.status})`);
      const blob = await response.blob();
      const mime = (blob.type || response.headers.get("content-type") || "").split(";")[0].trim();
      const ext = mime === "video/webm" ? "webm" : mime === "video/quicktime" ? "mov" : "mp4";
      objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `video-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "download started" });
    } catch {
      toast({ title: "download failed", variant: "destructive" });
    } finally {
      // Give the browser a moment to start the download before freeing the blob.
      if (objectUrl) {
        const url = objectUrl;
        setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
      }
      setIsDownloading(false);
    }
  };

  const handleMouseMove = () => {
    resetHideTimeout();
  };

  if (hasError) {
    return (
      <div
        className={`relative glass-inset rounded-[0.625rem] aspect-video flex items-center justify-center ${className}`}
        role="img"
        aria-label="video unavailable"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-light text-foreground/40">video unavailable</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`relative group rounded-[0.625rem] overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <Loader2 className="w-8 h-8 animate-spin text-white/70" />
        </div>
      )}
      
      <video
        ref={videoRef}
        src={src}
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-cover"
      />

      {/* Click to play/pause overlay */}
      <div 
        className={`absolute inset-0 flex items-center justify-center cursor-pointer transition-opacity duration-300 ${
          isPlaying && !showControls ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={togglePlay}
      >
        {!isPlaying && !isLoading && (
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110">
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        )}
      </div>

      {/* Controls overlay */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
        }`}
      >
        {/* Progress bar - Custom smooth slider */}
        <div 
          ref={progressRef}
          className="mb-2 h-1 bg-white/30 rounded-full cursor-pointer relative group/progress"
          onClick={handleProgressClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleProgressDrag}
        >
          {/* Progress fill */}
          <div 
            className="h-full bg-white rounded-full transition-all duration-75 ease-linear relative"
            style={{ width: `${progress}%` }}
          >
            {/* Thumb */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" />
          </div>
          {/* Hover preview bar */}
          <div className="absolute inset-0 h-1 group-hover/progress:h-1.5 transition-all rounded-full" />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={togglePlay}
              className="h-8 w-8 p-0 text-white hover:bg-white/20 hover:text-white"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMute}
              className="h-8 w-8 p-0 text-white hover:bg-white/20 hover:text-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>

            <span className="text-white/80 text-xs font-light ml-1">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Speed control */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-white hover:bg-white/20 hover:text-white text-xs font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  {playbackSpeed}x
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[80px] bg-black/90 border-white/20">
                {PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeedChange(speed);
                    }}
                    className={`text-white/80 hover:text-white hover:bg-white/20 justify-center ${
                      playbackSpeed === speed ? 'bg-white/20 text-white' : ''
                    }`}
                  >
                    {speed}x
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              disabled={isDownloading}
              className="h-8 w-8 p-0 text-white hover:bg-white/20 hover:text-white"
              title="Download video"
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFullscreen}
              className="h-8 w-8 p-0 text-white hover:bg-white/20 hover:text-white"
            >
              <Maximize className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
