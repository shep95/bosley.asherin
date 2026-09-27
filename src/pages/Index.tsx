import { Suspense, lazy, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import GlassHeader from "@/components/GlassHeader";
import LandingV2 from "@/components/landing/v2/LandingV2";
import FAQSection from "@/components/landing/FAQSection";
import FooterSection from "@/components/landing/FooterSection";

// Sign-in machinery (validation, breach checks, OAuth client) is only needed
// once someone actually reaches for it — not on first paint.
const AuthModal = lazy(() => import("@/components/auth/AuthModal"));
import { useAuth } from "@/hooks/useAuth";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";
import SplitShell from "@/components/landing/SplitShell";

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
    <div className="min-h-screen bg-background relative overflow-x-hidden">
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
        <link rel="preload" as="image" href={backgroundWallpaper} fetchPriority="high" />
      </Helmet>
      {/* An inline style background is only discovered after the page's JS has
          run, so the largest paint element started downloading last. As a real
          <img> with high fetch priority the browser's preload scanner starts it
          immediately. */}
      <img
        src={backgroundWallpaper}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        className="fixed inset-0 w-full h-full object-cover opacity-90 pointer-events-none select-none"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/85" />

      <div className="relative z-10">
        <SplitShell onOpenAuth={handleOpenAuth}>
          <GlassHeader onOpenAuth={handleOpenAuth} />
          <LandingV2 onOpenAuth={handleOpenAuth} />
          <FAQSection />
          <FooterSection />
        </SplitShell>
      </div>

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onOpenChange={setAuthOpen} defaultTab={authTab} />
        </Suspense>
      )}
    </div>
  );
};

export default Index;
