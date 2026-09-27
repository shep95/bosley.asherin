import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface GlassHeaderProps {
  onOpenAuth?: (tab: "login" | "signup") => void;
}

/**
 * The header is a line, not a bar: a wordmark and two words. It only gains
 * a surface once content scrolls underneath it.
 */
const GlassHeader = ({ onOpenAuth }: GlassHeaderProps) => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openAuth = (tab: "login" | "signup") => {
    if (onOpenAuth) onOpenAuth(tab);
    else navigate("/", { state: { openAuth: tab } });
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ease-soft ${
        scrolled ? "bg-background/70 backdrop-blur-md border-b border-foreground/10" : "border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between">
        <Link to="/" className="text-foreground font-light text-[17px] tracking-[-0.01em]">
          Bosley
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => openAuth("login")}
            className="quiet h-9 px-3 rounded-md text-[14px] font-light"
          >
            sign in
          </button>
          <Button variant="signal" size="sm" onClick={() => openAuth("signup")} className="rounded-md h-9 px-4 text-[14px] font-medium">
            get started
          </Button>
        </nav>
      </div>
    </header>
  );
};

export default GlassHeader;
