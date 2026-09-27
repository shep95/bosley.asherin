import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock, LogIn, Key, Trash2, Triangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const ACTION_ICONS: Record<string, typeof LogIn> = {
  'login': LogIn,
  'login_failed': Triangle,
  'password_change': Key,
  'mfa_enroll': Triangle,
  'mfa_unenroll': Triangle,
  'account_delete': Trash2,
};

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
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-foreground/40" />
      </div>
    );
  }

  const displayLogs = showAll ? logs : logs?.slice(0, 5);

  if (!logs || logs.length === 0) {
    return (
      <p className="text-foreground/40 font-light text-sm text-center py-4">
        No activity recorded yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {displayLogs?.map((log: any) => {
        const Icon = ACTION_ICONS[log.action] || Clock;
        return (
          <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border/10 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="w-4 h-4 text-foreground/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-light text-foreground/80 capitalize">
                {log.action.replace(/_/g, ' ')}
              </p>
              {log.details && Object.keys(log.details).length > 0 && (
                <p className="text-xs text-foreground/40 font-light truncate">
                  {JSON.stringify(log.details)}
                </p>
              )}
              <p className="text-xs text-foreground/30 font-light mt-0.5">
                {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          </div>
        );
      })}
      
      {logs.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll(!showAll)}
          className="w-full font-light text-foreground/50"
        >
          {showAll ? 'Show less' : `Show all ${logs.length} entries`}
        </Button>
      )}
    </div>
  );
};

export default AuditLogViewer;
