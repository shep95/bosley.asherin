import { Link } from "react-router-dom";
import { useReveal } from "@/hooks/useReveal";
import { Mail } from "lucide-react";
import Brandmark from "@/components/Brandmark";

const FooterSection = () => {
  const year = new Date().getFullYear();
  const ref = useReveal<HTMLElement>();
  return (
    <footer ref={ref} className="reveal px-4 sm:px-6 lg:px-10 pt-24 pb-10 border-t border-border/15 relative">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-12 mb-20">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <Brandmark className="w-5 h-5 opacity-80" />
              <span className="text-foreground font-light tracking-wide">Bosley</span>
            </div>
            <p className="text-foreground/70 font-light text-sm leading-relaxed">
              a quiet room on the internet. chronological feed. no ads.
            </p>
            <div className="flex items-center gap-3 mt-6">
              <a href="mailto:asher@bosley.app" className="quiet inline-flex items-center gap-2 text-[13px] font-light">
                <Mail className="w-3.5 h-3.5" /> asher@bosley.app
              </a>
            </div>
          </div>

          <nav className="grid grid-cols-3 gap-x-10 sm:gap-x-16 gap-y-3 text-sm font-light">
            {[
              { label: "who it is for", to: "/for" },
              { label: "writers", to: "/for/writers" },
              { label: "install", to: "/install" },
              { label: "privacy", to: "/privacy" },
              { label: "terms", to: "/terms" },
              { label: "contact", to: "/contact" },
            ].map((l) => (
              <Link key={l.label} to={l.to} className="text-foreground/55 hover:text-foreground transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="text-foreground/80 text-3xl sm:text-5xl md:text-6xl font-extralight tracking-[-0.03em] leading-[1.05] max-w-4xl">
          speak freely. <span className="text-foreground/60">quietly.</span>
        </p>

        <div className="mt-16 pt-6 border-t border-border/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-foreground/60 text-xs font-light">
          <p>© {year} Bosley · Founded Sept 5, 2024 · zorak corp</p>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/70" /> operational
          </span>
        </div>
      </div>
    </footer>
  );
};

export default FooterSection;
