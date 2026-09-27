import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MFAEnrollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: () => void;
}

const codeFieldClass = "h-12 font-mono text-center text-[24px] tracking-[0.4em] placeholder:tracking-[0.4em]";

export const MFAEnrollModal = ({ open, onOpenChange, onEnrolled }: MFAEnrollModalProps) => {
  const [step, setStep] = useState<'qr' | 'verify' | 'backup'>('qr');
  const [qrCode, setQrCode] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [factorId, setFactorId] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  // Refs mirror state so the close-cleanup effect can read the latest values
  // without re-running on every keystroke.
  const factorIdRef = useRef<string>('');
  const completedRef = useRef(false);

  useEffect(() => {
    if (open) {
      completedRef.current = false;
      enrollMFA();
      return;
    }

    // Closed without finishing: discard the factor we just created. An
    // orphaned `unverified` factor would otherwise linger on the account and
    // confuse later enroll/verify flows.
    const pending = factorIdRef.current;
    if (pending && !completedRef.current) {
      factorIdRef.current = '';
      void supabase.auth.mfa.unenroll({ factorId: pending }).catch(() => {
        if (import.meta.env.DEV) console.warn("MFA cleanup unenroll failed");
      });
    }
    setStep('qr');
    setQrCode('');
    setSecret('');
    setFactorId('');
    setVerifyCode('');
  }, [open]);

  const enrollMFA = async () => {
    setLoading(true);
    try {
      // Sweep any leftover unverified factors from abandoned setups first;
      // GoTrue rejects a new enrollment while one is still hanging around.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = (existing?.all ?? []).filter(f => f.status === 'unverified');
      await Promise.all(
        stale.map(f => supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined))
      );

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Bosley Authenticator'
      });

      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      factorIdRef.current = data.id;
      setStep('qr');
    } catch (error: any) {
      // Generic message — never surface raw provider errors to the UI
      toast({
        title: "could not start two-factor setup",
        description: "try again in a moment.",
        variant: "destructive",
      });
      if (import.meta.env.DEV) console.warn("MFA enroll failed");
    } finally {
      setLoading(false);
    }
  };

  const verifyMFA = async () => {
    if (verifyCode.length !== 6) return;

    setLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode
      });

      if (verifyError) throw verifyError;

      // Mark complete before closing so the cleanup effect keeps this factor.
      completedRef.current = true;
      factorIdRef.current = '';

      toast({ title: "two-factor is on" });
      onEnrolled();
      onOpenChange(false);
    } catch (error: any) {
      // Avoid leaking factor IDs / challenge IDs / Supabase internals
      toast({
        title: "that code did not match",
        description: "try a fresh code from your app.",
        variant: "destructive",
      });
      if (import.meta.env.DEV) console.warn("MFA verify failed");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>two-factor</DialogTitle>
          <DialogDescription>
            {step === 'qr'
              ? "scan this with an authenticator app such as google authenticator, authy or 1password."
              : "enter the six-digit code your app shows now."}
          </DialogDescription>
        </DialogHeader>

        {step === 'qr' && (
          <div className="space-y-5">
            <div className="flex justify-center">
              {qrCode ? (
                <div className="p-3 bg-white rounded-md">
                  <img src={qrCode} alt="two-factor qr code" className="w-44 h-44" />
                </div>
              ) : (
                <div className="w-[200px] h-[200px] rounded-md bg-foreground/[0.06] animate-pulse" aria-hidden />
              )}
            </div>

            <div>
              <p className="text-[12px] font-light text-foreground/50">cannot scan? type this into the app instead.</p>
              <div className="mt-1.5 flex items-center gap-3">
                <code className="flex-1 min-w-0 text-[12px] font-mono text-foreground/80 break-all leading-relaxed">
                  {secret || "…"}
                </code>
                <button
                  type="button"
                  onClick={copySecret}
                  disabled={!secret}
                  className="quiet text-[13px] h-9 px-2 -mr-2 rounded-md shrink-0"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
            </div>

            <Button variant="signal" onClick={() => setStep('verify')} disabled={!qrCode} className="w-full">
              next
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <form
            className="space-y-5"
            onSubmit={(e) => { e.preventDefault(); verifyMFA(); }}
          >
            <div>
              <Label htmlFor="mfa-code">code</Label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className={`mt-1 ${codeFieldClass}`}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setStep('qr')}
                className="quiet text-[13px] h-9 px-2 -ml-2 rounded-md"
              >
                back
              </button>
              <Button type="submit" variant="signal" disabled={loading || verifyCode.length !== 6} className="min-w-[120px]">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "turn on"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface MFAVerifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  /** Escape hatch for a forced (non-dismissable) prompt, e.g. from ProtectedRoute. */
  onSignOut?: () => void;
}

export const MFAVerifyModal = ({ open, onOpenChange, onVerified, onSignOut }: MFAVerifyModalProps) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (code.length !== 6) return;

    setLoading(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      // Only a verified factor can satisfy a challenge; an abandoned enroll
      // may have left an unverified one at index 0.
      const totpFactor = factors?.totp?.find(f => f.status === 'verified');

      if (!totpFactor) {
        toast({ title: "no two-factor method on this account", variant: "destructive" });
        return;
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code
      });

      if (verifyError) throw verifyError;

      onVerified();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "that code did not match", description: "check your authenticator app and try again.", variant: "destructive" });
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-sm [&>button:last-child]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>two-factor</DialogTitle>
          <DialogDescription>enter the six-digit code from your authenticator app.</DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleVerify(); }}>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            aria-label="code"
            className={codeFieldClass}
            autoComplete="one-time-code"
            autoFocus
          />

          <Button type="submit" variant="signal" disabled={loading || code.length !== 6} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "verify"}
          </Button>

          {onSignOut && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onSignOut}
                disabled={loading}
                className="quiet text-[13px] h-9 px-2 rounded-md"
              >
                sign out instead
              </button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};
