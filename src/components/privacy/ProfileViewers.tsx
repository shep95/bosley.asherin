import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useInfiniteQuery } from "@tanstack/react-query";
import UserAvatar from "@/components/UserAvatar";
import EmptyState from "@/components/ui/empty-state";
import LoadMoreButton from "@/components/LoadMoreButton";
import { Link } from "react-router-dom";

const PAGE = 50;

type ViewerProfile = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
type ViewsPage = {
  views: { viewer_user_id: string; viewed_at: string }[];
  profiles: ViewerProfile[];
  nextCursor: string | null;
};

/** Who opened your profile in the last 30 days. Rows; no box, no counter badge. */
const ProfileViewers = () => {
  const { user } = useAuth();

  // 50 view rows per page, newest first, continued by viewed_at.
  const viewsQuery = useInfiniteQuery({
    queryKey: ['profile-viewers', user?.id],
    queryFn: async ({ pageParam }): Promise<ViewsPage> => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      let query = supabase
        .from('profile_views')
        .select('viewer_user_id, viewed_at')
        .eq('profile_user_id', user!.id)
        .gte('viewed_at', thirtyDaysAgo.toISOString())
        .order('viewed_at', { ascending: false })
        .limit(PAGE);
      if (pageParam) query = query.lt('viewed_at', pageParam);
      const { data: views, error } = await query;
      if (error) throw error;
      const rows = views ?? [];

      const ids = [...new Set(rows.map((v) => v.viewer_user_id))];
      let profiles: ViewerProfile[] = [];
      if (ids.length > 0) {
        const { data, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', ids);
        if (profilesError) throw profilesError;
        profiles = data ?? [];
      }
      return {
        views: rows,
        profiles,
        nextCursor: rows.length === PAGE ? rows[rows.length - 1].viewed_at : null,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!user
  });
  const isLoading = viewsQuery.isLoading;

  // One row per visitor, at their most recent visit, across every loaded page.
  const viewers = useMemo(() => {
    const pages = viewsQuery.data?.pages ?? [];
    const profiles = new Map<string, ViewerProfile>();
    for (const page of pages) for (const p of page.profiles) profiles.set(p.user_id, p);
    const seen = new Map<string, string>();
    for (const page of pages) {
      for (const v of page.views) if (!seen.has(v.viewer_user_id)) seen.set(v.viewer_user_id, v.viewed_at);
    }
    return Array.from(seen.entries()).map(([userId, viewedAt]) => ({
      userId,
      viewedAt,
      profile: profiles.get(userId),
    }));
  }, [viewsQuery.data]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'now';
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase();
  };

  if (isLoading) {
    return (
      <div className="stagger" aria-busy="true" aria-label="loading visitors">
        {[0, 1, 2].map((i) => (
          <div key={i} className="row px-5 sm:px-8 py-3 flex items-center gap-3" style={{ "--i": i } as React.CSSProperties}>
            <div className="w-7 h-7 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
            <div className="h-3 w-28 rounded bg-foreground/[0.08] animate-pulse" />
            <div className="ml-auto h-3 w-8 rounded bg-foreground/[0.05] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!viewers || viewers.length === 0) {
    return (
      <EmptyState
        title="no visitors yet."
        description="people who open your profile are listed here for 30 days, unless they browse in stealth."
      />
    );
  }

  return (
    <div>
      <p className="px-5 sm:px-8 pt-4 pb-2 text-[12px] font-light text-foreground/40">last 30 days</p>
      <div className="stagger">
        {viewers.map((viewer, idx) => (
          <Link
            key={viewer.userId}
            to={`/user/${viewer.profile?.username}`}
            className="row px-5 sm:px-8 py-3 flex items-center gap-3 min-h-[48px]"
            style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
          >
            <UserAvatar avatarUrl={viewer.profile?.avatar_url} username={viewer.profile?.username} size="sm" />
            <p className="flex items-baseline gap-x-2 min-w-0 text-[14px] font-light">
              <span className="text-foreground truncate">{viewer.profile?.display_name || viewer.profile?.username || "someone"}</span>
              <span className="text-foreground/40 truncate">@{viewer.profile?.username}</span>
            </p>
            <span className="ml-auto text-[12px] font-light text-foreground/35 tabular-nums whitespace-nowrap">{formatDate(viewer.viewedAt)}</span>
          </Link>
        ))}
      </div>
      <LoadMoreButton
        hasMore={viewsQuery.hasNextPage}
        loading={viewsQuery.isFetchingNextPage}
        onClick={() => { void viewsQuery.fetchNextPage(); }}
      />
    </div>
  );
};

export default ProfileViewers;
