import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
import { supabase } from "@/integrations/supabase/client";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "signup";
}

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
  
  const { signUp, signIn, clearMfaRequired } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const resetForm = () => {
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setErrors({});
  };

  const validateSignUp = (): boolean => {
    const newErrors: {[key: string]: string} = {};
    
    if (!username.trim()) {
      newErrors.username = "Username is required";
    } else if (username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (username.length > 30) {
      newErrors.username = "Username must be less than 30 characters";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      newErrors.username = "Letters, numbers, and underscores only";
    }
    
    if (!email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Invalid email address";
    } else if (isTemporaryEmail(email)) {
      newErrors.email = "Temporary emails not allowed";
    }
    
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 12) {
      newErrors.password = "Minimum 12 characters";
    } else if (!/[A-Z]/.test(password)) {
      newErrors.password = "Must include an uppercase letter";
    } else if (!/[a-z]/.test(password)) {
      newErrors.password = "Must include a lowercase letter";
    } else if (!/[0-9]/.test(password)) {
      newErrors.password = "Must include a number";
    } else if (!/[^A-Za-z0-9]/.test(password)) {
      newErrors.password = "Must include a special character";
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords don't match";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignUp()) return;
    
    setLoading(true);
    const { error } = await signUp(email, password, username);
    setLoading(false);
    
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else {
      toast({ title: "Welcome!", description: "Account created successfully." });
      onOpenChange(false);
      navigate("/dashboard");
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }
    
    setLoading(true);
    const { error, mfaRequired } = await signIn(email, password);
    setLoading(false);
    
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    } else if (mfaRequired) {
      setShowMFA(true);
    } else {
      toast({ title: "Welcome back!", description: "Signed in successfully." });
      onOpenChange(false);
      navigate("/dashboard");
    }
  };

  const handleMFAVerified = async () => {
    setShowMFA(false);
    // Re-checks the session's assurance level; only clears once it is aal2.
    await clearMfaRequired();
    toast({ title: "Welcome back!", description: "Signed in successfully." });
    onOpenChange(false);
    navigate("/dashboard");
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
      toast({ title: "Google sign-in failed", description: "Please try again.", variant: "destructive" });
    }
    // On success the browser navigates away to Google; nothing more to do here.
  };

  return (
    <>
      <Dialog open={open && !showMFA} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-0 bg-transparent border-none shadow-none">
          <div className="glass-card rounded-3xl p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-6">
              <Brandmark className="w-6 h-6 opacity-80" />
              <span className="text-foreground font-light text-xl">Bosley</span>
            </div>
            
            <Tabs value={tab} onValueChange={(v) => { setTab(v); resetForm(); }} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-background/50 rounded-xl p-1">
                <TabsTrigger value="login" className="rounded-lg font-light data-[state=active]:bg-foreground data-[state=active]:text-background">
                  Sign In
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg font-light data-[state=active]:bg-foreground data-[state=active]:text-background">
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <Button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                variant="outline"
                className="w-full h-12 rounded-xl font-light text-base bg-background/50 border-border/50 hover:bg-background/70 mb-4 gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/>
                </svg>
                Continue with Google
              </Button>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-foreground/40 font-light">or</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>

              <TabsContent value="login">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-foreground/80 font-light">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="bg-background/50 border-border/50 rounded-xl h-12 font-light"
                      autoComplete="email"
                      maxLength={255}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-foreground/80 font-light">Password</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="bg-background/50 border-border/50 rounded-xl h-12 font-light pr-12"
                        autoComplete="current-password"
                        maxLength={256}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl font-light text-base bg-foreground text-background hover:bg-foreground/90"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username" className="text-foreground/80 font-light">Username</Label>
                    <Input
                      id="signup-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_username"
                      className="bg-background/50 border-border/50 rounded-xl h-12 font-light"
                    />
                    {errors.username && <p className="text-destructive text-sm font-light">{errors.username}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-foreground/80 font-light">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="bg-background/50 border-border/50 rounded-xl h-12 font-light"
                    />
                    {errors.email && <p className="text-destructive text-sm font-light">{errors.email}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-foreground/80 font-light">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="bg-background/50 border-border/50 rounded-xl h-12 font-light pr-12"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-destructive text-sm font-light">{errors.password}</p>}
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm" className="text-foreground/80 font-light">Confirm Password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-background/50 border-border/50 rounded-xl h-12 font-light"
                    />
                    {errors.confirmPassword && <p className="text-destructive text-sm font-light">{errors.confirmPassword}</p>}
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl font-light text-base bg-foreground text-background hover:bg-foreground/90"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
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
