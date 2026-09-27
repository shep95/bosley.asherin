import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, Globe, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface AudienceSelectorProps {
  selectedCircleIds: string[];
  visibility: 'public' | 'circles';
  onSelectionChange: (circleIds: string[], visibility: 'public' | 'circles') => void;
}

const AudienceSelector = ({ selectedCircleIds, visibility, onSelectionChange }: AudienceSelectorProps) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { data: circles } = useQuery({
    queryKey: ['audience-circles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('audience_circles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!user
  });

  const handleCircleToggle = (circleId: string) => {
    const newSelection = selectedCircleIds.includes(circleId)
      ? selectedCircleIds.filter(id => id !== circleId)
      : [...selectedCircleIds, circleId];
    
    onSelectionChange(
      newSelection, 
      newSelection.length > 0 ? 'circles' : 'public'
    );
  };

  const handleSetPublic = () => {
    onSelectionChange([], 'public');
    setIsOpen(false);
  };

  const getLabel = () => {
    if (visibility === 'public' || selectedCircleIds.length === 0) {
      return 'Everyone';
    }
    if (selectedCircleIds.length === 1) {
      const circle = circles?.find(c => c.id === selectedCircleIds[0]);
      return circle?.name || '1 circle';
    }
    return `${selectedCircleIds.length} circles`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`gap-2 ${selectedCircleIds.length > 0 ? 'text-primary' : 'text-foreground/60 hover:text-foreground'}`}
        >
          {selectedCircleIds.length > 0 ? (
            <Lock className="w-4 h-4" />
          ) : (
            <Globe className="w-4 h-4" />
          )}
          <span className="text-xs hidden sm:inline">{getLabel()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 glass-panel border-border/30" align="start">
        <div className="p-4 space-y-4">
          <h4 className="font-light text-foreground">Who can see this?</h4>
          
          <button
            onClick={handleSetPublic}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              visibility === 'public' && selectedCircleIds.length === 0
                ? 'border-primary bg-primary/10'
                : 'border-border/30 hover:border-border/50'
            }`}
          >
            <Globe className="w-5 h-5 text-foreground/60" />
            <div className="text-left">
              <p className="font-light">Everyone</p>
              <p className="text-xs text-foreground/50">Visible to all users</p>
            </div>
          </button>

          {circles && circles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-foreground/50 font-light">Or select circles:</p>
              {circles.map((circle) => (
                <label
                  key={circle.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    selectedCircleIds.includes(circle.id)
                      ? 'border-primary bg-primary/10'
                      : 'border-border/30 hover:border-border/50'
                  }`}
                >
                  <Checkbox
                    checked={selectedCircleIds.includes(circle.id)}
                    onCheckedChange={() => handleCircleToggle(circle.id)}
                  />
                  <Users className="w-4 h-4 text-foreground/60" />
                  <span className="font-light">{circle.name}</span>
                </label>
              ))}
            </div>
          )}

          {(!circles || circles.length === 0) && (
            <p className="text-foreground/50 text-sm font-light text-center py-2">
              Create circles in Settings to limit post visibility
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AudienceSelector;
