
CREATE TABLE public.post_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  post_id uuid,
  trigger_type text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_type text NOT NULL,
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  trigger_count integer NOT NULL DEFAULT 0,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_rules_user ON public.post_rules(user_id);
CREATE INDEX idx_post_rules_active ON public.post_rules(is_active) WHERE is_active = true;

ALTER TABLE public.post_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rules" ON public.post_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users create own rules" ON public.post_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own rules" ON public.post_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own rules" ON public.post_rules FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_post_rules_updated_at
  BEFORE UPDATE ON public.post_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.post_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.post_rules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  success boolean NOT NULL,
  error_message text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_rule_runs_rule ON public.post_rule_runs(rule_id);

ALTER TABLE public.post_rule_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own rule runs" ON public.post_rule_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "No client insert to rule runs" ON public.post_rule_runs FOR INSERT WITH CHECK (false);
