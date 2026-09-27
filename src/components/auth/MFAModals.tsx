import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Smartphone, Key, Copy, Check } from "lucide-react";
import Brandmark from "@/components/Brandmark";
import { useToast } from "@/hooks/use-toast";

interface MFAEnrollModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: () => void;
}

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
        title: "Could not start MFA setup",
        description: "Please try again in a moment.",
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

      toast({ title: "MFA Enabled", description: "Two-factor authentication is now active." });
      onEnrolled();
      onOpenChange(false);
    } catch (error: any) {
      // Avoid leaking factor IDs / challenge IDs / Supabase internals
      toast({
        title: "Verification failed",
        description: "That code didn't match. Try a fresh code from your app.",
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
      <DialogContent className="sm:max-w-md p-0 bg-transparent border-none shadow-none">
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Brandmark className="w-6 h-6 opacity-80" />
            <span className="text-foreground font-light text-xl">Setup MFA</span>
          </div>

          {step === 'qr' && (
            <div className="space-y-4">
              <p className="text-foreground/70 font-light text-sm">
                Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
              </p>
              
              {qrCode && (
                <div className="flex justify-center p-4 bg-white rounded-xl">
                  <img src={qrCode} alt="MFA QR Code" className="w-48 h-48" />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-foreground/60 font-light text-xs">
                  Can't scan? Enter this code manually:
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-background/50 border border-border/50 rounded-lg p-2 text-xs font-mono text-foreground/80 break-all">
                    {secret}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copySecret}
                    className="shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Button
                onClick={() => setStep('verify')}
                className="w-full h-12 rounded-xl font-light bg-foreground text-background hover:bg-foreground/90"
              >
                <Smartphone className="w-4 h-4 mr-2" />
                I've scanned the code
              </Button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              <p className="text-foreground/70 font-light text-sm">
                Enter the 6-digit code from your authenticator app to verify setup.
              </p>

              <div className="space-y-2">
                <Label htmlFor="mfa-code" className="text-foreground/80 font-light">Verification Code</Label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="bg-background/50 border-border/50 rounded-xl h-12 font-mono text-center text-2xl tracking-widest"
                  autoComplete="one-time-code"
                />
              </div>

              <Button
                onClick={verifyMFA}
                disabled={loading || verifyCode.length !== 6}
                className="w-full h-12 rounded-xl font-light bg-foreground text-background hover:bg-foreground/90"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <><Key className="w-4 h-4 mr-2" /> Verify & Enable MFA</>
                )}
              </Button>
            </div>
          )}
        </div>
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
        toast({ title: "Error", description: "No MFA factor found", variant: "destructive" });
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
      toast({ title: "Invalid Code", description: "Please check your authenticator app and try again.", variant: "destructive" });
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md p-0 bg-transparent border-none shadow-none" onInteractOutside={(e) => e.preventDefault()}>
        <div className="glass-card rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-6">
            <Brandmark className="w-6 h-6 opacity-80" />
            <span className="text-foreground font-light text-xl">Two-Factor Auth</span>
          </div>

          <p className="text-foreground/70 font-light text-sm mb-4">
            Enter the 6-digit code from your authenticator app.
          </p>

          <div className="space-y-4">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="bg-background/50 border-border/50 rounded-xl h-14 font-mono text-center text-3xl tracking-widest"
              autoComplete="one-time-code"
              autoFocus
            />

            <Button
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              className="w-full h-12 rounded-xl font-light bg-foreground text-background hover:bg-foreground/90"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Verify"}
            </Button>

            {onSignOut && (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onSignOut}
                  disabled={loading}
                  className="font-light text-foreground/60 hover:text-foreground"
                >
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
