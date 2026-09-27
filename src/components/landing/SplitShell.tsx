import { ReactNode, Suspense, lazy, useEffect, useRef, useState, useCallback } from "react";
import { Menu, X, GripVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
 * app pane. Triggered via a floating hamburger button. The divider is
 * mouse-draggable so users can scale either side freely.
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
      // Ensure we never leave the page stuck with drag styles if the component
      // unmounts mid-drag (e.g. SPA navigation while the pane is open).
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [onMouseMove, stopDrag]);

  const startDrag = () => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const landingWidth = open ? `${100 - appWidthPct}%` : "100%";
  const appWidth = open ? `${appWidthPct}%` : "0%";

  return (
    <div className="flex w-screen min-h-screen overflow-hidden">
      {/* Landing pane */}
      <motion.div
        animate={{ width: landingWidth }}
        transition={{ type: "spring", stiffness: 220, damping: 32 }}
        className="relative overflow-y-auto overflow-x-hidden"
      >
        {children}
      </motion.div>

      {/* Divider */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={startDrag}
            className="relative w-1.5 cursor-col-resize bg-foreground/5 hover:bg-foreground/15 transition-colors flex-shrink-0 z-40 group"
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-12 rounded-md bg-foreground/10 backdrop-blur-md border border-foreground/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-3.5 h-3.5 text-foreground/70" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App pane (real, live) */}
      <motion.div
        animate={{ width: appWidth }}
        transition={{ type: "spring", stiffness: 220, damping: 32 }}
        className="relative overflow-hidden border-l border-foreground/10"
      >
        {open && (
          <div className="h-screen sticky top-0 relative">
            {/* Subtle scrim so text stays legible over the shared wallpaper */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/55 to-background/75 backdrop-blur-md pointer-events-none" />
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                </div>
              }
            >
              <EmbeddedFeed onOpenAuth={onOpenAuth} />
            </Suspense>
          </div>
        )}
      </motion.div>

      {/* Floating toggle — always visible on top-right of landing area */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close live app" : "Open live app"}
        className="hidden lg:flex fixed top-5 right-5 z-[60] glass rounded-xl h-11 w-11 items-center justify-center text-foreground/80 hover:text-foreground hover:scale-105 active:scale-95 transition-all"
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );
};

export default SplitShell;