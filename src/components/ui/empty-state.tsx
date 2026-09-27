import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
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
 * An empty screen should teach, not apologise. Every empty state states what
 * lives here, why it is blank, and offers exactly one way forward — removing
 * the dead-end that makes people abandon a section for good.
 */
const EmptyState = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  children,
}: EmptyStateProps) => (
  <div className="glass-card rounded-xl p-10 text-center">
    <div className="w-14 h-14 rounded-xl bg-foreground/5 border border-foreground/10 flex items-center justify-center mx-auto mb-4">
      <Icon className="w-6 h-6 text-foreground/40" />
    </div>
    <p className="text-foreground font-medium">{title}</p>
    <p className="text-foreground/55 text-sm mt-1.5 max-w-sm mx-auto leading-relaxed">
      {description}
    </p>
    {actionLabel && (actionTo || onAction) && (
      <div className="mt-5">
        {actionTo ? (
          <Button asChild className="rounded-xl bg-signal text-signal-foreground hover:bg-signal/90 press">
            <Link to={actionTo}>{actionLabel}</Link>
          </Button>
        ) : (
          <Button
            onClick={onAction}
            className="rounded-xl bg-signal text-signal-foreground hover:bg-signal/90 press"
          >
            {actionLabel}
          </Button>
        )}
      </div>
    )}
    {children}
  </div>
);

export default EmptyState;
