import { useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stripMetadata } from "@/lib/mediaSanitize";
import { validateUpload, extensionForMime, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES } from "@/lib/sanitize";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Bell, Eye, Image, X, MessageSquare, Palette, Users, Download, EyeOff, Smartphone, ShieldCheck, ScrollText, Ban, Filter, Layers } from "lucide-react";
import Brandmark from "@/components/Brandmark";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import AudienceCirclesManager from "@/components/privacy/AudienceCirclesManager";
import ProfileViewers from "@/components/privacy/ProfileViewers";
import AuditLogViewer from "@/components/privacy/AuditLogViewer";
import BlockRulesManager from "@/components/privacy/BlockRulesManager";
import KeywordFiltersManager from "@/components/privacy/KeywordFiltersManager";
import FeedProfilesManager from "@/components/feed/FeedProfilesManager";
import { MFAEnrollModal } from "@/components/auth/MFAModals";
import PageHeader from "@/components/layout/PageHeader";

const Settings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const { requestPermission, notificationPermission } = useNotifications();
  const [isExporting, setIsExporting] = useState(false);
  const [showMFAEnroll, setShowMFAEnroll] = useState(false);

  const { data: mfaFactors } = useQuery({
    queryKey: ['mfa-factors', user?.id],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return data;
    },
    enabled: !!user
  });

  const hasMFA = mfaFactors?.totp?.some(f => f.status === 'verified') ?? false;

  const handleUnenrollMFA = async () => {
    const totpFactor = mfaFactors?.totp?.find(f => f.status === 'verified');
    if (!totpFactor) return;
    
    const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactor.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "MFA Disabled", description: "Two-factor authentication has been removed." });
      queryClient.invalidateQueries({ queryKey: ['mfa-factors'] });
    }
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!data) {
        // Create default settings
        const { data: newSettings } = await supabase
          .from('user_settings')
          .insert({ user_id: user.id })
          .select()
          .single();
        return newSettings;
      }
      return data;
    },
    enabled: !!user
  });

  const { data: profile } = useQuery({
    queryKey: ['profile-settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('custom_background_url, message_wallpaper_url')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (!user) return;
      const { error } = await supabase
        .from('user_settings')
        .update(updates as any)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      toast({ title: "Settings saved" });
    }
  });

  const uploadBackground = async (file: File) => {
    if (!user) return;

    const validationError = await validateUpload(file, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES.background);
    if (validationError) {
      toast({ title: "Invalid file", description: validationError, variant: "destructive" });
      return;
    }

    const fileExt = extensionForMime(file.type);
    if (!fileExt) {
      toast({ title: "Invalid file", description: "That file type is not supported.", variant: "destructive" });
      return;
    }

    const clean = await stripMetadata(file);
    const fileName = `${user.id}/background-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('backgrounds')
      .upload(fileName, clean);
    
    if (uploadError) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('backgrounds')
      .getPublicUrl(fileName);
    
    await supabase
      .from('profiles')
      .update({ custom_background_url: publicUrl })
      .eq('user_id', user.id);
    
    queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
    queryClient.invalidateQueries({ queryKey: ['profile-background'] });
    toast({ title: "Background updated" });
  };

  const removeBackground = async () => {
    if (!user) return;
    
    await supabase
      .from('profiles')
      .update({ custom_background_url: null })
      .eq('user_id', user.id);
    
    queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
    queryClient.invalidateQueries({ queryKey: ['profile-background'] });
    toast({ title: "Background removed" });
  };

  const uploadMessageWallpaper = async (file: File) => {
    if (!user) return;

    const validationError = await validateUpload(file, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES.background);
    if (validationError) {
      toast({ title: "Invalid file", description: validationError, variant: "destructive" });
      return;
    }

    const fileExt = extensionForMime(file.type);
    if (!fileExt) {
      toast({ title: "Invalid file", description: "That file type is not supported.", variant: "destructive" });
      return;
    }

    const clean = await stripMetadata(file);
    const fileName = `${user.id}/message-wallpaper-${Date.now()}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('backgrounds')
      .upload(fileName, clean);
    
    if (uploadError) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('backgrounds')
      .getPublicUrl(fileName);
    
    await supabase
      .from('profiles')
      .update({ message_wallpaper_url: publicUrl })
      .eq('user_id', user.id);
    
    queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
    queryClient.invalidateQueries({ queryKey: ['profile-wallpaper'] });
    toast({ title: "Message wallpaper updated" });
  };

  const removeMessageWallpaper = async () => {
    if (!user) return;
    
    await supabase
      .from('profiles')
      .update({ message_wallpaper_url: null })
      .eq('user_id', user.id);
    
    queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
    queryClient.invalidateQueries({ queryKey: ['profile-wallpaper'] });
    toast({ title: "Message wallpaper removed" });
  };

  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({ title: "Notifications enabled" });
    } else {
      toast({ 
        title: "Permission denied", 
        description: "Please enable notifications in your browser settings",
        variant: "destructive" 
      });
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-data`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bosley-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({ title: "Data exported successfully" });
    } catch (error) {
      toast({ 
        title: "Export failed", 
        description: "Please try again later",
        variant: "destructive" 
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-foreground/60" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Settings"
        statusDot="bg-emerald-500"
        statusLabel="Your account, privacy and security"
      />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Custom Background */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Image className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Custom Background</h2>
            </div>
            
            <div className="space-y-4">
              {profile?.custom_background_url ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img 
                    src={profile.custom_background_url} 
                    alt="Custom background" 
                    className="w-full h-32 object-cover"
                  />
                  <button
                    onClick={removeBackground}
                    className="absolute top-2 right-2 glass-inset rounded-full p-1.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
              </div>
              ) : (
                <div className="border-2 border-dashed border-border/30 rounded-lg p-6 text-center">
                  <p className="text-foreground/50 font-light text-sm mb-3">
                    No custom background set
                  </p>
              </div>
              )}
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => e.target.files?.[0] && uploadBackground(e.target.files[0])}
                className="hidden"
              />
              <Button
                onClick={() => backgroundInputRef.current?.click()}
                variant="outline"
                className="w-full rounded-lg font-light"
              >
                <Image className="w-4 h-4 mr-2" />
                {profile?.custom_background_url ? 'Change Background' : 'Upload Background'}
              </Button>
            </div>
          </div>

          {/* Message Wallpaper */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Message Wallpaper</h2>
            </div>
            
            <div className="space-y-4">
              {profile?.message_wallpaper_url ? (
                <div className="relative rounded-lg overflow-hidden">
                  <img 
                    src={profile.message_wallpaper_url} 
                    alt="Message wallpaper" 
                    className="w-full h-32 object-cover"
                  />
                  <button
                    onClick={removeMessageWallpaper}
                    className="absolute top-2 right-2 glass-inset rounded-full p-1.5"
                  >
                    <X className="w-4 h-4" />
                  </button>
              </div>
              ) : (
                <div className="border-2 border-dashed border-border/30 rounded-lg p-6 text-center">
                  <p className="text-foreground/50 font-light text-sm mb-3">
                    No message wallpaper set
                  </p>
              </div>
              )}
              <input
                ref={wallpaperInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => e.target.files?.[0] && uploadMessageWallpaper(e.target.files[0])}
                className="hidden"
              />
              <Button
                onClick={() => wallpaperInputRef.current?.click()}
                variant="outline"
                className="w-full rounded-lg font-light"
              >
                <Palette className="w-4 h-4 mr-2" />
                {profile?.message_wallpaper_url ? 'Change Wallpaper' : 'Upload Wallpaper'}
              </Button>
              <p className="text-foreground/40 text-xs font-light">
                This wallpaper will appear as the background in your message conversations.
              </p>
            </div>
          </div>

          {/* Content Preferences */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Content Preferences</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-light">Show political content</Label>
                <Switch
                  checked={settings?.show_politics ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ show_politics: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-light">Show viral posts</Label>
                <Switch
                  checked={settings?.show_viral ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ show_viral: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-light">Hide insults</Label>
                <Switch
                  checked={settings?.hide_insults ?? false}
                  onCheckedChange={(checked) => updateSettings.mutate({ hide_insults: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-light">Hide political arguments</Label>
                <Switch
                  checked={settings?.hide_political_arguments ?? false}
                  onCheckedChange={(checked) => updateSettings.mutate({ hide_political_arguments: checked })}
                />
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Notifications</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-light">Enable notifications</Label>
                <Switch
                  checked={settings?.notifications_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ notifications_enabled: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-light">Browser notifications</Label>
                  <p className="text-foreground/50 text-xs font-light mt-0.5">
                    {notificationPermission === 'granted' 
                      ? 'Enabled - you will receive alerts for new messages'
                      : notificationPermission === 'denied'
                        ? 'Blocked - enable in browser settings'
                        : 'Click to enable push notifications'
                    }
                  </p>
                </div>
                {notificationPermission !== 'granted' && notificationPermission !== 'denied' && (
                  <Button
                    onClick={handleEnableNotifications}
                    size="sm"
                    variant="outline"
                    className="rounded-lg font-light"
                  >
                    Enable
                  </Button>
                )}
                {notificationPermission === 'granted' && (
                  <span className="text-green-500 text-sm font-light">Enabled</span>
                )}
              </div>
            </div>
          </div>

          {/* Messaging */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Messaging</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-light">Allow message requests</Label>
                  <p className="text-foreground/50 text-xs font-light mt-0.5">
                    When disabled, only people you follow can message you
                  </p>
                </div>
                <Switch
                  checked={settings?.message_requests_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ message_requests_enabled: checked })}
                />
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brandmark className="w-5 h-5 opacity-60" />
              <h2 className="text-lg font-light text-foreground">Privacy & Security</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-light flex items-center gap-2">
                    <EyeOff className="w-4 h-4" /> Stealth Mode
                  </Label>
                  <p className="text-foreground/50 text-xs font-light mt-0.5">
                    Browse profiles without appearing in their view history
                  </p>
                </div>
                <Switch
                  checked={settings?.stealth_mode ?? false}
                  onCheckedChange={(checked) => updateSettings.mutate({ stealth_mode: checked })}
                />
              </div>
              
              {/* Privacy Controls */}
              <div className="pt-3 border-t border-border/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-light">Read receipts</Label>
                    <p className="text-foreground/50 text-xs font-light mt-0.5">
                      Show when you've read messages
                    </p>
                  </div>
                  <Switch
                    checked={settings?.read_receipts_enabled ?? true}
                    onCheckedChange={(checked) => updateSettings.mutate({ read_receipts_enabled: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-light">Last seen</Label>
                    <p className="text-foreground/50 text-xs font-light mt-0.5">
                      Show when you were last active
                    </p>
                  </div>
                  <Switch
                    checked={settings?.last_seen_visible ?? true}
                    onCheckedChange={(checked) => updateSettings.mutate({ last_seen_visible: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-light">Online status</Label>
                    <p className="text-foreground/50 text-xs font-light mt-0.5">
                      Show when you're currently online
                    </p>
                  </div>
                  <Switch
                    checked={settings?.online_status_visible ?? true}
                    onCheckedChange={(checked) => updateSettings.mutate({ online_status_visible: checked })}
                  />
                </div>
              </div>

              {/* MFA Section */}
              <div className="pt-3 border-t border-border/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-light flex items-center gap-2">
                      <Smartphone className="w-4 h-4" /> Two-Factor Authentication
                    </Label>
                    <p className="text-foreground/50 text-xs font-light mt-0.5">
                      {hasMFA 
                        ? 'Your account is protected with TOTP authentication' 
                        : 'Add an extra layer of security with an authenticator app'}
                    </p>
                  </div>
                  {hasMFA ? (
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      <Button
                        onClick={handleUnenrollMFA}
                        size="sm"
                        variant="outline"
                        className="rounded-lg font-light text-destructive border-destructive/30"
                      >
                        Disable
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowMFAEnroll(true)}
                      size="sm"
                      variant="outline"
                      className="rounded-lg font-light"
                    >
                      Enable MFA
                    </Button>
                  )}
                </div>
              </div>
              
              <p className="text-foreground/60 font-light text-sm pt-2 border-t border-border/20">
                Your data is protected in transit with HTTPS and access is restricted by row-level security.
              </p>
            </div>
          </div>

          {/* Audience Circles */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Audience Circles</h2>
            </div>
            <p className="text-foreground/50 font-light text-sm mb-4">
              Create groups to control who can see your posts
            </p>
            <AudienceCirclesManager />
          </div>

          {/* Advanced Blocking */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Ban className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Advanced Blocking</h2>
            </div>
            <p className="text-foreground/50 font-light text-sm mb-4">
              Pattern-based blocking rules to filter out bots, spam, and unwanted accounts
            </p>
            <BlockRulesManager />
          </div>

          {/* Keyword Filters */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Keyword Filters</h2>
            </div>
            <p className="text-foreground/50 font-light text-sm mb-4">
              Hide posts containing specific words or patterns (supports regex)
            </p>
            <KeywordFiltersManager />
          </div>

          {/* Feed Profiles */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Feed Profiles</h2>
            </div>
            <p className="text-foreground/50 font-light text-sm mb-4">
              Save multiple timeline configurations for different contexts
            </p>
            <FeedProfilesManager />
          </div>

          {/* Profile Viewers */}
          <div className="glass-card rounded-xl p-6">
            <ProfileViewers />
          </div>

          {/* Data Export */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Your Data</h2>
            </div>
            <p className="text-foreground/50 font-light text-sm mb-4">
              Download all your data including posts, comments, likes, and settings
            </p>
            <Button
              onClick={handleExportData}
              disabled={isExporting}
              variant="outline"
              className="w-full rounded-lg font-light"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export My Data
                </>
              )}
            </Button>
          </div>

          {/* Activity Log */}
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <ScrollText className="w-5 h-5 text-foreground/60" />
              <h2 className="text-lg font-light text-foreground">Activity Log</h2>
            </div>
            <p className="text-foreground/50 font-light text-sm mb-4">
              View a record of security-relevant actions on your account
            </p>
            <AuditLogViewer />
          </div>
        </div>

        <MFAEnrollModal
          open={showMFAEnroll}
          onOpenChange={setShowMFAEnroll}
          onEnrolled={() => queryClient.invalidateQueries({ queryKey: ['mfa-factors'] })}
        />
      </div>
    </DashboardLayout>
  );
};

export default Settings;
