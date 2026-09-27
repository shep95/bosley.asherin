import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import Brandmark from "@/components/Brandmark";

const blurFadeIn = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const FooterSection = () => {
  const year = new Date().getFullYear();
  return (
    <motion.footer
      className="px-4 sm:px-6 lg:px-10 pt-24 pb-10 border-t border-border/15 relative"
      variants={blurFadeIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
    >
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
              <a
                href="mailto:asher@bosley.app"
                className="w-9 h-9 rounded-full border border-border/30 flex items-center justify-center text-foreground/70 hover:text-foreground hover:border-foreground/40 transition-all"
                aria-label="email asher@bosley.app"
              >
                <Mail className="w-3.5 h-3.5" />
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
          Speak freely. <span className="text-foreground/60 italic">Quietly.</span>
        </p>

        <div className="mt-16 pt-6 border-t border-border/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-foreground/60 text-xs font-light">
          <p>© {year} Bosley · Founded Sept 5, 2024 · zorak corp</p>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground/70" /> operational
          </span>
        </div>
      </div>
    </motion.footer>
  );
};

export default FooterSection;
