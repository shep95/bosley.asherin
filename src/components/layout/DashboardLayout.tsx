import { ReactNode, useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine, Menu, X } from "lucide-react";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";
import { useStorageUrl } from "@/lib/storageUrl";

interface DashboardLayoutProps {
  children: ReactNode;
  /** Widen the room for two-pane pages such as messages. */
  wide?: boolean;
}

export const RefreshContext = createContext<{ triggerRefresh: () => void } | null>(null);
export const useRefresh = () => useContext(RefreshContext);

/**
 * Navigation is a table of contents, not a toolbar. Rooms are grouped by what
 * you are doing (reading, talking, keeping, making) and named in plain words.
 * No icons in the list: the words are the wayfinding.
 */
type Room = { label: string; path: string; badge?: "messages" | "notifications" };
type Group = { title: string; rooms: Room[] };

const GROUPS: Group[] = [
  { title: "read", rooms: [{ label: "feed", path: "/dashboard" }, { label: "explore", path: "/explore" }, { label: "search", path: "/search" }] },
  { title: "talk", rooms: [{ label: "messages", path: "/messages", badge: "messages" }, { label: "notifications", path: "/notifications", badge: "notifications" }] },
  { title: "keep", rooms: [{ label: "bookmarks", path: "/bookmarks" }, { label: "lists", path: "/lists" }, { label: "communities", path: "/communities" }, { label: "events", path: "/events" }] },
  { title: "make", rooms: [{ label: "drafts", path: "/drafts" }, { label: "threads", path: "/compose/thread" }, { label: "templates", path: "/templates" }, { label: "scheduled", path: "/scheduled" }, { label: "calendar", path: "/calendar" }, { label: "analytics", path: "/analytics" }, { label: "automations", path: "/rules" }] },
  { title: "you", rooms: [{ label: "profile", path: "/profile" }, { label: "settings", path: "/settings" }, { label: "sponsors", path: "/sponsors" }, { label: "install", path: "/install" }] },
];

const MOBILE = [
  { label: "feed", path: "/dashboard" },
  { label: "explore", path: "/explore" },
  { label: "write", path: "__compose" },
  { label: "inbox", path: "/notifications", badge: "notifications" as const },
  { label: "you", path: "/profile" },
];

const DashboardLayout = ({ children, wide = false }: DashboardLayoutProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadMessages, requestPermission, notificationPermission } = useNotifications();

  const { data: profile } = useQuery({
    queryKey: ["profile-background", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("custom_background_url, username").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: unreadNotifications } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false);
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (notificationPermission === "default") requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the phone menu on navigation.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const triggerRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);
  const refreshValue = useMemo(() => ({ triggerRefresh }), [triggerRefresh]);

  const customBackground = useStorageUrl("backgrounds", profile?.custom_background_url ?? null);
  const backgroundImage = customBackground || backgroundWallpaper;

  const handleCompose = () => {
    setMenuOpen(false);
    if (location.pathname !== "/dashboard") navigate("/dashboard", { state: { compose: true } });
    else window.dispatchEvent(new CustomEvent("bosley:compose"));
  };

  const badgeCount = (b?: Room["badge"]) => (b === "messages" ? unreadMessages : b === "notifications" ? unreadNotifications || 0 : 0);

  const Nav = () => (
    <nav aria-label="rooms" className="flex flex-col gap-5">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="text-[10px] font-light uppercase tracking-[0.24em] text-foreground/35 mb-1.5 px-2">{g.title}</p>
          <ul className="space-y-0.5">
            {g.rooms.map((r) => {
              const active = location.pathname === r.path;
              const n = badgeCount(r.badge);
              return (
                <li key={r.path}>
                  <Link
                    to={r.path}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center justify-between rounded-md px-2 py-[5px] text-[14px] font-light transition-colors duration-150 ease-soft ${
                      active ? "text-foreground bg-foreground/[0.06]" : "text-foreground/55 hover:text-foreground hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {active && <span aria-hidden className="w-1 h-1 rounded-full bg-signal" />}
                      {r.label}
                    </span>
                    {n > 0 && <span className="text-[11px] tabular-nums text-signal">{n > 99 ? "99+" : n}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <RefreshContext.Provider value={refreshValue}>
      <div className="min-h-screen bg-background relative">
        <img
          src={backgroundImage}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className="wallpaper fixed inset-0 w-full h-full object-cover pointer-events-none select-none"
        />
        <div className="wallpaper-scrim fixed inset-0" />

        <div className="relative z-10 mx-auto max-w-[1180px] flex min-h-screen">
          {/* Desktop table of contents */}
          <aside className="hidden lg:flex w-[220px] flex-shrink-0 sticky top-0 h-[100dvh] flex-col px-4 pt-7 pb-6">
            <Link to="/dashboard" className="px-2 mb-6 block">
              <span className="text-foreground font-light text-[17px] tracking-[-0.01em]">Bosley</span>
              {profile?.username && <span className="block text-[12px] text-foreground/40 font-light mt-0.5">@{profile.username}</span>}
            </Link>

            <button
              onClick={handleCompose}
              className="mb-6 mx-2 inline-flex items-center gap-2 h-9 px-3.5 rounded-md bg-signal text-signal-foreground text-[14px] font-medium press hover:bg-signal/90 transition-colors w-fit"
            >
              <PenLine className="w-3.5 h-3.5" />
              write
            </button>

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              <Nav />
            </div>

            <button
              onClick={handleSignOut}
              className="mt-6 px-2 text-left text-[13px] font-light text-foreground/40 hover:text-foreground transition-colors"
            >
              sign out
            </button>
          </aside>

          {/* The room */}
          <main className={`room flex-1 min-w-0 min-h-screen ${wide ? "max-w-none" : "max-w-[680px]"} pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0`}>
            {children}
          </main>
        </div>

        {/* Phone: top bar with the wordmark and a menu that lists every room */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12 bg-background/70 backdrop-blur-md border-b border-foreground/10">
          <Link to="/dashboard" className="text-foreground font-light text-[16px]">Bosley</Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "close rooms" : "open rooms"}
            aria-expanded={menuOpen}
            className="quiet p-2 -mr-2"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden fixed inset-0 z-30 bg-background/92 backdrop-blur-xl pt-16 px-6 pb-24 overflow-y-auto animate-in fade-in duration-200">
            <Nav />
            <button onClick={handleSignOut} className="mt-8 text-[14px] font-light text-foreground/45 hover:text-foreground">
              sign out
            </button>
          </div>
        )}

        {/* Phone: five rooms at the thumb */}
        <nav
          aria-label="primary"
          className="lg:hidden fixed left-0 right-0 bottom-0 z-40 bg-background/85 backdrop-blur-xl border-t border-foreground/10 flex items-stretch"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {MOBILE.map((item) => {
            const isCompose = item.path === "__compose";
            const active = !isCompose && location.pathname === item.path;
            const n = badgeCount(item.badge);
            const cls = `relative flex-1 min-h-[52px] flex flex-col items-center justify-center text-[11px] font-light transition-colors ${
              isCompose ? "text-signal" : active ? "text-foreground" : "text-foreground/45"
            }`;
            const inner = (
              <>
                {active && <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-px bg-foreground" />}
                <span>{item.label}</span>
                {n > 0 && <span className="absolute top-2 right-[22%] text-[10px] tabular-nums text-signal">{n > 99 ? "99+" : n}</span>}
              </>
            );
            return isCompose ? (
              <button key={item.label} onClick={handleCompose} className={cls} aria-label="write a post">
                {inner}
              </button>
            ) : (
              <Link key={item.label} to={item.path} aria-current={active ? "page" : undefined} className={cls}>
                {inner}
              </Link>
            );
          })}
        </nav>
      </div>
    </RefreshContext.Provider>
  );
};

export default DashboardLayout;
