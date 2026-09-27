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
  if (!password) return "password is required";
  if (password.length < 12) return "minimum 12 characters";
  if (!/[A-Z]/.test(password)) return "must include an uppercase letter";
  if (!/[a-z]/.test(password)) return "must include a lowercase letter";
  if (!/[0-9]/.test(password)) return "must include a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "must include a special character";
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
    if (password !== confirm) nextErrors.confirm = "passwords don't match";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      toast({ title: "couldn't update password", description: error.toLowerCase(), variant: "destructive" });
      return;
    }

    toast({ title: "password updated", description: "you're signed in with your new password." });
    navigate("/dashboard", { replace: true });
  };

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
        className="fixed inset-0 w-full h-full object-cover opacity-60 pointer-events-none select-none"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-background/60 via-background/75 to-background/95" />

      <main className="relative z-10 min-h-screen px-5 sm:px-8 lg:px-12 pt-10 pb-20">
        <div className="max-w-6xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-light text-foreground/55 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> back
          </Link>

          <div className="mt-20 sm:mt-28 grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-7">
              <p className="text-foreground/40 text-[11px] font-light tracking-[0.28em] uppercase mb-8">account</p>
              <h1 className="text-[clamp(2.5rem,7vw,5.5rem)] font-extralight text-foreground leading-[0.95] tracking-[-0.045em]">
                choose a
                <br />
                <span className="font-thin text-foreground/70">new password.</span>
              </h1>
              <p className="mt-10 text-foreground/55 font-light max-w-md leading-relaxed">
                at least 12 characters, with upper and lower case, a number and a symbol. we check it against known
                breaches before saving.
              </p>
            </div>

            <div className="lg:col-span-5 lg:pt-16">
              <div className="glass-card rounded-3xl p-6 sm:p-8">
                {ready ? (
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="text-foreground/80 font-light">new password</Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="bg-background/50 border-border/50 rounded-xl h-12 font-light pr-12"
                          autoComplete="new-password"
                          maxLength={256}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "hide password" : "show password"}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      {errors.password && <p className="text-destructive text-sm font-light">{errors.password}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password" className="text-foreground/80 font-light">confirm password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••••••••"
                        className="bg-background/50 border-border/50 rounded-xl h-12 font-light"
                        autoComplete="new-password"
                        maxLength={256}
                      />
                      {errors.confirm && <p className="text-destructive text-sm font-light">{errors.confirm}</p>}
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="w-full h-12 rounded-xl font-light text-base bg-foreground text-background hover:bg-foreground/90"
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "update password"}
                    </Button>
                  </form>
                ) : timedOut ? (
                  <div className="space-y-4">
                    <p className="text-foreground font-light text-lg">this link is invalid or expired.</p>
                    <p className="text-foreground/55 font-light text-sm leading-relaxed">
                      reset links only work once and for a short time. head back and request a new one from the
                      sign-in screen.
                    </p>
                    <Link
                      to="/"
                      className="inline-flex items-center gap-2 text-sm font-light text-foreground/70 hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> back home
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-foreground/55 font-light text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> checking your reset link…
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
