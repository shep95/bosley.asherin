import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

const ACTION_LABELS: Record<string, string> = {
  login: "signed in",
  login_failed: "sign-in failed",
  password_change: "password changed",
  mfa_enroll: "two-factor turned on",
  mfa_unenroll: "two-factor turned off",
  account_delete: "account deleted",
  data_export: "data exported",
};

const PREVIEW = 5;

/**
 * Security events as plain rows: what happened, when, from where. Rendered
 * inline in the settings document, no card and no icons.
 */
const AuditLogViewer = () => {
  const { user } = useAuth();
  const [showAll, setShowAll] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-log', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('audit-log', {
        body: { action: 'list', limit: 50 }
      });
      if (error) throw error;
      return data?.logs || [];
    },
    enabled: !!user
  });

  if (isLoading) {
    return (
      <div aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="row px-5 sm:px-8 py-3 flex items-center justify-between gap-6">
            <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06] animate-pulse" />
            <div className="h-3 w-24 rounded bg-foreground/[0.06] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <p className="row px-5 sm:px-8 py-3 text-[13px] font-light text-foreground/40">
        nothing recorded yet.
      </p>
    );
  }

  const displayLogs = showAll ? logs : logs.slice(0, PREVIEW);

  return (
    <div className="stagger">
      {displayLogs.map((log: any, i: number) => {
        const label = ACTION_LABELS[log.action] ?? String(log.action).replace(/_/g, ' ');
        const details = log.details && Object.keys(log.details).length > 0 ? JSON.stringify(log.details) : null;
        return (
          <div
            key={log.id}
            style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
            className="row px-5 sm:px-8 py-3 flex items-baseline justify-between gap-6"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-light text-foreground/85">{label}</p>
              {(details || log.ip_address) && (
                <p className="text-[12px] font-light text-foreground/35 truncate">
                  {[log.ip_address, details].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <time
              dateTime={log.created_at}
              className="shrink-0 text-[12px] font-light text-foreground/40 tabular-nums whitespace-nowrap"
            >
              {format(new Date(log.created_at), 'd MMM, HH:mm')}
            </time>
          </div>
        );
      })}

      {logs.length > PREVIEW && (
        <div className="px-5 sm:px-8 py-3">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="text-[13px] font-light text-foreground/60 hover:text-foreground transition-colors"
          >
            {showAll ? "fewer" : "all"} <span className="text-foreground/35 tabular-nums ml-1">{logs.length}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditLogViewer;
