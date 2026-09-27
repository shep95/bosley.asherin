import { Suspense, lazy, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import LandingV2 from "@/components/landing/v2/LandingV2";
import FAQSection from "@/components/landing/FAQSection";

// Sign-in machinery (validation, breach checks, OAuth client) is only needed
// once someone actually reaches for it — not on first paint.
const AuthModal = lazy(() => import("@/components/auth/AuthModal"));
import { useAuth } from "@/hooks/useAuth";
import PublicShell from "@/components/landing/PublicShell";

interface IndexProps {
  openAuth?: "login" | "signup" | null;
}

const Index = ({ openAuth }: IndexProps) => {
  const location = useLocation();
  // GlassHeader on pages without their own AuthModal navigates here with the
  // requested tab in location state.
  const stateTab = (location.state as { openAuth?: "login" | "signup" } | null)?.openAuth;
  const initialTab = openAuth || stateTab || null;
  const [authOpen, setAuthOpen] = useState(!!initialTab);
  const [authTab, setAuthTab] = useState<"login" | "signup">(initialTab || "login");
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  // Once mounted the modal stays mounted so closing and reopening it does not
  // re-trigger a chunk fetch, but it is never mounted before it is wanted.
  const [authMounted, setAuthMounted] = useState(!!initialTab);

  const handleOpenAuth = (tab: "login" | "signup") => {
    setAuthTab(tab);
    setAuthMounted(true);
    setAuthOpen(true);
  };

  // Open (or switch tab) when arriving via navigate("/", { state: { openAuth } })
  // after this page is already mounted, then clear the state so a refresh or
  // back-navigation does not reopen the modal.
  useEffect(() => {
    if (!stateTab) return;
    handleOpenAuth(stateTab);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateTab]);

  return (
    <PublicShell width="wide" onOpenAuth={handleOpenAuth}>
      <Helmet>
        <title>a quiet room on the internet.</title>
        <meta
          name="description"
          content="bosley is a free social space with a chronological feed, no ads, and no engagement farming. write. talk. leave when you want."
        />
        <link rel="canonical" href="https://bosley.app/" />
        <link rel="alternate" type="text/plain" title="llms.txt" href="https://bosley.app/llms.txt" />
        <meta property="og:url" content="https://bosley.app/" />
        <meta property="og:title" content="a quiet room on the internet." />
        <meta
          property="og:description"
          content="bosley is a free social space with a chronological feed, no ads, and no engagement farming. write. talk. leave when you want."
        />
        <meta name="twitter:title" content="a quiet room on the internet." />
        <meta
          name="twitter:description"
          content="bosley is a free social space with a chronological feed, no ads, and no engagement farming. write. talk. leave when you want."
        />
      </Helmet>
      <LandingV2 onOpenAuth={handleOpenAuth} />
      <FAQSection />

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} defaultTab={authTab} />
        </Suspense>
      )}
    </PublicShell>
  );
};

export default Index;
