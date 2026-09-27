import { ReactNode, useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Home, User, MessageSquare, Settings,
  Bookmark, Hash, LogOut, Menu, X, Handshake,
  ChevronLeft, ChevronRight, ChevronDown, Download, PenSquare, Bell, CalendarClock, BarChart3,
  Search, List, Users2, CalendarDays, FileText, Inbox, Library, Wrench, UserCircle2, Compass, Folder, Workflow, GitBranch, FileStack
} from "lucide-react";
import backgroundWallpaper from "@/assets/background-wallpaper.webp";
import watermark from "@/assets/watermark.webp";
import { useStorageUrl } from "@/lib/storageUrl";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const RefreshContext = createContext<{ triggerRefresh: () => void } | null>(null);
export const useRefresh = () => useContext(RefreshContext);

// Recursive nav node — supports children for branch-tree nesting
type NavNode = {
  icon: typeof Home;
  label: string;
  path?: string;
  action?: "compose";
  showBadge?: boolean;
  showNotificationBadge?: boolean;
  highlight?: boolean;
  children?: NavNode[];
};

type NavBranch = { id: string; label: string; icon: typeof Home; items: NavNode[] };

const navBranches: NavBranch[] = [
  {
    id: "feed",
    label: "Feed",
    icon: Compass,
    items: [
      { icon: Home, label: "Home", path: "/dashboard" },
      { icon: Search, label: "Search", path: "/search" },
      { icon: Hash, label: "Explore", path: "/explore" },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    items: [
      { icon: Bell, label: "Notifications", path: "/notifications", showNotificationBadge: true },
      { icon: MessageSquare, label: "Messages", path: "/messages", showBadge: true },
    ],
  },
  {
    id: "you",
    label: "You",
    icon: UserCircle2,
    items: [
      { icon: User, label: "Profile", path: "/profile" },
      { icon: Bookmark, label: "Bookmarks", path: "/bookmarks" },
      {
        icon: Folder,
        label: "Saved & groups",
        children: [
          { icon: List, label: "Lists", path: "/lists" },
          { icon: Users2, label: "Communities", path: "/communities" },
          { icon: CalendarDays, label: "Events", path: "/events" },
        ],
      },
      {
        icon: Wrench,
        label: "Creator tools",
        children: [
          { icon: FileText, label: "Drafts", path: "/drafts" },
          { icon: GitBranch, label: "Threads", path: "/compose/thread" },
          { icon: FileStack, label: "Templates", path: "/templates" },
          { icon: CalendarClock, label: "Scheduled", path: "/scheduled" },
          { icon: CalendarDays, label: "Calendar", path: "/calendar" },
          { icon: BarChart3, label: "Analytics", path: "/analytics" },
          { icon: Workflow, label: "Automations", path: "/rules" },
        ],
      },
      {
        icon: Settings,
        label: "Settings & account",
        children: [
          { icon: Settings, label: "Settings", path: "/settings" },
          { icon: Handshake, label: "Sponsors", path: "/sponsors" },
          { icon: Download, label: "Install app", path: "/install" },
        ],
      },
    ],
  },
];

// Find branch IDs that contain the active route
function findActiveTrail(branches: NavBranch[], pathname: string): Set<string> {
  const trail = new Set<string>();
  const walk = (nodes: NavNode[], parents: string[]): boolean => {
    let hit = false;
    for (const n of nodes) {
      const id = [...parents, n.label].join("/");
      if (n.path === pathname) {
        parents.forEach((p) => trail.add(p));
        trail.add(id);
        hit = true;
      }
      if (n.children && walk(n.children, [...parents, n.label])) {
        parents.forEach((p) => trail.add(p));
        trail.add(id);
        hit = true;
      }
    }
    return hit;
  };
  for (const b of branches) {
    const inside = walk(b.items, [b.id]);
    if (inside) trail.add(b.id);
  }
  return trail;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { unreadMessages, requestPermission, notificationPermission } = useNotifications();

  const activeTrail = findActiveTrail(navBranches, location.pathname);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default: open every branch + active sub-trail
    const init = new Set<string>(navBranches.map((b) => b.id));
    activeTrail.forEach((k) => init.add(k));
    return init;
  });

  // Re-open trail when route changes
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      activeTrail.forEach((k) => next.add(k));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const { data: profile } = useQuery({
    queryKey: ["profile-background", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("custom_background_url")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: unreadNotifications } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (notificationPermission === "default") requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Refreshing used to bump a key on the layout's root element, which unmounted
  // and rebuilt the entire dashboard — sidebar, feed, every image — instead of
  // re-reading data. Invalidating the cache refetches what changed and leaves
  // the painted DOM (and every decoded image) in place.
  const triggerRefresh = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const refreshValue = useMemo(() => ({ triggerRefresh }), [triggerRefresh]);

  const customBackground = useStorageUrl("backgrounds", profile?.custom_background_url ?? null);
  const backgroundImage = customBackground || backgroundWallpaper;

  const handleCompose = () => {
    if (location.pathname !== "/dashboard") navigate("/dashboard");
    setTimeout(() => {
      const composer = document.querySelector('textarea[placeholder*="What\'s on your mind"]');
      if (composer instanceof HTMLTextAreaElement) {
        composer.focus();
        composer.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  };

  // Recursive node renderer with branch-tree guides
  const renderNode = (node: NavNode, depth: number, parentKey: string): JSX.Element => {
    const key = `${parentKey}/${node.label}`;
    const hasChildren = !!node.children?.length;
    const isOpen = expanded.has(key);
    const isActive = !!node.path && location.pathname === node.path && !node.action;
    const showMessageBadge = node.showBadge && unreadMessages > 0;
    const showNotificationBadge = node.showNotificationBadge && (unreadNotifications || 0) > 0;

    const baseClasses = `
      group relative flex items-center gap-2.5 w-full pl-2.5 pr-2 py-2 rounded-lg text-[13px]
      transition-all duration-200 ease-soft press
      ${isActive
        ? "bg-foreground/[0.12] text-foreground font-medium shadow-card"
        : node.highlight
          ? "text-signal/90 hover:text-signal hover:bg-foreground/[0.06]"
          : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.06]"}
    `;

    const Icon = node.icon;

    const inner = (
      <>
        {/* Active rail — a single warm cue tells you where you are at a glance */}
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-full bg-signal"
          />
        )}
        {/* Branch connector — horizontal stub to vertical guide */}
        {depth > 0 && (
          <span
            aria-hidden
            className="absolute -left-2 top-1/2 w-2 h-px bg-foreground/15"
          />
        )}
        <Icon className={`w-4 h-4 flex-shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"}`} />
        <span className="truncate flex-1 text-left">{node.label}</span>
        {showMessageBadge && (
          <span className="ml-auto flex-shrink-0 bg-destructive text-destructive-foreground text-[10px] font-semibold rounded-full flex items-center justify-center min-w-[17px] h-[17px] px-1 tabular-nums">
            {unreadMessages > 99 ? "99+" : unreadMessages}
          </span>
        )}
        {showNotificationBadge && (
          <span className="ml-auto flex-shrink-0 bg-destructive text-destructive-foreground text-[10px] font-semibold rounded-full flex items-center justify-center min-w-[17px] h-[17px] px-1 tabular-nums">
            {(unreadNotifications || 0) > 99 ? "99+" : unreadNotifications}
          </span>
        )}
        {hasChildren && (
          <ChevronDown
            className={`w-3.5 h-3.5 ml-auto text-foreground/40 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
          />
        )}
      </>
    );

    return (
      <div key={key} className="relative">
        {hasChildren ? (
          <button onClick={() => toggle(key)} className={baseClasses}>
            {inner}
          </button>
        ) : node.action === "compose" ? (
          <button
            onClick={() => {
              setSidebarOpen(false);
              handleCompose();
            }}
            className={baseClasses}
          >
            {inner}
          </button>
        ) : (
          <Link
            to={node.path!}
            aria-current={isActive ? "page" : undefined}
            onClick={() => setSidebarOpen(false)}
            className={baseClasses}
          >
            {inner}
          </Link>
        )}

        {hasChildren && isOpen && (
          <div className="relative ml-[14px] mt-0.5 pl-3 border-l border-foreground/10 space-y-0.5">
            {node.children!.map((child) => renderNode(child, depth + 1, key))}
          </div>
        )}
      </div>
    );
  };

  return (
    <RefreshContext.Provider value={refreshValue}>
      <div className="min-h-screen bg-background relative">
        <img
          src={backgroundImage}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className="fixed inset-0 w-full h-full object-cover opacity-90 pointer-events-none select-none"
        />
        <div className="fixed inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/85" />

        <div className="relative z-10 flex min-h-screen">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
            className="lg:hidden fixed top-4 left-4 z-50 glass-panel rounded-xl border p-3 press shadow-card"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <aside
            className={`
              fixed lg:sticky top-0 left-0 h-[100dvh]
              ${sidebarCollapsed ? "w-20" : "w-72"}
              transform transition-all duration-300 ease-in-out z-40
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
            `}
          >
            <div className="h-full m-3 mr-0">
              <div className="glass-panel rounded-2xl h-full flex flex-col p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] overflow-hidden border shadow-card">
                {/* Logo */}
                <Link
                  to="/dashboard"
                  className={`flex items-center gap-2.5 px-2 py-2 mb-2 flex-shrink-0 ${sidebarCollapsed ? "justify-center" : ""}`}
                >
                  <img src={watermark} alt="Bosley" className="w-7 h-7 rounded-md" />
                  {!sidebarCollapsed && (
                    <div className="min-w-0">
                      <div className="text-foreground font-semibold tracking-[-0.02em] leading-none">Bosley</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-1 h-1 rounded-full bg-foreground/50" />
                        <span className="text-[9px] uppercase tracking-widest text-foreground/55 font-medium">
                          Online
                        </span>
                      </div>
                    </div>
                  )}
                </Link>

                {/* Single primary action. Everything else in this rail is
                    navigation; only one control creates something. */}
                <Button
                  onClick={() => {
                    setSidebarOpen(false);
                    handleCompose();
                  }}
                  aria-label="New post"
                  className={`mb-3 flex-shrink-0 h-10 gap-2 rounded-xl bg-signal text-signal-foreground hover:bg-signal/90 font-medium press shadow-card ${
                    sidebarCollapsed ? "w-10 mx-auto px-0" : "w-full"
                  }`}
                >
                  <PenSquare className="w-4 h-4 flex-shrink-0" />
                  {!sidebarCollapsed && <span>New post</span>}
                </Button>

                {/* Branch tree navigation */}
                <ScrollArea className="flex-1 -mr-2 pr-2">
                  {sidebarCollapsed ? (
                    <nav className="space-y-1">
                      {navBranches.flatMap((b) => b.items).map((item, idx) => {
                        if (item.children) return null;
                        const Icon = item.icon;
                        const isActive = !!item.path && location.pathname === item.path;
                        if (item.action === "compose") {
                          return (
                            <button
                              key={idx}
                              onClick={handleCompose}
                              title={item.label}
                              className="w-full flex items-center justify-center p-2.5 rounded-lg press text-foreground/65 hover:text-foreground hover:bg-foreground/[0.08] transition-colors"
                            >
                              <Icon className="w-5 h-5" />
                            </button>
                          );
                        }
                        return (
                          <Link
                            key={idx}
                            to={item.path!}
                            title={item.label}
                            aria-current={isActive ? "page" : undefined}
                            className={`flex items-center justify-center p-2.5 rounded-lg press transition-colors ${
                              isActive
                                ? "bg-foreground/[0.12] text-foreground shadow-card"
                                : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.08]"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </Link>
                        );
                      })}
                    </nav>
                  ) : (
                    <nav className="space-y-2">
                      {navBranches.map((branch) => {
                        const open = expanded.has(branch.id);
                        const BIcon = branch.icon;
                        return (
                          <div key={branch.id}>
                            <button
                              onClick={() => toggle(branch.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-foreground/55 hover:text-foreground/85 transition-colors"
                            >
                              <BIcon className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] flex-1 text-left">
                                {branch.label}
                              </span>
                              <ChevronDown
                                className={`w-3 h-3 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
                              />
                            </button>
                            {open && (
                              <div className="relative ml-[7px] mt-0.5 pl-3 border-l border-foreground/10 space-y-0.5">
                                {branch.items.map((node) => renderNode(node, 1, branch.id))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </nav>
                  )}
                </ScrollArea>

                {/* Bottom controls */}
                <div className="border-t border-foreground/10 pt-2 mt-2 space-y-1 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className={`hidden lg:flex w-full items-center gap-2 px-2 py-2 rounded-md text-[13px] text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-all ${
                      sidebarCollapsed ? "justify-center" : ""
                    }`}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <>
                        <ChevronLeft className="w-4 h-4" />
                        <span>Collapse</span>
                      </>
                    )}
                  </button>

                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className={`w-full gap-2 px-2 py-2 text-[13px] text-foreground/60 hover:text-foreground font-normal h-auto ${
                      sidebarCollapsed ? "justify-center" : "justify-start"
                    }`}
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    {!sidebarCollapsed && <span>Sign out</span>}
                  </Button>
                </div>
              </div>
            </div>
          </aside>

          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-background/70 backdrop-blur-sm z-30 lg:hidden animate-in fade-in duration-200"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Bottom padding clears the floating mobile nav so the last post is
              never trapped underneath it. */}
          <main className="flex-1 min-h-screen pt-16 lg:pt-0 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 overflow-y-auto">
            {children}
          </main>

          {/* Mobile floating glass nav */}
          <nav
            aria-label="Primary"
            className="lg:hidden fixed left-3 right-3 z-40 glass-panel rounded-2xl border shadow-lift px-2 py-2 flex items-center justify-around"
            style={{ bottom: `calc(0.75rem + env(safe-area-inset-bottom))` }}
          >
            {([
              { icon: Home, label: "Home", path: "/dashboard" },
              { icon: Search, label: "Search", path: "/search" },
              { icon: PenSquare, label: "Post", action: "compose" as const, path: undefined as string | undefined },
              {
                icon: Bell,
                label: "Alerts",
                path: "/notifications",
                badge: unreadNotifications || 0,
              },
              { icon: User, label: "Profile", path: "/profile" },
            ] as Array<{ icon: typeof Home; label: string; path?: string; action?: "compose"; badge?: number }>).map((item) => {
              const Icon = item.icon;
              const isActive = item.path && location.pathname === item.path;
              const isCompose = item.action === "compose";
              const content = (
                <>
                  <div className="relative">
                    <Icon
                      className={`w-5 h-5 transition-colors ${
                        isCompose ? "text-signal" : isActive ? "text-foreground" : "text-foreground/70"
                      }`}
                    />
                    {(item.badge ?? 0) > 0 && (
                      <span className="absolute -top-1.5 -right-2 bg-destructive text-destructive-foreground text-[9px] font-semibold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center tabular-nums">
                        {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-1 font-medium tracking-tight ${
                      isCompose ? "text-signal" : isActive ? "text-foreground" : "text-foreground/65"
                    }`}
                  >
                    {item.label}
                  </span>
                </>
              );
              const baseCls = `relative flex flex-col items-center justify-center flex-1 min-h-[48px] py-1.5 rounded-xl press transition-colors ${
                isCompose
                  ? "bg-signal/10"
                  : isActive
                    ? "bg-foreground/[0.12]"
                    : "hover:bg-foreground/5"
              }`;
              if (isCompose) {
                return (
                  <button key={item.label} onClick={handleCompose} aria-label="Create post" className={baseCls}>
                    {content}
                  </button>
                );
              }
              return (
                <Link
                  key={item.label}
                  to={item.path!}
                  aria-current={isActive ? "page" : undefined}
                  className={baseCls}
                >
                  {content}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </RefreshContext.Provider>
  );
};

export default DashboardLayout;
