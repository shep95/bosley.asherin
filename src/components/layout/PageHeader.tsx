import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional status dot color class, e.g. "bg-emerald-500" */
  statusDot?: string;
  /** Optional small status label shown after the dot */
  statusLabel?: string;
  /** Right-aligned action(s), e.g. button(s) */
  actions?: ReactNode;
  /** Optional secondary row rendered below the title row (e.g. tabs, search) */
  belowRow?: ReactNode;
}

/**
 * Sticky glass page header. Matches the Obsidian dashboard aesthetic:
 * tight title, optional encrypted-style status row, and an optional
 * secondary row for tabs / search / filters.
 */
const PageHeader = ({
  title,
  subtitle,
  statusDot,
  statusLabel,
  actions,
  belowRow,
}: PageHeaderProps) => {
  return (
    <div className="sticky top-0 z-20 page-header">
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em] text-foreground truncate">
            {title}
          </h1>
          {(subtitle || statusLabel) && (
            <div className="flex items-center gap-2 mt-0.5">
              {statusDot && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${statusDot}`}
                />
              )}
              {statusLabel && (
                <span className="text-[10px] text-foreground/55 uppercase font-medium tracking-[0.12em]">
                  {statusLabel}
                </span>
              )}
              {subtitle && !statusLabel && (
                <span className="text-xs text-foreground/60">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      {belowRow && <div className="px-6 pb-4">{belowRow}</div>}
    </div>
  );
};

export default PageHeader;