import { ReactNode, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stripMetadata } from "@/lib/mediaSanitize";
import { validateUpload, extensionForMime, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES } from "@/lib/sanitize";
import { useStorageUrl } from "@/lib/storageUrl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
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

/* ------------------------------------------------------------------ */
/* Document furniture: an index, sections, one setting per row.        */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "account", label: "account" },
  { id: "appearance", label: "appearance" },
  { id: "feed", label: "feed" },
  { id: "notifications", label: "notifications" },
  { id: "messaging", label: "messaging" },
  { id: "privacy", label: "privacy" },
  { id: "security", label: "security" },
  { id: "data", label: "data" },
] as const;

const Section = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-label`} className="scroll-mt-14 lg:scroll-mt-4">
    <p
      id={`${id}-label`}
      className="px-5 sm:px-8 pt-10 pb-2 text-[11px] font-light uppercase tracking-[0.24em] text-foreground/35"
    >
      {label}
    </p>
    {children}
  </section>
);

const SettingRow = ({
  name,
  hint,
  control,
  htmlFor,
}: {
  name: ReactNode;
  hint?: ReactNode;
  control?: ReactNode;
  htmlFor?: string;
}) => (
  <div className="row px-5 sm:px-8 py-4 flex items-center justify-between gap-5">
    <div className="min-w-0 flex-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-[15px] font-light text-foreground cursor-pointer">
          {name}
        </label>
      ) : (
        <p className="text-[15px] font-light text-foreground">{name}</p>
      )}
      {hint && <p className="mt-0.5 text-[13px] font-light text-foreground/50 leading-relaxed">{hint}</p>}
    </div>
    {control && <div className="shrink-0 flex items-center gap-2 min-h-[40px]">{control}</div>}
  </div>
);

/** A 56px preview with a quiet change/remove pair. */
const ImageRow = ({
  name,
  hint,
  bucketValue,
  onChange,
  onRemove,
  inputRef,
  onFile,
}: {
  name: string;
  hint: string;
  bucketValue: string | null | undefined;
  onChange: () => void;
  onRemove: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (f: File) => void;
}) => {
  const src = useStorageUrl("backgrounds", bucketValue ?? null);
  return (
    <div className="row px-5 sm:px-8 py-4 flex items-center gap-4">
      <div className="w-14 h-14 rounded-md overflow-hidden bg-foreground/[0.06] shrink-0">
        {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-light text-foreground">{name}</p>
        <p className="mt-0.5 text-[13px] font-light text-foreground/50">{hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        className="hidden"
      />
      <div className="shrink-0 flex items-center gap-1 text-[14px]">
        <button type="button" onClick={onChange} className="quiet h-10 px-2 rounded-md">
          {bucketValue ? "change" : "add"}
        </button>
        {bucketValue && (
          <button type="button" onClick={onRemove} className="quiet h-10 px-2 rounded-md">
            remove
          </button>
        )}
      </div>
    </div>
  );
};

const SkeletonRows = ({ count = 8 }: { count?: number }) => (
  <div aria-hidden>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="row px-5 sm:px-8 py-5 flex items-center justify-between gap-6">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/3 rounded bg-foreground/[0.06] animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
        <div className="h-6 w-11 rounded-full bg-foreground/[0.06] animate-pulse" />
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ */

const Settings = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const { requestPermission, notificationPermission } = useNotifications();
  const [isExporting, setIsExporting] = useState(false);
  const [showMFAEnroll, setShowMFAEnroll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
      toast({ title: "could not turn off two-factor", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "two-factor is off" });
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
        .select('username, custom_background_url, message_wallpaper_url')
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
      toast({ title: "saved" });
    }
  });

  const uploadBackground = async (file: File) => {
    if (!user) return;

    const validationError = await validateUpload(file, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES.background);
    if (validationError) {
      toast({ title: "that file will not work", description: validationError, variant: "destructive" });
      return;
    }

    const fileExt = extensionForMime(file.type);
    if (!fileExt) {
      toast({ title: "that file will not work", description: "use a jpeg, png, gif or webp.", variant: "destructive" });
      return;
    }

    const clean = await stripMetadata(file);
    const fileName = `${user.id}/background-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('backgrounds')
      .upload(fileName, clean);

    if (uploadError) {
      toast({ title: "upload failed. try again.", variant: "destructive" });
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
    toast({ title: "background updated" });
  };

  const removeBackground = async () => {
    if (!user) return;

    await supabase
      .from('profiles')
      .update({ custom_background_url: null })
      .eq('user_id', user.id);

    queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
    queryClient.invalidateQueries({ queryKey: ['profile-background'] });
    toast({ title: "background removed" });
  };

  const uploadMessageWallpaper = async (file: File) => {
    if (!user) return;

    const validationError = await validateUpload(file, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZES.background);
    if (validationError) {
      toast({ title: "that file will not work", description: validationError, variant: "destructive" });
      return;
    }

    const fileExt = extensionForMime(file.type);
    if (!fileExt) {
      toast({ title: "that file will not work", description: "use a jpeg, png, gif or webp.", variant: "destructive" });
      return;
    }

    const clean = await stripMetadata(file);
    const fileName = `${user.id}/message-wallpaper-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('backgrounds')
      .upload(fileName, clean);

    if (uploadError) {
      toast({ title: "upload failed. try again.", variant: "destructive" });
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
    toast({ title: "message wallpaper updated" });
  };

  const removeMessageWallpaper = async () => {
    if (!user) return;

    await supabase
      .from('profiles')
      .update({ message_wallpaper_url: null })
      .eq('user_id', user.id);

    queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
    queryClient.invalidateQueries({ queryKey: ['profile-wallpaper'] });
    toast({ title: "message wallpaper removed" });
  };

  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast({ title: "browser notifications are on" });
    } else {
      toast({
        title: "the browser said no",
        description: "allow notifications for this site in your browser settings, then try again.",
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

      toast({ title: "your export is downloading" });
    } catch (error) {
      toast({
        title: "export failed",
        description: "try again in a moment.",
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const deleteMatches =
    !!profile?.username && deleteConfirmText.trim().toLowerCase() === profile.username.toLowerCase();

  const handleDeleteAccount = async () => {
    if (!user || !deleteMatches || isDeleting) return;
    setIsDeleting(true);
    try {
      // Server-side SECURITY DEFINER function: removes every row owned by
      // auth.uid() and the auth user itself. Nothing is passed from the client.
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;

      await signOut();
      queryClient.clear();
      toast({ title: "your account and data are gone." });
      navigate("/", { replace: true });
    } catch {
      toast({
        title: "could not delete the account",
        description: "try again in a moment.",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const jumpTo = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  const index = (
    <nav
      aria-label="sections"
      className="-mx-5 sm:-mx-8 px-5 sm:px-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)] sm:[mask-image:none]"
    >
      <ul className="flex items-center gap-x-5 text-[14px] font-light whitespace-nowrap">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={jumpTo(s.id)}
              className="inline-block py-2 text-foreground/50 hover:text-foreground transition-colors duration-150 ease-soft"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );

  const browserHint =
    notificationPermission === 'granted'
      ? 'on. you get an alert for new messages.'
      : notificationPermission === 'denied'
        ? 'blocked by the browser. allow it in site settings.'
        : 'ask the browser to show alerts for new messages.';

  return (
    <DashboardLayout>
      <PageHeader
        title="settings"
        subtitle="your account, what you see, who sees you."
        belowRow={index}
      />

      {isLoading ? (
        <SkeletonRows />
      ) : (
        <div className="pb-16">
          {/* account */}
          <Section id="account" label="account">
            <SettingRow
              name={profile?.username ? `@${profile.username}` : "your profile"}
              hint="name, bio, avatar and links live on your profile."
              control={
                <Link to="/profile" className="quiet h-10 px-2 inline-flex items-center rounded-md text-[14px]">
                  edit profile
                </Link>
              }
            />
            <SettingRow
              name="email"
              hint={<span className="break-all">{user?.email ?? "—"}</span>}
            />
            <SettingRow
              name="this device"
              hint="signed in here. leaving only ends this session."
              control={
                <button
                  type="button"
                  onClick={async () => { await signOut(); navigate("/"); }}
                  className="quiet h-10 px-2 rounded-md text-[14px]"
                >
                  sign out
                </button>
              }
            />
          </Section>

          {/* appearance */}
          <Section id="appearance" label="appearance">
            <ImageRow
              name="background"
              hint="behind every room. yours only."
              bucketValue={profile?.custom_background_url}
              inputRef={backgroundInputRef}
              onFile={uploadBackground}
              onChange={() => backgroundInputRef.current?.click()}
              onRemove={removeBackground}
            />
            <ImageRow
              name="message wallpaper"
              hint="behind your conversations."
              bucketValue={profile?.message_wallpaper_url}
              inputRef={wallpaperInputRef}
              onFile={uploadMessageWallpaper}
              onChange={() => wallpaperInputRef.current?.click()}
              onRemove={removeMessageWallpaper}
            />
          </Section>

          {/* feed */}
          <Section id="feed" label="feed">
            <SettingRow
              htmlFor="s-politics"
              name="political posts"
              hint="show them in latest and for you."
              control={
                <Switch
                  id="s-politics"
                  checked={settings?.show_politics ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ show_politics: checked })}
                />
              }
            />
            <SettingRow
              htmlFor="s-viral"
              name="viral posts"
              hint="show posts that are travelling fast."
              control={
                <Switch
                  id="s-viral"
                  checked={settings?.show_viral ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ show_viral: checked })}
                />
              }
            />
            <SettingRow
              htmlFor="s-insults"
              name="hide insults"
              hint="posts that mostly attack someone stay out."
              control={
                <Switch
                  id="s-insults"
                  checked={settings?.hide_insults ?? false}
                  onCheckedChange={(checked) => updateSettings.mutate({ hide_insults: checked })}
                />
              }
            />
            <SettingRow
              htmlFor="s-arguments"
              name="hide political arguments"
              hint="long back-and-forth threads stay out."
              control={
                <Switch
                  id="s-arguments"
                  checked={settings?.hide_political_arguments ?? false}
                  onCheckedChange={(checked) => updateSettings.mutate({ hide_political_arguments: checked })}
                />
              }
            />
            <FeedProfilesManager />
          </Section>

          {/* notifications */}
          <Section id="notifications" label="notifications">
            <SettingRow
              htmlFor="s-notifs"
              name="notifications"
              hint="likes, replies, follows and mentions."
              control={
                <Switch
                  id="s-notifs"
                  checked={settings?.notifications_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ notifications_enabled: checked })}
                />
              }
            />
            <SettingRow
              name="browser alerts"
              hint={browserHint}
              control={
                notificationPermission === 'granted' ? (
                  <span className="text-[13px] font-light text-foreground/50">on</span>
                ) : notificationPermission === 'denied' ? (
                  <span className="text-[13px] font-light text-foreground/50">blocked</span>
                ) : (
                  <button type="button" onClick={handleEnableNotifications} className="quiet h-10 px-2 rounded-md text-[14px]">
                    turn on
                  </button>
                )
              }
            />
          </Section>

          {/* messaging */}
          <Section id="messaging" label="messaging">
            <SettingRow
              htmlFor="s-requests"
              name="message requests"
              hint="off means only people you follow can message you."
              control={
                <Switch
                  id="s-requests"
                  checked={settings?.message_requests_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ message_requests_enabled: checked })}
                />
              }
            />
            <SettingRow
              htmlFor="s-receipts"
              name="read receipts"
              hint="others see when you have read them."
              control={
                <Switch
                  id="s-receipts"
                  checked={settings?.read_receipts_enabled ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ read_receipts_enabled: checked })}
                />
              }
            />
          </Section>

          {/* privacy */}
          <Section id="privacy" label="privacy">
            <SettingRow
              htmlFor="s-stealth"
              name="stealth"
              hint="browse profiles without appearing in their viewers."
              control={
                <Switch
                  id="s-stealth"
                  checked={settings?.stealth_mode ?? false}
                  onCheckedChange={(checked) => updateSettings.mutate({ stealth_mode: checked })}
                />
              }
            />
            <SettingRow
              htmlFor="s-lastseen"
              name="last seen"
              hint="show when you were last here."
              control={
                <Switch
                  id="s-lastseen"
                  checked={settings?.last_seen_visible ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ last_seen_visible: checked })}
                />
              }
            />
            <SettingRow
              htmlFor="s-online"
              name="online now"
              hint="show a dot while you are here."
              control={
                <Switch
                  id="s-online"
                  checked={settings?.online_status_visible ?? true}
                  onCheckedChange={(checked) => updateSettings.mutate({ online_status_visible: checked })}
                />
              }
            />
            <AudienceCirclesManager />
            <BlockRulesManager />
            <KeywordFiltersManager />
            <div className="row px-5 sm:px-8 py-4">
              <ProfileViewers />
            </div>
          </Section>

          {/* security */}
          <Section id="security" label="security">
            <SettingRow
              name="two-factor"
              hint={hasMFA ? "on. a code from your authenticator app is needed to sign in." : "ask for a code from an authenticator app at sign in."}
              control={
                hasMFA ? (
                  <button type="button" onClick={handleUnenrollMFA} className="quiet h-10 px-2 rounded-md text-[14px]">
                    turn off
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowMFAEnroll(true)}
                    className="h-10 px-2 rounded-md text-[14px] font-light text-foreground/80 hover:text-foreground transition-colors"
                  >
                    turn on
                  </button>
                )
              }
            />
            <SettingRow
              name="sessions"
              hint="you are signed out after 15 minutes idle. sign out under account to end this device now."
            />
            <SettingRow name="activity" hint="sign-ins, password changes and other security events on this account." />
            <AuditLogViewer />
          </Section>

          {/* data */}
          <Section id="data" label="data">
            <SettingRow
              name="export everything"
              hint="posts, replies, likes, messages and settings as one json file."
              control={
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={isExporting}
                  aria-busy={isExporting}
                  className="quiet h-10 px-2 rounded-md text-[14px] inline-flex items-center gap-2 disabled:opacity-100"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      preparing…
                    </>
                  ) : (
                    "export"
                  )}
                </button>
              }
            />
            <div className="row px-5 sm:px-8 py-4">
              <div className="flex items-center justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-light text-foreground">delete account</p>
                  <p className="mt-0.5 text-[13px] font-light text-foreground/50 leading-relaxed">
                    removes your profile, posts, messages, media and settings. this cannot be undone. export first if you want a copy.
                  </p>
                </div>
                {!showDeleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="shrink-0 h-10 px-2 rounded-md text-[14px] font-light text-destructive/80 hover:text-destructive transition-colors"
                  >
                    delete
                  </button>
                )}
              </div>

              {showDeleteConfirm && (
                <form
                  className="mt-4 max-w-sm"
                  onSubmit={(e) => { e.preventDefault(); handleDeleteAccount(); }}
                >
                  <label htmlFor="delete-confirm" className="block text-[13px] font-light text-foreground/60">
                    type <span className="text-foreground">{profile?.username ?? "your username"}</span> to confirm
                  </label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder={profile?.username ?? "your_username"}
                    autoComplete="off"
                    autoFocus
                    maxLength={30}
                    className="mt-1"
                  />
                  <div className="mt-4 flex items-center gap-4">
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      disabled={!deleteMatches || isDeleting}
                      className="px-0 hover:bg-transparent"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          deleting…
                        </>
                      ) : (
                        "delete everything"
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                      disabled={isDeleting}
                      className="quiet text-[14px] h-8 px-1 rounded-md"
                    >
                      cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </Section>
        </div>
      )}

      <MFAEnrollModal
        open={showMFAEnroll}
        onOpenChange={setShowMFAEnroll}
        onEnrolled={() => queryClient.invalidateQueries({ queryKey: ['mfa-factors'] })}
      />
    </DashboardLayout>
  );
};

export default Settings;
