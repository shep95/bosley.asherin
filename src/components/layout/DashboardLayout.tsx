import { ReactNode, useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnread } from "@/hooks/useUnread";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine, Menu, X, Search } from "lucide-react";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";
import { useStorageUrl } from "@/lib/storageUrl";
import { ROOM_GROUPS, openComposer, type Room } from "@/lib/rooms";
import CommandPalette from "@/components/CommandPalette";
import MemberCard from "@/components/MemberCard";
import RoomRail from "@/components/layout/RoomRail";
import { Button } from "@/components/ui/button";

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
 * No icons in the list: the words are the wayfinding. The room list itself
 * lives in src/lib/rooms.ts so the palette and shortcuts share it.
 */
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const openPalette = () => window.dispatchEvent(new CustomEvent("bosley:palette"));

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
  // Badge counts come from the shared unread cache (one rpc, one realtime
  // channel in UnreadProvider). Notification permission is only ever requested
  // from an explicit user action (notifications page, settings), never here.
  const { counts: unread } = useUnread();

  const { data: profile } = useQuery({
    queryKey: ["profile-background", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("custom_background_url, username, display_name, member_number, created_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

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
    openComposer(navigate, location.pathname);
  };

  const badgeCount = (b?: Room["badge"]) =>
    b === "messages" ? unread.messages + unread.requests : b === "notifications" ? unread.notifications : 0;

  const Nav = () => (
    <nav aria-label="rooms" className="flex flex-col gap-4">
      {ROOM_GROUPS.map((g) => (
        <div key={g.title}>
          <p className="eyebrow !text-[9.5px] mb-1.5 px-2">{g.title}</p>
          <ul className="space-y-0.5">
            {g.rooms.map((r) => {
              const active = location.pathname === r.path;
              const n = badgeCount(r.badge);
              return (
                <li key={r.path}>
                  <Link
                    to={r.path}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center justify-between rounded-md px-2 py-1 text-[14px] font-light transition-colors duration-150 ease-soft ${
                      active ? "text-foreground" : "text-foreground/55 hover:text-foreground"
                    }`}
                  >
                    {active && (
                      <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 w-[2px] h-3.5 rounded-full bg-gradient-to-b from-[hsl(var(--gold-hi))] to-[hsl(var(--gold-lo))]" />
                    )}
                    <span>{r.label}</span>
                    {n > 0 ? (
                      <span className="text-[11px] num text-gold">{n > 99 ? "99+" : n}</span>
                    ) : (
                      r.key && (
                        <span aria-hidden className="text-[10.5px] text-foreground/0 group-hover:text-foreground/30 transition-colors tracking-wide">
                          g {r.key}
                        </span>
                      )
                    )}
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
      <CommandPalette />
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
            <Link to="/dashboard" className="px-2 mb-7 block">
              <span className="font-display text-foreground text-[26px] leading-none tracking-[-0.01em]">Bosley</span>
            </Link>

            <div className="mx-2 mb-7 space-y-2.5">
              <Button onClick={handleCompose} variant="signal" className="w-full h-10 justify-start px-3.5 text-[14px]">
                <PenLine className="w-3.5 h-3.5" />
                write
                <span className="ml-auto text-[11px] font-normal opacity-60">n</span>
              </Button>
              <button
                type="button"
                onClick={openPalette}
                className="w-full flex items-center gap-2 h-9 px-3 rounded-md border border-foreground/[0.09] bg-foreground/[0.025] text-[13px] font-light text-foreground/45 hover:text-foreground/80 hover:border-foreground/15 transition-colors"
              >
                <Search className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="whitespace-nowrap">jump to</span>
                <kbd className="kbd ml-auto whitespace-nowrap">{isMac ? "⌘ K" : "ctrl K"}</kbd>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]">
              <Nav />
            </div>

            {profile?.username && (
              <Link to="/profile" className={`mt-5 block rounded-[14px] transition-transform duration-200 ease-soft hover:-translate-y-px ${wide ? "" : "xl:hidden"}`}>
                <MemberCard
                  size="compact"
                  username={profile.username}
                  displayName={profile.display_name}
                  memberNumber={profile.member_number}
                  joinedAt={profile.created_at}
                />
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="mt-4 px-2 text-left text-[12.5px] font-light text-foreground/35 hover:text-foreground transition-colors"
            >
              sign out
            </button>
          </aside>

          {/* The room */}
          <main className={`room flex-1 min-w-0 min-h-screen ${wide ? "max-w-none" : "max-w-[680px]"} pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0`}>
            {children}
          </main>

          {!wide && <RoomRail profile={profile} />}
        </div>

        {/* Phone: top bar with the wordmark and a menu that lists every room */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 h-12 bg-background border-b border-foreground/10">
          <Link to="/dashboard" className="font-display text-foreground text-[22px] leading-none">Bosley</Link>
          <div className="flex items-center gap-1">
            <button onClick={openPalette} aria-label="jump anywhere" className="quiet p-2.5">
              <Search className="w-[18px] h-[18px]" />
            </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "close rooms" : "open rooms"}
            aria-expanded={menuOpen}
            className="quiet p-2.5 -mr-2.5"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          </div>
        </div>
        {menuOpen && (
          <div className="lg:hidden fixed inset-0 z-30 bg-background/[0.97] pt-16 px-6 pb-24 overflow-y-auto animate-in fade-in duration-200">
            {profile?.username && (
              <Link to="/profile" className="block mb-7">
                <MemberCard size="compact" username={profile.username} displayName={profile.display_name} memberNumber={profile.member_number} joinedAt={profile.created_at} />
              </Link>
            )}
            <Nav />
            <button onClick={handleSignOut} className="mt-8 text-[14px] font-light text-foreground/45 hover:text-foreground">
              sign out
            </button>
          </div>
        )}

        {/* Phone: five rooms at the thumb */}
        <nav
          aria-label="primary"
          className="lg:hidden fixed left-0 right-0 bottom-0 z-40 bg-background border-t border-foreground/10 flex items-stretch"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {MOBILE.map((item) => {
            const isCompose = item.path === "__compose";
            const active = !isCompose && location.pathname === item.path;
            const n = badgeCount(item.badge);
            const cls = `relative flex-1 min-h-[52px] flex flex-col items-center justify-center text-[11px] font-light transition-colors ${
              isCompose ? "" : active ? "text-foreground" : "text-foreground/45"
            }`;
            const inner = (
              <>
                {active && <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-px bg-gradient-to-r from-transparent via-[hsl(var(--gold-mid))] to-transparent" />}
                <span className={isCompose ? "text-gold font-normal" : undefined}>{item.label}</span>
                {n > 0 && <span className="absolute top-2 right-[22%] text-[10px] num text-gold">{n > 99 ? "99+" : n}</span>}
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
