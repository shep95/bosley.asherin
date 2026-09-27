import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>not here — bosley</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <img
        src={backgroundWallpaper}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="fixed inset-0 w-full h-full object-cover opacity-60 pointer-events-none select-none"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background/95" />

      <main className="relative z-10 min-h-screen flex items-end px-5 sm:px-8 lg:px-12 pb-16 sm:pb-24 pt-28">
        <div className="max-w-6xl mx-auto w-full">
          <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-8">404</p>
          <h1 className="text-[clamp(2.5rem,8vw,6.5rem)] font-extralight text-foreground leading-[0.95] tracking-[-0.045em] max-w-4xl">
            this room
            <br />
            <span className="font-thin text-foreground/70">is not here.</span>
          </h1>
          <p className="mt-10 text-foreground/55 font-light max-w-md leading-relaxed break-words">
            nothing lives at <span className="text-foreground/80">{location.pathname}</span>. the link may be old, or it
            was never public.
          </p>
          <div className="mt-10 pt-6 border-t border-foreground/10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-light">
            <Link to="/" className="inline-flex items-center gap-2 text-foreground hover:text-signal transition-colors">
              <ArrowLeft className="w-4 h-4" /> back to the front door
            </Link>
            <Link to="/dashboard" className="text-foreground/55 hover:text-foreground transition-colors">
              your feed
            </Link>
            <Link to="/contact" className="text-foreground/55 hover:text-foreground transition-colors">
              report a broken link
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
