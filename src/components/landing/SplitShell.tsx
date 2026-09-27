import { ReactNode, Suspense, lazy, useEffect, useRef, useState, useCallback } from "react";
import { Menu, X, GripVertical } from "lucide-react";

// The live pane is closed on arrival, yet its whole dependency tree — post
// cards, polls, the video player, the storage client — used to ship inside the
// landing page's entry chunk. It now loads the first time someone opens it.
const EmbeddedFeed = lazy(() => import("@/components/landing/EmbeddedFeed"));

interface Props {
  children: ReactNode;
  onOpenAuth?: (tab: "login" | "signup") => void;
}

/**
 * Splits the landing page into a left landing pane and a right LIVE embedded
 * app pane. Desktop only. The divider is mouse-draggable so either side can be
 * scaled freely. Width changes are CSS transitions, so no animation runtime.
 */
const SplitShell = ({ children, onOpenAuth }: Props) => {
  const [open, setOpen] = useState(false);
  const [appWidthPct, setAppWidthPct] = useState(50);
  const dragging = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const vw = window.innerWidth;
    const fromRight = vw - e.clientX;
    const pct = Math.min(85, Math.max(20, (fromRight / vw) * 100));
    setAppWidthPct(pct);
  }, []);

  const stopDrag = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDrag);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [onMouseMove, stopDrag]);

  const startDrag = () => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // While dragging, transitions are off so the divider tracks the cursor 1:1.
  const paneTransition = dragging.current ? "none" : "width var(--dur-slow) var(--ease-out-soft)";

  return (
    <div className="flex w-screen min-h-screen overflow-hidden">
      {/* Landing pane */}
      <div
        style={{ width: open ? `${100 - appWidthPct}%` : "100%", transition: paneTransition }}
        className="relative overflow-y-auto overflow-x-hidden"
      >
        {children}
      </div>

      {/* Divider */}
      {open && (
        <div
          onMouseDown={startDrag}
          className="relative w-1.5 cursor-col-resize bg-foreground/5 hover:bg-foreground/15 transition-colors flex-shrink-0 z-40 group animate-in fade-in duration-200"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-12 rounded-md bg-foreground/10 backdrop-blur-md border border-foreground/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-3.5 h-3.5 text-foreground/70" />
          </div>
        </div>
      )}

      {/* App pane (real, live) */}
      <div
        style={{ width: open ? `${appWidthPct}%` : "0%", transition: paneTransition }}
        className="relative overflow-hidden border-l border-foreground/10"
      >
        {open && (
          <div className="h-screen sticky top-0 relative">
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/55 to-background/75 backdrop-blur-md pointer-events-none" />
            <Suspense
              fallback={
                <div className="h-full p-5 space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="glass-card rounded-lg h-28 animate-pulse" />
                  ))}
                </div>
              }
            >
              <EmbeddedFeed onOpenAuth={onOpenAuth} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Floating toggle — desktop only; the header owns the top-right on phones */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "close live app" : "open live app"}
        aria-expanded={open}
        className="hidden lg:flex fixed top-5 right-5 z-[60] glass rounded-xl h-11 w-11 items-center justify-center text-foreground/80 hover:text-foreground press transition-colors"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );
};

export default SplitShell;
