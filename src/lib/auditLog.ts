import { supabase } from "@/integrations/supabase/client";

export type AuditEvent =
  | "sign_in"
  | "password_changed"
  | "mfa_enabled"
  | "mfa_disabled"
  | "data_export";

/**
 * Record a security event for the signed-in user. Fire-and-forget: it never
 * throws, never blocks the UI, and a failure only means the activity list is
 * missing a line.
 */
export const logAuditEvent = (event: AuditEvent): void => {
  try {
    void supabase.functions
      .invoke("audit-log", { body: { action: "log", event } })
      .catch(() => { /* best effort */ });
  } catch {
    /* best effort */
  }
};
