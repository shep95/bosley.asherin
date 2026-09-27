import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type RuleType = 'account_age' | 'follower_count' | 'following_count' | 'keyword' | 'temp_mute';

const RULE_LABELS: Record<RuleType, { label: string; description: string; placeholder: string }> = {
  account_age: { label: "new accounts", description: "hide accounts younger than a number of days.", placeholder: "days, e.g. 30" },
  follower_count: { label: "few followers", description: "hide accounts with fewer followers than this.", placeholder: "followers, e.g. 100" },
  following_count: { label: "mass following", description: "hide accounts following more people than this.", placeholder: "following, e.g. 5000" },
  keyword: { label: "words", description: "hide posts that contain any of these words.", placeholder: "comma-separated, e.g. crypto, nft" },
  temp_mute: { label: "mute for a while", description: "hide these words until the time runs out.", placeholder: "comma-separated words" },
};

/** Pattern rules that keep bots and noise out. Rows inside the settings document. */
const BlockRulesManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRuleType, setNewRuleType] = useState<RuleType>('keyword');
  const [ruleValue, setRuleValue] = useState("");
  const [muteDuration, setMuteDuration] = useState("48h");

  const { data: rules, isLoading } = useQuery({
    queryKey: ['block-rules', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('block_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user
  });

  const addRule = useMutation({
    mutationFn: async () => {
      if (!user || !ruleValue.trim()) return;

      let config: Record<string, any> = {};
      let expiresAt: string | null = null;

      switch (newRuleType) {
        case 'account_age':
          config = { min_days: parseInt(ruleValue) || 30 };
          break;
        case 'follower_count':
          config = { min_followers: parseInt(ruleValue) || 100 };
          break;
        case 'following_count':
          config = { max_following: parseInt(ruleValue) || 5000 };
          break;
        case 'keyword':
          config = { keywords: ruleValue.split(',').map(k => k.trim()).filter(Boolean) };
          break;
        case 'temp_mute': {
          config = { keywords: ruleValue.split(',').map(k => k.trim()).filter(Boolean) };
          const hours = muteDuration === '48h' ? 48 : muteDuration === '7d' ? 168 : muteDuration === '30d' ? 720 : 48;
          expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
          break;
        }
      }

      const { error } = await supabase.from('block_rules').insert({
        user_id: user.id,
        rule_type: newRuleType,
        rule_config: config,
        expires_at: expiresAt
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRuleValue("");
      queryClient.invalidateQueries({ queryKey: ['block-rules'] });
      toast({ title: "rule added" });
    }
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('block_rules').delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['block-rules'] });
      toast({ title: "rule removed" });
    }
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('block_rules').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['block-rules'] })
  });

  const formatRuleDisplay = (rule: any) => {
    const config = rule.rule_config;
    switch (rule.rule_type) {
      case 'account_age': return `accounts under ${config.min_days} days old`;
      case 'follower_count': return `accounts under ${config.min_followers} followers`;
      case 'following_count': return `accounts following over ${config.max_following}`;
      case 'keyword': return config.keywords?.join(', ');
      case 'temp_mute': return `muted: ${config.keywords?.join(', ')}`;
      default: return 'rule';
    }
  };

  const isNumeric = newRuleType === 'account_age' || newRuleType === 'follower_count' || newRuleType === 'following_count';
  const canAdd = !!ruleValue.trim() && !addRule.isPending;

  return (
    <>
      <div className="row px-5 sm:px-8 py-4">
        <p className="text-[15px] font-light text-foreground">block rules</p>
        <p className="mt-0.5 text-[13px] font-light text-foreground/50">
          keep bots and noise out by pattern. {RULE_LABELS[newRuleType].description}
        </p>
        <form
          className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4"
          onSubmit={(e) => { e.preventDefault(); if (canAdd) addRule.mutate(); }}
        >
          <Input
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder={RULE_LABELS[newRuleType].placeholder}
            aria-label={RULE_LABELS[newRuleType].label}
            inputMode={isNumeric ? "numeric" : undefined}
            className="w-full sm:flex-1 sm:min-w-0 h-9 sm:order-2"
            maxLength={200}
          />
          <div className="flex items-end gap-3 sm:gap-4 sm:contents">
            <Select value={newRuleType} onValueChange={(v) => { setNewRuleType(v as RuleType); setRuleValue(""); }}>
              <SelectTrigger className="h-9 flex-1 sm:flex-none sm:w-[150px] text-[14px] sm:order-1" aria-label="rule type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RULE_LABELS).map(([key, val]) => (
                  <SelectItem key={key} value={key}>{val.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newRuleType === 'temp_mute' && (
              <Select value={muteDuration} onValueChange={setMuteDuration}>
                <SelectTrigger className="h-9 w-[110px] text-[14px] sm:order-3" aria-label="for how long">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="48h">48 hours</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button type="submit" variant="signal" size="sm" disabled={!canAdd} className="shrink-0 sm:order-4">
              {addRule.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "add"}
            </Button>
          </div>
        </form>
      </div>

      {isLoading ? (
        <div className="row px-5 sm:px-8 py-4" aria-hidden>
          <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="stagger">
          {rules.map((rule: any, i: number) => {
            const meta = RULE_LABELS[rule.rule_type as RuleType];
            return (
              <div
                key={rule.id}
                style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
                className="row px-5 sm:px-8 py-3 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-light text-foreground truncate">{formatRuleDisplay(rule)}</p>
                  <p className="text-[12px] font-light text-foreground/40">
                    {meta?.label ?? rule.rule_type}
                    {rule.expires_at && <> · until {new Date(rule.expires_at).toLocaleDateString()}</>}
                  </p>
                </div>
                <Switch
                  aria-label={`rule ${formatRuleDisplay(rule)} on`}
                  checked={rule.is_active}
                  onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, active: checked })}
                />
                <button
                  type="button"
                  onClick={() => deleteRule.mutate(rule.id)}
                  className="quiet h-10 px-2 -mr-2 rounded-md text-[13px] shrink-0"
                >
                  remove
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
};

export default BlockRulesManager;
