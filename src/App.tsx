import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
// The landing page is the first paint for every cold visit, so it stays in the
// entry chunk. Everything else is split per-route: a signed-out visitor should
// never download the composer, charts, calendar or messaging code to read the
// hero.
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { MFAVerifyModal } from "./components/auth/MFAModals";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Explore = lazy(() => import("./pages/Explore"));
const Messages = lazy(() => import("./pages/Messages"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const Profile = lazy(() => import("./pages/Profile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const Sponsors = lazy(() => import("./pages/Sponsors"));
const Install = lazy(() => import("./pages/Install"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const Notifications = lazy(() => import("./pages/Notifications"));
const ScheduledPosts = lazy(() => import("./pages/ScheduledPosts"));
const Analytics = lazy(() => import("./pages/Analytics"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const Contact = lazy(() => import("./pages/Contact"));
const For = lazy(() => import("./pages/Contact").then((m) => ({ default: m.For })));
const Lists = lazy(() => import("./pages/Lists"));
const Communities = lazy(() => import("./pages/Communities"));
const Events = lazy(() => import("./pages/Events"));
const Search = lazy(() => import("./pages/Search"));
const Drafts = lazy(() => import("./pages/Drafts"));
const Rules = lazy(() => import("./pages/Rules"));
const Templates = lazy(() => import("./pages/Templates"));
const ThreadComposer = lazy(() => import("./pages/ThreadComposer"));
const Calendar = lazy(() => import("./pages/Calendar"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Remounting a route (tab-switch, back-navigation) previously refired
      // every query, so returning to the feed re-fetched posts, profiles and
      // signed URLs that were seconds old.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Route-level loading is a quiet shell of the page that is coming, not a
 * spinner: the wallpaper, the chrome, and three placeholder cards. Nothing
 * jumps when the real page replaces it.
 */
const RouteFallback = () => (
  <div className="min-h-screen bg-background relative" aria-busy="true" aria-label="loading">
    <div className="wallpaper-scrim fixed inset-0" />
    <div className="relative z-10 max-w-2xl mx-auto px-4 pt-20 lg:pt-10 space-y-4 stagger">
      <div className="h-8 w-40 rounded-md bg-foreground/[0.06] animate-pulse" style={{ "--i": 0 } as React.CSSProperties} />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="glass-card rounded-xl p-5 animate-pulse"
          style={{ "--i": i } as React.CSSProperties}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-foreground/[0.08]" />
            <div className="flex-1 space-y-2.5 pt-1">
              <div className="h-3 w-32 rounded bg-foreground/[0.08]" />
              <div className="h-3 w-full rounded bg-foreground/[0.06]" />
              <div className="h-3 w-4/5 rounded bg-foreground/[0.06]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, mfaRequired, clearMfaRequired, signOut } = useAuth();

  if (loading) {
    return <RouteFallback />;
  }

  if (!user) {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <Navigate to="/" replace />
      </>
    );
  }

  // The password step only yields an aal1 session. If the account has a
  // verified TOTP factor, hold every protected page behind the verify modal
  // until GoTrue reports aal2 — never render children on an under-assured
  // session. The modal cannot be dismissed; the only way out is signing out.
  if (mfaRequired) {
    return (
      <>
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <div className="min-h-screen bg-background" aria-hidden="true" />
        <MFAVerifyModal
          open
          onOpenChange={() => {}}
          onVerified={() => { void clearMfaRequired(); }}
          onSignOut={() => { void signOut(); }}
        />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {children}
    </>
  );
};

const AppRoutes = () => {
  useIdleTimeout();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />
      <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
      <Route path="/for" element={<For />} />
      <Route path="/for/:slug" element={<For />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/explore"
        element={
          <ProtectedRoute>
            <Explore />
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <Search />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <Notifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages"
        element={
          <ProtectedRoute>
            <Messages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookmarks"
        element={
          <ProtectedRoute>
            <Bookmarks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lists"
        element={
          <ProtectedRoute>
            <Lists />
          </ProtectedRoute>
        }
      />
      <Route
        path="/communities"
        element={
          <ProtectedRoute>
            <Communities />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events"
        element={
          <ProtectedRoute>
            <Events />
          </ProtectedRoute>
        }
      />
      <Route
        path="/drafts"
        element={
          <ProtectedRoute>
            <Drafts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rules"
        element={
          <ProtectedRoute>
            <Rules />
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <Templates />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compose/thread"
        element={
          <ProtectedRoute>
            <ThreadComposer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <Calendar />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sponsors"
        element={
          <ProtectedRoute>
            <Sponsors />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scheduled"
        element={
          <ProtectedRoute>
            <ScheduledPosts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <Analytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/user/:username"
        element={
          <ProtectedRoute>
            <UserProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/post/:postId"
        element={
          <ProtectedRoute>
            <PostDetail />
          </ProtectedRoute>
        }
      />
      <Route path="/install" element={<Install />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
