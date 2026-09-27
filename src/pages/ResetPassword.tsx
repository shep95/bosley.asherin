import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";

// Mirrors the sign-up rules in AuthModal so a reset cannot weaken a password.
const validatePassword = (password: string): string | null => {
  if (!password) return "choose a password";
  if (password.length < 12) return "at least 12 characters";
  if (!/[A-Z]/.test(password)) return "add an uppercase letter";
  if (!/[a-z]/.test(password)) return "add a lowercase letter";
  if (!/[0-9]/.test(password)) return "add a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "add a symbol";
  return null;
};

const RECOVERY_TIMEOUT_MS = 3000;

const ResetPassword = () => {
  const { session, updatePassword } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [recoveryEvent, setRecoveryEvent] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // The recovery link lands here with a PKCE code (or, on failure, an error in
  // the hash). supabase-js exchanges it on load and emits PASSWORD_RECOVERY.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("error=") || hash.includes("error_code=")) {
      setTimedOut(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryEvent(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const ready = recoveryEvent || !!session;

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setTimedOut(true), RECOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { password?: string; confirm?: string } = {};
    const passwordError = validatePassword(password);
    if (passwordError) nextErrors.password = passwordError;
    if (password !== confirm) nextErrors.confirm = "the passwords do not match";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      toast({ title: "could not update the password", description: error.toLowerCase(), variant: "destructive" });
      return;
    }

    toast({ title: "password updated", description: "you are signed in with your new password." });
    navigate("/dashboard", { replace: true });
  };

  const canSubmit = !!password && !!confirm && !submitting;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <Helmet>
        <title>reset password</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <img
        src={backgroundWallpaper}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="wallpaper fixed inset-0 w-full h-full object-cover pointer-events-none select-none"
      />
      <div className="wallpaper-scrim fixed inset-0" />

      <main className="relative z-10 min-h-screen px-5 sm:px-8 lg:px-12 pt-8 pb-20">
        <div className="max-w-5xl mx-auto">
          <Link
            to="/"
            className="quiet inline-flex items-center gap-2 text-[13px] h-10 -ml-2 px-2 rounded-md"
          >
            <ArrowLeft className="w-4 h-4" /> back
          </Link>

          <div className="mt-16 sm:mt-24 grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-7">
              <p className="text-foreground/35 text-[11px] font-light tracking-[0.24em] uppercase mb-8">account</p>
              <h1 className="text-[clamp(2.5rem,7vw,5.5rem)] font-extralight text-foreground leading-[0.95] tracking-[-0.045em]">
                choose a
                <br />
                <span className="font-thin text-foreground/70">new password.</span>
              </h1>
              <p className="mt-8 text-foreground/50 text-[15px] font-light max-w-md leading-relaxed">
                at least 12 characters, with upper and lower case, a number and a symbol. we check it against known
                breaches before saving.
              </p>
            </div>

            <div className="lg:col-span-5 lg:pt-14 max-w-sm">
              {ready ? (
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  <div>
                    <Label htmlFor="new-password">new password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                        placeholder="12+ characters"
                        className="pr-10"
                        autoComplete="new-password"
                        maxLength={256}
                        autoFocus
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "new-password-error" : undefined}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "hide password" : "show password"}
                        aria-pressed={showPassword}
                        className="quiet absolute right-0 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-md"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p id="new-password-error" role="alert" className="mt-1.5 text-[12px] font-light text-destructive">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="confirm-password">confirm password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
                      placeholder="same again"
                      autoComplete="new-password"
                      maxLength={256}
                      aria-invalid={!!errors.confirm}
                      aria-describedby={errors.confirm ? "confirm-password-error" : undefined}
                    />
                    {errors.confirm && (
                      <p id="confirm-password-error" role="alert" className="mt-1.5 text-[12px] font-light text-destructive">
                        {errors.confirm}
                      </p>
                    )}
                  </div>

                  <Button type="submit" variant="signal" disabled={!canSubmit} className="w-full">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "save password"}
                  </Button>
                </form>
              ) : timedOut ? (
                <div className="space-y-4">
                  <p className="text-foreground font-extralight text-[22px] tracking-[-0.02em]">this link has expired.</p>
                  <p className="text-foreground/50 font-light text-[14px] leading-relaxed">
                    reset links work once and for a short time. go back and ask for a new one from the sign-in screen.
                  </p>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 text-[14px] font-light text-foreground hover:text-signal transition-colors"
                  >
                    back home
                  </Link>
                </div>
              ) : (
                <div className="space-y-3" aria-busy aria-label="checking your reset link">
                  <div className="h-3 w-20 rounded bg-foreground/[0.06] animate-pulse" />
                  <div className="h-10 rounded bg-foreground/[0.06] animate-pulse" />
                  <div className="h-3 w-28 rounded bg-foreground/[0.06] animate-pulse mt-6" />
                  <div className="h-10 rounded bg-foreground/[0.06] animate-pulse" />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
