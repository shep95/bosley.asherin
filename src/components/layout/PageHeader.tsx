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
 * The name of the room. Large, thin, lowercase; one muted line under it.
 * Not sticky: a title is read once, then it should get out of the way.
 */
const PageHeader = ({ title, subtitle, statusDot, statusLabel, actions, belowRow }: PageHeaderProps) => {
  return (
    <header className="px-5 sm:px-8 pt-16 lg:pt-10 pb-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] sm:text-[2rem] font-extralight lowercase tracking-[-0.03em] leading-none text-foreground truncate">
            {title}
          </h1>
          {(subtitle || statusLabel) && (
            <p className="mt-2.5 flex items-center gap-2 text-[13px] font-light text-foreground/50">
              {statusDot && <span className={`w-1 h-1 rounded-full ${statusDot}`} />}
              <span className="truncate">{statusLabel ?? subtitle}</span>
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1 flex-shrink-0 pb-0.5">{actions}</div>}
      </div>
      {belowRow && <div className="mt-6">{belowRow}</div>}
    </header>
  );
};

export default PageHeader;
