import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface GlassHeaderProps {
  onOpenAuth?: (tab: "login" | "signup") => void;
}

const GlassHeader = ({ onOpenAuth }: GlassHeaderProps) => {
  const navigate = useNavigate();

  // Pages that do not host the AuthModal themselves (e.g. /contact, /for)
  // hand off to the landing page, which opens the modal from location state.
  const openAuth = (tab: "login" | "signup") => {
    if (onOpenAuth) {
      onOpenAuth(tab);
    } else {
      navigate("/", { state: { openAuth: tab } });
    }
  };

  return (
    <motion.header 
      className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left: Logo in its own glass container */}
        <Link to="/">
          <div className="glass rounded-2xl px-4 py-3 flex items-center">
            <span className="text-foreground font-light text-lg tracking-wide">
              Bosley
            </span>
          </div>
        </Link>

        {/* Right: Auth buttons in their own glass container */}
        <div className="glass rounded-2xl px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
          <Button 
            variant="ghost" 
            onClick={() => openAuth("login")}
            className="text-foreground/70 hover:text-foreground hover:bg-foreground/5 text-sm font-light h-9 px-3 sm:px-4 rounded-xl transition-all duration-300"
          >
            sign in
          </Button>
          <Button 
            onClick={() => openAuth("signup")}
            className="bg-foreground text-background hover:bg-foreground/90 text-sm font-medium h-9 px-4 sm:px-5 rounded-xl transition-all duration-300 shadow-lg shadow-foreground/10"
          >
            get started
          </Button>
        </div>
      </div>
    </motion.header>
  );
};

export default GlassHeader;
