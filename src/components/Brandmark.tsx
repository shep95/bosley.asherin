import brandmark from "@/assets/brandmark.webp";
import { cn } from "@/lib/utils";

interface BrandmarkProps {
  className?: string;
}

/**
 * Bosley brand mark — replaces the generic shield icon everywhere.
 * Renders the uploaded sacred-geometry triangle as a monochrome image
 * that inherits surrounding color via a CSS filter trick (white asset
 * already, so opacity carries the tint).
 */
const Brandmark = ({ className }: BrandmarkProps) => (
  <img
    src={brandmark}
    alt="Bosley"
    width={128}
    height={128}
    decoding="async"
    draggable={false}
    className={cn("inline-block select-none object-contain", className)}
  />
);

export default Brandmark;