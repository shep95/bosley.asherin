import { ReactNode } from "react";
import GlassHeader from "@/components/GlassHeader";
import FooterSection from "@/components/landing/FooterSection";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";

interface Props {
  children: ReactNode;
  /** Narrow reading column (documents) or full width (landing). */
  width?: "narrow" | "wide";
  onOpenAuth?: (tab: "login" | "signup") => void;
  footer?: boolean;
}

/**
 * Every signed-out page is the same room: cooled wallpaper, a thin header,
 * a reading column, the footer. Pages bring only their words.
 */
const PublicShell = ({ children, width = "narrow", onOpenAuth, footer = true }: Props) => (
  <div className="min-h-screen bg-background relative overflow-x-hidden">
    <img
      src={backgroundWallpaper}
      alt=""
      aria-hidden="true"
      fetchPriority="high"
      decoding="async"
      className="wallpaper fixed inset-0 w-full h-full object-cover pointer-events-none select-none"
    />
    <div className="wallpaper-scrim fixed inset-0" />
    <div className="relative z-10">
      <GlassHeader onOpenAuth={onOpenAuth} />
      {width === "narrow" ? (
        <main className="pt-32 pb-24 px-5 sm:px-8">
          <div className="max-w-2xl mx-auto">{children}</div>
        </main>
      ) : (
        <main>{children}</main>
      )}
      {footer && <FooterSection />}
    </div>
  </div>
);

export default PublicShell;
