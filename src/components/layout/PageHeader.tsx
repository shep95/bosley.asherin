import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional status dot color class, e.g. "bg-signal" */
  statusDot?: string;
  /** Optional small status label shown after the dot */
  statusLabel?: string;
  /** Right-aligned action(s), e.g. button(s) */
  actions?: ReactNode;
  /** Optional secondary row rendered below the title row (e.g. tabs, search) */
  belowRow?: ReactNode;
}

/**
 * The name of the room, set in the display serif like a printed title, with
 * one muted line under it. Not sticky: a title is read once, then it should
 * get out of the way.
 */
const PageHeader = ({ title, subtitle, statusDot, statusLabel, actions, belowRow }: PageHeaderProps) => {
  return (
    <header className="px-5 sm:px-8 pt-16 lg:pt-10 pb-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] min-[360px]:text-[2.25rem] sm:text-[2.6rem] lowercase leading-[0.95] text-foreground truncate">
            {title}
          </h1>
          {(subtitle || statusLabel) && (
            <p className="mt-3 flex items-start gap-2 text-[13px] font-light text-foreground/50 tracking-[0.005em]">
              {statusDot && <span className={`mt-2 w-1 h-1 flex-shrink-0 rounded-full ${statusDot}`} />}
              <span className="line-clamp-2">{statusLabel ?? subtitle}</span>
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1 flex-shrink-0 pb-0.5">{actions}</div>}
      </div>
      {belowRow && <div className="mt-7">{belowRow}</div>}
    </header>
  );
};

export default PageHeader;
