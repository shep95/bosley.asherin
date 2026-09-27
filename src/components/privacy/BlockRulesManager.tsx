import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Clock, Users, Calendar, Filter, Ban, Loader2, Triangle } from "lucide-react";

type RuleType = 'account_age' | 'follower_count' | 'following_count' | 'keyword' | 'temp_mute';

const RULE_LABELS: Record<RuleType, { label: string; icon: typeof Triangle; description: string }> = {
  account_age: { label: "Account Age", icon: Calendar, description: "Block accounts newer than X days" },
  follower_count: { label: "Follower Count", icon: Users, description: "Block accounts with fewer than X followers" },
  following_count: { label: "Following Count", icon: Users, description: "Block accounts following more than X people" },
  keyword: { label: "Keyword Filter", icon: Filter, description: "Block posts containing specific words" },
  temp_mute: { label: "Temporary Mute", icon: Clock, description: "Mute a keyword until a specific date" },
};

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
      toast({ title: "Rule added", description: "Block rule is now active." });
    }
  });

  const deleteRule = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('block_rules').delete().eq('id', ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['block-rules'] });
      toast({ title: "Rule removed" });
    }
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('block_rules').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['block-rules'] })
  });

  const getValuePlaceholder = () => {
    switch (newRuleType) {
      case 'account_age': return "Minimum account age in days (e.g. 30)";
      case 'follower_count': return "Minimum followers (e.g. 100)";
      case 'following_count': return "Maximum following (e.g. 5000)";
      case 'keyword': return "Keywords, comma-separated (e.g. crypto, NFT)";
      case 'temp_mute': return "Keywords to mute, comma-separated";
    }
  };

  const formatRuleDisplay = (rule: any) => {
    const config = rule.rule_config;
    switch (rule.rule_type) {
      case 'account_age': return `Accounts < ${config.min_days} days old`;
      case 'follower_count': return `Accounts < ${config.min_followers} followers`;
      case 'following_count': return `Accounts > ${config.max_following} following`;
      case 'keyword': return `Keywords: ${config.keywords?.join(', ')}`;
      case 'temp_mute': return `Muted: ${config.keywords?.join(', ')}`;
      default: return 'Unknown rule';
    }
  };

  return (
    <div className="space-y-4">
      {/* Add new rule */}
      <div className="space-y-3">
        <Select value={newRuleType} onValueChange={(v) => setNewRuleType(v as RuleType)}>
          <SelectTrigger className="glass-panel border rounded-lg font-light">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="glass-panel border">
            {Object.entries(RULE_LABELS).map(([key, val]) => (
              <SelectItem key={key} value={key} className="font-light">
                {val.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <p className="text-xs text-foreground/40 font-light">
          {RULE_LABELS[newRuleType].description}
        </p>

        <div className="flex gap-2">
          <Input
            value={ruleValue}
            onChange={(e) => setRuleValue(e.target.value)}
            placeholder={getValuePlaceholder()}
            className="glass-panel border rounded-lg font-light flex-1"
          />
          {newRuleType === 'temp_mute' && (
            <Select value={muteDuration} onValueChange={setMuteDuration}>
              <SelectTrigger className="glass-panel border rounded-lg font-light w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass-panel border">
                <SelectItem value="48h">48h</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={() => addRule.mutate()}
            disabled={!ruleValue.trim() || addRule.isPending}
            size="icon"
            className="rounded-lg bg-foreground text-background hover:bg-foreground/90 shrink-0"
          >
            {addRule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Active rules */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-foreground/40" />
        </div>
      ) : rules && rules.length > 0 ? (
        <div className="space-y-2">
          {rules.map((rule: any) => {
            const meta = RULE_LABELS[rule.rule_type as RuleType];
            const Icon = meta?.icon || Triangle;
            return (
              <div key={rule.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-accent/5 border border-border/10">
                <Icon className="w-4 h-4 text-foreground/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light text-foreground/70 truncate">
                    {formatRuleDisplay(rule)}
                  </p>
                  {rule.expires_at && (
                    <p className="text-xs text-foreground/30 font-light">
                      Expires: {new Date(rule.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, active: checked })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive/60 hover:text-destructive shrink-0"
                  onClick={() => deleteRule.mutate(rule.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-foreground/30 text-sm font-light text-center py-3">
          No block rules configured yet
        </p>
      )}
    </div>
  );
};

export default BlockRulesManager;
