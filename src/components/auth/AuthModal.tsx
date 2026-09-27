import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { isTemporaryEmail } from "@/lib/tempEmailDomains";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Brandmark from "@/components/Brandmark";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { MFAVerifyModal } from "./MFAModals";
import Turnstile, { TURNSTILE_ENABLED } from "./Turnstile";
import { supabase } from "@/integrations/supabase/client";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "signup";
}

/** One line of red under the field it belongs to. */
const FieldError = ({ id, children }: { id: string; children?: string }) =>
  children ? (
    <p id={id} role="alert" className="mt-1.5 text-[12px] font-light text-destructive">
      {children}
    </p>
  ) : null;

const AuthModal = ({ open, onOpenChange, defaultTab = "login" }: AuthModalProps) => {
  const [tab, setTab] = useState<string>(defaultTab);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showMFA, setShowMFA] = useState(false);
  const [view, setView] = useState<"auth" | "reset" | "confirm">("auth");
  const [resetEmail, setResetEmail] = useState("");
  // undefined = captcha not configured; null = waiting for a token; string = ready
  const [captchaToken, setCaptchaToken] = useState<string | null | undefined>(TURNSTILE_ENABLED ? null : undefined);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);

  const { signUp, signIn, clearMfaRequired, resetPassword, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setErrors({});
    // The widget remounts with the tab, so any old token is void.
    if (TURNSTILE_ENABLED) setCaptchaToken(null);
  };

  // Turnstile tokens are single-use: after any failed attempt the widget must
  // issue a new one before the next submit.
  const resetCaptcha = () => {
    if (!TURNSTILE_ENABLED) return;
    setCaptchaToken(null);
    setCaptchaResetKey((k) => k + 1);
  };

  const captchaBlocked = TURNSTILE_ENABLED && !captchaToken;

  // Clear a field's error as soon as the person starts fixing it.
  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const validateSignUp = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!username.trim()) {
      newErrors.username = "pick a username";
    } else if (username.length < 3) {
      newErrors.username = "at least 3 characters";
    } else if (username.length > 30) {
      newErrors.username = "30 characters at most";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      newErrors.username = "letters, numbers and underscores only";
    }

    if (!email.trim()) {
      newErrors.email = "enter your email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "that does not look like an email";
    } else if (isTemporaryEmail(email)) {
      newErrors.email = "temporary addresses do not work here. use one you keep.";
    }

    if (!password) {
      newErrors.password = "choose a password";
    } else if (password.length < 12) {
      newErrors.password = "at least 12 characters";
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = "add an uppercase letter";
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = "add a lowercase letter";
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = "add a number";
    } else if (!/[^A-Za-z0-9]/.test(password)) {
      newErrors.password = "add a symbol";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "the passwords do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignUp()) return;

    if (captchaBlocked) return;

    setLoading(true);
    const { error, needsConfirmation } = await signUp(email, password, username, captchaToken ?? undefined);
    setLoading(false);

    if (error) {
      resetCaptcha();
      toast({ title: "could not create the account", description: error, variant: "destructive" });
    } else if (needsConfirmation) {
      setView("confirm");
    } else {
      toast({ title: "welcome to Bosley" });
      onOpenChange(false);
      navigate("/dashboard");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {[key: string]: string} = {};
    if (!email.trim()) newErrors.email = "enter your email";
    if (!password) newErrors.password = "enter your password";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    if (captchaBlocked) return;

    setLoading(true);
    const { error, mfaRequired, unconfirmed } = await signIn(email, password, captchaToken ?? undefined);
    setLoading(false);

    if (error) {
      resetCaptcha();
      toast({ title: "could not sign in", description: error, variant: "destructive" });
    } else if (unconfirmed) {
      resetCaptcha();
      setView("confirm");
    } else if (mfaRequired) {
      setShowMFA(true);
    } else {
      toast({ title: "welcome back" });
      onOpenChange(false);
      navigate("/dashboard");
    }
  };

  const handleMFAVerified = async () => {
    setShowMFA(false);
    // Re-checks the session's assurance level; only clears once it is aal2.
    await clearMfaRequired();
    toast({ title: "welcome back" });
    onOpenChange(false);
    navigate("/dashboard");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setErrors({ resetEmail: "enter your email" });
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(resetEmail);
    setLoading(false);

    if (error) {
      toast({ title: "could not send the link", description: error, variant: "destructive" });
      return;
    }

    // Deliberately neutral: never confirm whether the address has an account.
    toast({ title: "check your inbox", description: "if that email has an account, a reset link is on its way." });
    setResetEmail("");
    setView("auth");
  };

  const openReset = () => {
    // Carry over whatever they already typed so they don't have to retype it.
    setResetEmail(email);
    setErrors({});
    setView("reset");
  };

  const handleGoogle = async () => {
    setLoading(true);
    // Native Supabase OAuth (PKCE). The provider must be enabled in
    // Supabase → Authentication → Providers → Google, and the site's origin
    // added to the redirect allow-list.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/dashboard",
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setLoading(false);
      toast({ title: "google sign-in failed", description: "try again.", variant: "destructive" });
    }
    // On success the browser navigates away to Google; nothing more to do here.
  };

  const canSignIn = !!email.trim() && !!password && !loading && !captchaBlocked;
  const canSignUp = !!username.trim() && !!email.trim() && !!password && !!confirmPassword && !loading && !captchaBlocked;

  const eyeButton = (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      aria-label={showPassword ? "hide password" : "show password"}
      aria-pressed={showPassword}
      className="quiet absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-md"
    >
      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <>
      <Dialog open={open && !showMFA} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px] p-6 sm:p-8 gap-0">
          <div className="flex items-center gap-2 mb-6">
            <Brandmark className="w-5 h-5 opacity-80" />
            <span className="text-foreground font-light text-[15px]">Bosley</span>
          </div>

          {view === "confirm" ? (
            <div className="space-y-5">
              <div>
                <DialogTitle className="text-[22px] font-extralight tracking-[-0.02em]">check your inbox</DialogTitle>
                <DialogDescription className="mt-2 text-[14px] leading-relaxed">
                  we sent a confirmation link to <span className="text-foreground/85">{email}</span>. open it once
                  and you are in. until then, sign-in stays closed for this address.
                </DialogDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await resendConfirmation(email);
                  toast({ title: "sent", description: "if that address has an account, a new link is on its way." });
                }}
              >
                send the link again
              </Button>
              <button
                type="button"
                onClick={() => setView("auth")}
                className="quiet block w-full text-center text-[13px] py-2"
              >
                back to sign in
              </button>
            </div>
          ) : view === "reset" ? (
            <form onSubmit={handleResetPassword} className="space-y-5" noValidate>
              <div>
                <DialogTitle className="text-[22px] font-extralight tracking-[-0.02em]">reset your password</DialogTitle>
                <DialogDescription className="mt-2 text-[14px] leading-relaxed">
                  enter your email and we will send a link to choose a new one.
                </DialogDescription>
              </div>
              <div>
                <Label htmlFor="reset-email">email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => { setResetEmail(e.target.value); clearError("resetEmail"); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={255}
                  autoFocus
                  aria-invalid={!!errors.resetEmail}
                  aria-describedby={errors.resetEmail ? "reset-email-error" : undefined}
                />
                <FieldError id="reset-email-error">{errors.resetEmail}</FieldError>
              </div>
              <Button type="submit" variant="signal" disabled={loading || !resetEmail.trim()} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => setView("auth")}
                className="quiet block w-full text-center text-[13px] py-2"
              >
                back to sign in
              </button>
            </form>
          ) : (
            <Tabs value={tab} onValueChange={(v) => { setTab(v); resetForm(); }} className="w-full">
              <DialogTitle className="sr-only">{tab === "login" ? "sign in" : "create an account"}</DialogTitle>
              <DialogDescription className="sr-only">sign in to Bosley or create an account.</DialogDescription>
              <TabsList className="mb-6" aria-label="sign in or sign up">
                <TabsTrigger value="login" className="text-[15px]">sign in</TabsTrigger>
                <TabsTrigger value="signup" className="text-[15px]">sign up</TabsTrigger>
              </TabsList>

              <Button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                variant="outline"
                className="w-full gap-3"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/>
                </svg>
                continue with Google
              </Button>
              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-foreground/10" />
                <span className="text-[11px] text-foreground/35 font-light">or</span>
                <div className="h-px flex-1 bg-foreground/10" />
              </div>

              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleSignIn} className="space-y-5" noValidate>
                  <div>
                    <Label htmlFor="login-email">email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      maxLength={255}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "login-email-error" : undefined}
                    />
                    <FieldError id="login-email-error">{errors.email}</FieldError>
                  </div>

                  <div>
                    <Label htmlFor="login-password">password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                        placeholder="••••••••••••"
                        className="pr-10"
                        autoComplete="current-password"
                        maxLength={256}
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "login-password-error" : undefined}
                      />
                      {eyeButton}
                    </div>
                    <FieldError id="login-password-error">{errors.password}</FieldError>
                  </div>

                  <Turnstile onToken={setCaptchaToken} resetKey={captchaResetKey} action="login" />

                  <Button type="submit" variant="signal" disabled={!canSignIn} className="w-full">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "sign in"}
                  </Button>

                  <button
                    type="button"
                    onClick={openReset}
                    className="quiet block w-full text-center text-[13px] py-1"
                  >
                    forgot your password?
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignUp} className="space-y-5" noValidate>
                  <div>
                    <Label htmlFor="signup-username">username</Label>
                    <Input
                      id="signup-username"
                      type="text"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value); clearError("username"); }}
                      placeholder="your_username"
                      autoComplete="username"
                      maxLength={30}
                      aria-invalid={!!errors.username}
                      aria-describedby={errors.username ? "signup-username-error" : undefined}
                    />
                    <FieldError id="signup-username-error">{errors.username}</FieldError>
                  </div>

                  <div>
                    <Label htmlFor="signup-email">email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      maxLength={255}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "signup-email-error" : undefined}
                    />
                    <FieldError id="signup-email-error">{errors.email}</FieldError>
                  </div>

                  <div>
                    <Label htmlFor="signup-password">password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); clearError("password"); }}
                        placeholder="12+ characters"
                        className="pr-10"
                        autoComplete="new-password"
                        maxLength={256}
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "signup-password-error" : "signup-password-hint"}
                      />
                      {eyeButton}
                    </div>
                    {errors.password ? (
                      <FieldError id="signup-password-error">{errors.password}</FieldError>
                    ) : (
                      <p id="signup-password-hint" className="mt-1.5 text-[12px] font-light text-foreground/40">
                        upper and lower case, a number and a symbol.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="signup-confirm">confirm password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); clearError("confirmPassword"); }}
                      placeholder="same again"
                      autoComplete="new-password"
                      maxLength={256}
                      aria-invalid={!!errors.confirmPassword}
                      aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
                    />
                    <FieldError id="signup-confirm-error">{errors.confirmPassword}</FieldError>
                  </div>

                  <Turnstile onToken={setCaptchaToken} resetKey={captchaResetKey} action="signup" />

                  <Button type="submit" variant="signal" disabled={!canSignUp} className="w-full">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      <MFAVerifyModal
        open={showMFA}
        onOpenChange={setShowMFA}
        onVerified={handleMFAVerified}
      />
    </>
  );
};

export default AuthModal;
