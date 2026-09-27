import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LucideIcon, ArrowUpRight } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  /** What is missing, in plain words. */
  title: string;
  /** One sentence that explains what this space is for. */
  description: string;
  /** The single next action a person can take from here. */
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  children?: ReactNode;
}

/**
 * An empty room says what it is for and offers one door. No illustration,
 * no apology, no box.
 */
const EmptyState = ({ title, description, actionLabel, actionTo, onAction, children }: EmptyStateProps) => (
  <div className="px-5 sm:px-8 py-14">
    <p className="text-[1.375rem] font-extralight lowercase tracking-[-0.02em] text-foreground">{title}</p>
    <p className="mt-2 text-[14px] font-light text-foreground/50 max-w-md leading-relaxed">{description}</p>
    {actionLabel && (actionTo || onAction) && (
      <div className="mt-6">
        {actionTo ? (
          <Link to={actionTo} className="inline-flex items-center gap-1.5 text-[14px] text-foreground hover:text-signal transition-colors">
            {actionLabel} <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button onClick={onAction} className="inline-flex items-center gap-1.5 text-[14px] text-foreground hover:text-signal transition-colors">
            {actionLabel} <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )}
    {children}
  </div>
);

export default EmptyState;
