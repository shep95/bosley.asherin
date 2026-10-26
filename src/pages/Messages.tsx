import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import UserAvatar from "@/components/UserAvatar";
import MessageBubble from "@/components/messages/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Loader2, ArrowLeft, Plus, Check, X, Users, Timer, Eye, MoreHorizontal, Reply
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { unreadQueryKey } from "@/hooks/useUnread";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { escapeFilterValue, cssUrl } from "@/lib/sanitize";
import "@/styles/message-protection.css";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type GroupMessageRow = Database["public"]["Tables"]["group_messages"]["Row"];

interface Conversation {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_message: string;
  last_message_time: string;
  unread: boolean;
  unread_count: number;
  /** They wrote, I never wrote back and have not accepted. */
  is_request: boolean;
  is_group?: boolean;
  group_name?: string;
}

interface ReplyRef {
  id: string;
  content: string;
  sender_id: string;
}

type DmMessage = MessageRow & { reply_to: ReplyRef | null };

interface SenderProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

type GroupMessage = GroupMessageRow & { sender?: SenderProfile };

/** One page of a thread, oldest first. Pages are newest-first in the cache. */
interface ThreadPage<T> {
  rows: T[];
  hasMore: boolean;
}

interface GroupChat {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  last_message?: string;
  last_message_time?: string;
}

type ListTab = "all" | "groups" | "requests";
type ListItem = { kind: "dm"; conv: Conversation } | { kind: "group"; group: GroupChat };

const PAGE_SIZE = 100;

/** "6m", "2h", "3d", then "12 sep". Short enough to sit at the end of a row. */
const shortTime = (dateString?: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" }).toLowerCase();
};

const dayKey = (dateString: string) => new Date(dateString).toDateString();

const dayLabel = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "today";
  if (date.toDateString() === yesterday.toDateString()) return "yesterday";
  return date
    .toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    })
    .toLowerCase();
};

/**
 * Runs of messages: same sender, same day, less than ten minutes apart.
 * A run shares one timestamp and one avatar, so the thread reads as speech,
 * not as a log.
 */
const groupRuns = <T extends { id: string; sender_id: string; created_at: string }>(list: T[]) => {
  const runs: { day: string; sender_id: string; items: T[] }[] = [];
  for (const m of list) {
    const day = dayKey(m.created_at);
    const last = runs[runs.length - 1];
    const prev = last?.items[last.items.length - 1];
    const close = prev ? new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 10 * 60 * 1000 : false;
    if (last && last.sender_id === m.sender_id && last.day === day && close) last.items.push(m);
    else runs.push({ day, sender_id: m.sender_id, items: [m] });
  }
  return runs;
};

const randomSuffix = () => Math.random().toString(36).slice(2, 10);

const isExpired = (m: { expires_at?: string | null }, now: number) =>
  !!m.expires_at && new Date(m.expires_at).getTime() <= now;

/** Newest-first pages of oldest-first rows → one oldest-first list, no duplicates. */
const flattenPages = <T extends { id: string }>(pages?: ThreadPage<T>[]): T[] => {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (let i = pages.length - 1; i >= 0; i--) {
    for (const row of pages[i].rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
};

const patchRows = <T extends { id: string }>(
  qc: QueryClient,
  key: readonly unknown[],
  fn: (row: T) => T | null
) => {
  qc.setQueryData<InfiniteData<ThreadPage<T>>>(key, (d) =>
    d
      ? {
          ...d,
          pages: d.pages.map((p) => ({ ...p, rows: p.rows.map(fn).filter((r): r is T => r !== null) })),
        }
      : d
  );
};

const appendRow = <T extends { id: string }>(qc: QueryClient, key: readonly unknown[], row: T) => {
  qc.setQueryData<InfiniteData<ThreadPage<T>>>(key, (d) => {
    if (!d || d.pages.length === 0) return d;
    if (d.pages.some((p) => p.rows.some((r) => r.id === row.id))) return d;
    return { ...d, pages: d.pages.map((p, i) => (i === 0 ? { ...p, rows: [...p.rows, row] } : p)) };
  });
};

/** Escape LIKE wildcards so "a_b" matches only "a_b". */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const normalizeUsername = (raw: string) => raw.trim().replace(/^@+/, "").trim();
const USERNAME_SHAPE = /^[A-Za-z0-9_.]{1,40}$/;

/** An error whose message is already safe, lowercase copy for the user. */
class UserFacingError extends Error {}

const errorCode = (e: unknown) => (e as { code?: string } | null)?.code;
const errorText = (e: unknown) => (e as { message?: string } | null)?.message ?? "";

/** Never show raw Postgres text. */
const sendFailure = (e: unknown, kind: "dm" | "group") => {
  if (e instanceof UserFacingError) return e.message;
  const code = errorCode(e);
  if (code === "P0001" && /rate limit/i.test(errorText(e))) return "slow down. you have sent a lot in the last hour.";
  if (code === "42501") return kind === "dm" ? "they are not accepting messages from you" : "you are not in this group anymore.";
  return "something went wrong. try again.";
};

const ttlMs: Record<string, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

/** Re-renders on an interval (only while `ms` > 0) so expiring messages leave on time. */
const useClock = (ms: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (ms <= 0) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};

const useDocumentVisible = () => {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
};

const NO_REACTIONS: { emoji: string; count: number; hasReacted: boolean }[] = [];

const ListSkeleton = ({ count = 4 }: { count?: number }) => (
  <div className="stagger" aria-busy="true" aria-label="loading conversations">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="row px-5 sm:px-8 py-4 flex items-center gap-3" style={{ "--i": i } as React.CSSProperties}>
        <div className="w-8 h-8 rounded-full bg-foreground/[0.07] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-foreground/[0.08] animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-foreground/[0.06] animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const ThreadSkeleton = () => (
  <div className="flex flex-col gap-3 px-5 sm:px-8 py-6" aria-busy="true" aria-label="loading messages">
    {[0, 1, 0, 0, 1].map((mine, i) => (
      <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div
          className={`h-9 rounded-md bg-foreground/[0.06] animate-pulse ${["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-2/5"][i]}`}
          style={{ animationDelay: `${i * 60}ms` }}
        />
      </div>
    ))}
  </div>
);

const GroupMark = ({ className = "" }: { className?: string }) => (
  <span className={`w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center shrink-0 ${className}`} aria-hidden>
    <Users className="w-[15px] h-[15px] text-foreground/60" />
  </span>
);

const LoadError = ({ label, onRetry }: { label: string; onRetry: () => void }) => (
  <div className="px-5 sm:px-8 py-10">
    <p className="text-[14px] font-light text-foreground/60">{label}</p>
    <button onClick={onRetry} className="mt-2 -ml-1 h-10 px-1 text-[14px] font-light text-foreground hover:text-signal transition-colors">
      try again
    </button>
  </div>
);

const EarlierButton = ({ onClick, loading }: { onClick: () => void; loading: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className="quiet self-center inline-flex items-center gap-2 h-8 px-2 rounded-md text-[12px] font-light"
  >
    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
    earlier
  </button>
);

const renderRuns = <T extends { id: string; sender_id: string; created_at: string }>(
  runs: { day: string; sender_id: string; items: T[] }[],
  render: (msg: T, isFirst: boolean, isLast: boolean) => React.ReactNode
) => {
  let prevDay = "";
  return runs.map((run) => {
    const showDay = run.day !== prevDay;
    prevDay = run.day;
    return (
      <Fragment key={run.items[0].id}>
        {showDay && (
          <p className="text-center text-[11px] font-light text-foreground/35 select-none">{dayLabel(run.items[0].created_at)}</p>
        )}
        <div className="flex flex-col gap-2">
          {run.items.map((m, i) => render(m, i === 0, i === run.items.length - 1))}
        </div>
      </Fragment>
    );
  });
};

const Messages = () => {
  const [selectedUser, setSelectedUser] = useState<Conversation | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupChat | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newMessageRecipient, setNewMessageRecipient] = useState("");
  const [newConversationMessage, setNewConversationMessage] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ListTab>("all");
  const [replyTo, setReplyTo] = useState<{ id: string; content: string; senderName: string } | null>(null);
  const [messageTTL, setMessageTTL] = useState<string | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const visible = useDocumentVisible();

  const partnerId = selectedUser?.user_id ?? null;
  const groupId = selectedGroup?.id ?? null;
  const threadKey = partnerId ? `dm:${partnerId}` : groupId ? `g:${groupId}` : "";
  const dmKey = useMemo(() => ["messages", userId, partnerId] as const, [userId, partnerId]);
  const groupKey = useMemo(() => ["group-messages", userId, groupId] as const, [userId, groupId]);

  const refreshUnread = useCallback(
    () => queryClient.invalidateQueries({ queryKey: unreadQueryKey(userId) }),
    [queryClient, userId]
  );
  const refreshConversations = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["conversations", userId] }),
    [queryClient, userId]
  );
  const fail = useCallback(
    (title: string) => toast({ title, variant: "destructive" }),
    [toast]
  );

  // Switching conversations starts clean: no leftover draft, reply target,
  // timer or view-once flag aimed at the wrong person.
  useEffect(() => {
    setNewMessage("");
    setReplyTo(null);
    setMessageTTL(null);
    setViewOnce(false);
  }, [threadKey]);

  // Fetch user profile for message wallpaper
  const { data: userProfile } = useQuery({
    queryKey: ['profile-wallpaper', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('message_wallpaper_url')
        .eq('user_id', userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId
  });

  // Conversations and requests in one query: latest message per partner,
  // unread counts and the request flag are computed in the database.
  const {
    data: conversations,
    isLoading: loadingConversations,
    isError: conversationsFailed,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ['conversations', userId],
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase.rpc('get_conversations');
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.partner_id,
        user_id: row.partner_id,
        username: row.username || 'unknown',
        display_name: row.display_name,
        avatar_url: row.avatar_url,
        last_message: row.last_message,
        last_message_time: row.last_message_at,
        unread_count: Number(row.unread_count) || 0,
        unread: (Number(row.unread_count) || 0) > 0,
        is_request: !!row.is_request,
      }));
    },
    enabled: !!userId,
    staleTime: 15_000,
  });

  const directConversations = useMemo(() => (conversations ?? []).filter((c) => !c.is_request), [conversations]);
  const requests = useMemo(() => (conversations ?? []).filter((c) => c.is_request), [conversations]);

  // Fetch group chats
  const {
    data: groupChats,
    isLoading: loadingGroups,
    isError: groupsFailed,
    refetch: refetchGroups,
  } = useQuery({
    queryKey: ['group-chats', userId],
    queryFn: async (): Promise<GroupChat[]> => {
      if (!userId) return [];

      const { data: memberships, error: membershipError } = await supabase
        .from('group_chat_members')
        .select('group_id')
        .eq('user_id', userId);
      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) return [];

      const groupIds = memberships.map(m => m.group_id);
      const [{ data: groups, error: groupsError }, { data: allMembers, error: membersError }, { data: recentMsgs, error: recentError }] =
        await Promise.all([
          supabase.from('group_chats').select('*').in('id', groupIds),
          supabase.from('group_chat_members').select('group_id').in('group_id', groupIds),
          // Last message per group from one bounded slice. Quiet groups may
          // fall outside it and simply show their member count instead.
          supabase
            .from('group_messages')
            .select('group_id, content, created_at')
            .in('group_id', groupIds)
            .order('created_at', { ascending: false })
            .limit(200),
        ]);
      if (groupsError) throw groupsError;
      if (membersError) throw membersError;
      if (recentError) throw recentError;

      const memberCounts = new Map<string, number>();
      (allMembers || []).forEach(m => {
        memberCounts.set(m.group_id, (memberCounts.get(m.group_id) || 0) + 1);
      });

      const lastMsgs = new Map<string, { content: string; created_at: string }>();
      (recentMsgs || []).forEach(m => {
        if (!lastMsgs.has(m.group_id)) {
          lastMsgs.set(m.group_id, { content: m.content, created_at: m.created_at });
        }
      });

      return (groups || []).map(group => {
        const last = lastMsgs.get(group.id);
        return {
          ...group,
          member_count: memberCounts.get(group.id) || 0,
          last_message: last?.content,
          last_message_time: last?.created_at,
        };
      });
    },
    enabled: !!userId
  });

  // Direct thread: the latest 100, then 100 more per "earlier".
  const dmQuery = useInfiniteQuery({
    queryKey: dmKey,
    initialPageParam: null as string | null,
    getNextPageParam: (last: ThreadPage<DmMessage>) => (last.hasMore ? last.rows[0]?.created_at ?? undefined : undefined),
    queryFn: async ({ pageParam }): Promise<ThreadPage<DmMessage>> => {
      if (!userId || !partnerId) return { rows: [], hasMore: false };

      let q = supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (error) throw error;

      const rows = (data ?? []).slice().reverse();
      const replyIds = [...new Set(rows.map(m => m.reply_to_id).filter((id): id is string => !!id))];
      const repliesMap = new Map<string, ReplyRef>();
      if (replyIds.length > 0) {
        const { data: replies } = await supabase
          .from('messages')
          .select('id, content, sender_id')
          .in('id', replyIds);
        replies?.forEach(r => repliesMap.set(r.id, r));
      }

      return {
        rows: rows.map(msg => ({ ...msg, reply_to: msg.reply_to_id ? repliesMap.get(msg.reply_to_id) ?? null : null })),
        hasMore: (data?.length ?? 0) === PAGE_SIZE,
      };
    },
    enabled: !!userId && !!partnerId,
    // Realtime does not deliver DELETEs on filtered channels: refetch when the
    // user comes back to the window or reopens the thread.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const loadingMessages = dmQuery.isLoading;

  const dmAll = useMemo(() => flattenPages(dmQuery.data?.pages), [dmQuery.data]);
  const dmHasExpiring = useMemo(() => dmAll.some((m) => m.expires_at), [dmAll]);
  const now = useClock(dmHasExpiring ? 30_000 : 0);
  const messages = useMemo(() => dmAll.filter((m) => !isExpired(m, now)), [dmAll, now]);

  // Opening a thread marks it read. read_at is what we write; the database
  // copies it into seen_at (our private "opened") and withholds read_at from
  // the sender when read receipts are off. Badges only move once it succeeded.
  const unreadSig = useMemo(
    () => messages.filter((m) => m.receiver_id === userId && !m.seen_at).map((m) => m.id).join(","),
    [messages, userId]
  );
  const markingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !partnerId || !visible || !unreadSig) return;
    const sig = `${partnerId}:${unreadSig}`;
    if (markingRef.current === sig) return;
    markingRef.current = sig;
    const ids = new Set(unreadSig.split(","));
    const stamp = new Date().toISOString();
    const key = ["messages", userId, partnerId] as const;

    void (async () => {
      const { error } = await supabase
        .from('messages')
        .update({ read_at: stamp })
        .eq('sender_id', partnerId)
        .eq('receiver_id', userId)
        .is('seen_at', null);
      if (error) {
        markingRef.current = null;
        return;
      }
      patchRows<DmMessage>(queryClient, key, (m) => (ids.has(m.id) ? { ...m, seen_at: m.seen_at ?? stamp } : m));
      queryClient.setQueryData<Conversation[]>(['conversations', userId], (prev) =>
        prev?.map((c) => (c.user_id === partnerId ? { ...c, unread: false, unread_count: 0 } : c))
      );
      void queryClient.invalidateQueries({ queryKey: unreadQueryKey(userId) });
    })();
  }, [userId, partnerId, visible, unreadSig, queryClient]);

  // Reactions for the loaded messages only.
  const messageIds = useMemo(() => messages.map(m => m.id), [messages]);
  const { data: reactions } = useQuery({
    queryKey: ['message-reactions', partnerId, messageIds],
    queryFn: async ({ queryKey }) => {
      const ids = queryKey[2] as string[];
      const reactionsMap = new Map<string, { emoji: string; count: number; hasReacted: boolean }[]>();
      if (!userId || ids.length === 0) return reactionsMap;

      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', ids);
      if (error) throw error;

      data?.forEach(reaction => {
        const existing = reactionsMap.get(reaction.message_id) || [];
        const emojiIndex = existing.findIndex(e => e.emoji === reaction.emoji);

        if (emojiIndex >= 0) {
          existing[emojiIndex].count++;
          if (reaction.user_id === userId) {
            existing[emojiIndex].hasReacted = true;
          }
        } else {
          existing.push({
            emoji: reaction.emoji,
            count: 1,
            hasReacted: reaction.user_id === userId
          });
        }

        reactionsMap.set(reaction.message_id, existing);
      });

      return reactionsMap;
    },
    enabled: !!userId && !!partnerId && messageIds.length > 0,
    placeholderData: (prev) => prev,
  });

  // Group thread: the latest 100, then 100 more per "earlier".
  const groupQuery = useInfiniteQuery({
    queryKey: groupKey,
    initialPageParam: null as string | null,
    getNextPageParam: (last: ThreadPage<GroupMessage>) => (last.hasMore ? last.rows[0]?.created_at ?? undefined : undefined),
    queryFn: async ({ pageParam }): Promise<ThreadPage<GroupMessage>> => {
      if (!userId || !groupId) return { rows: [], hasMore: false };

      let q = supabase.from('group_messages').select('*').eq('group_id', groupId);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(PAGE_SIZE);
      if (error) throw error;

      const rows = (data ?? []).slice().reverse();
      const senderIds = [...new Set(rows.map(m => m.sender_id))];
      const profilesMap = new Map<string, SenderProfile>();
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .in('user_id', senderIds);
        profiles?.forEach(p => profilesMap.set(p.user_id, p));
      }

      return {
        rows: rows.map(msg => ({ ...msg, sender: profilesMap.get(msg.sender_id) })),
        hasMore: (data?.length ?? 0) === PAGE_SIZE,
      };
    },
    enabled: !!userId && !!groupId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const loadingGroupMessages = groupQuery.isLoading;
  const groupMessages = useMemo(() => flattenPages(groupQuery.data?.pages), [groupQuery.data]);

  // Search users for adding to group
  const debouncedMemberSearch = useDebouncedValue(memberSearchQuery, 300);
  const { data: memberSearchResults } = useQuery({
    queryKey: ['search-members', debouncedMemberSearch],
    queryFn: async () => {
      const term = escapeFilterValue(debouncedMemberSearch);
      if (!term || !userId) return [];

      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .neq('user_id', userId)
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(10);

      return data || [];
    },
    enabled: debouncedMemberSearch.length > 1
  });

  // Scroll to the bottom when a NEW message lands or the thread changes, not
  // when earlier messages are prepended.
  const lastDmId = messages[messages.length - 1]?.id;
  const lastGroupId = groupMessages[groupMessages.length - 1]?.id;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastDmId, lastGroupId, threadKey]);

  // The open conversation, read by the realtime handlers without
  // re-subscribing on every switch.
  const selectedPartnerRef = useRef<string | null>(partnerId);
  useEffect(() => {
    selectedPartnerRef.current = partnerId;
  }, [partnerId]);

  // One DM channel per signed-in user. Re-creating a fixed-name channel on
  // every conversation switch raced the previous one's teardown, so every
  // other switch silently subscribed to nothing.
  useEffect(() => {
    if (!userId) return;
    let convTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleConversations = () => {
      if (convTimer) clearTimeout(convTimer);
      convTimer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
      }, 300);
    };
    const keyFor = (partner: string) => ["messages", userId, partner] as const;
    const partnerOf = (row: MessageRow) => (row.sender_id === userId ? row.receiver_id : row.sender_id);

    const onInsert = (row: MessageRow) => {
      if (!row?.id) return;
      scheduleConversations();
      const partner = partnerOf(row);
      const key = keyFor(partner);
      if (partner !== selectedPartnerRef.current) {
        // Not on screen: mark it stale so it refetches when opened.
        void queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' });
        return;
      }
      const data = queryClient.getQueryData<InfiniteData<ThreadPage<DmMessage>>>(key);
      if (!data) {
        void queryClient.invalidateQueries({ queryKey: key });
        return;
      }
      let reply: ReplyRef | null = null;
      if (row.reply_to_id) {
        const hit = data.pages.flatMap((p) => p.rows).find((m) => m.id === row.reply_to_id);
        if (!hit) {
          void queryClient.invalidateQueries({ queryKey: key });
          return;
        }
        reply = { id: hit.id, content: hit.content, sender_id: hit.sender_id };
      }
      appendRow<DmMessage>(queryClient, key, { ...row, reply_to: reply });
    };

    // Read receipts, seen state and view-once opens: patch in place.
    const onUpdate = (row: MessageRow) => {
      if (!row?.id) return;
      patchRows<DmMessage>(queryClient, keyFor(partnerOf(row)), (m) =>
        m.id === row.id ? { ...m, read_at: row.read_at, seen_at: row.seen_at, viewed_at: row.viewed_at } : m
      );
      // Read in another tab or device: unread dots in the list change.
      if (row.receiver_id === userId) scheduleConversations();
    };

    const table = { schema: 'public', table: 'messages' } as const;
    const channel = supabase
      .channel(`dm:${userId}:${randomSuffix()}`)
      .on('postgres_changes', { event: 'INSERT', ...table, filter: `receiver_id=eq.${userId}` }, (p) => onInsert(p.new as MessageRow))
      .on('postgres_changes', { event: 'INSERT', ...table, filter: `sender_id=eq.${userId}` }, (p) => onInsert(p.new as MessageRow))
      .on('postgres_changes', { event: 'UPDATE', ...table, filter: `receiver_id=eq.${userId}` }, (p) => onUpdate(p.new as MessageRow))
      .on('postgres_changes', { event: 'UPDATE', ...table, filter: `sender_id=eq.${userId}` }, (p) => onUpdate(p.new as MessageRow))
      .subscribe();

    return () => {
      if (convTimer) clearTimeout(convTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // Group messages, filtered to the open group. Unique name so a quick switch
  // back to the same group never collides with the channel still leaving.
  useEffect(() => {
    if (!userId || !groupId) return;
    const key = ["group-messages", userId, groupId] as const;

    const channel = supabase
      .channel(`group-messages:${groupId}:${randomSuffix()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` },
        (payload) => {
          const row = payload.new as GroupMessageRow;
          const data = queryClient.getQueryData<InfiniteData<ThreadPage<GroupMessage>>>(key);
          const sender = data?.pages.flatMap((p) => p.rows).find((m) => m.sender_id === row.sender_id)?.sender;
          if (data && sender) appendRow<GroupMessage>(queryClient, key, { ...row, sender });
          else void queryClient.invalidateQueries({ queryKey: key });
          void queryClient.invalidateQueries({ queryKey: ['group-chats', userId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, groupId, queryClient]);

  // Search users
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);
  const { data: searchResults, isFetching: searchingPeople } = useQuery({
    queryKey: ['search-users', debouncedSearch],
    queryFn: async () => {
      const term = escapeFilterValue(debouncedSearch);
      if (!term || !userId) return [];

      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .neq('user_id', userId)
        .ilike('username', `%${term}%`)
        .limit(10);

      return data || [];
    },
    enabled: debouncedSearch.length > 2
  });

  // Recipient for "new message": "@Name" and "name" both find @name. The
  // "no one has that username" hint waits for a settled lookup.
  const recipientName = normalizeUsername(newMessageRecipient);
  const debouncedRecipient = useDebouncedValue(recipientName, 300);
  const recipientSettled = debouncedRecipient === recipientName;
  const {
    data: recipient,
    isFetching: lookingUpRecipient,
    isError: recipientLookupFailed,
  } = useQuery({
    queryKey: ['recipient-lookup', debouncedRecipient.toLowerCase()],
    queryFn: async () => {
      if (!USERNAME_SHAPE.test(debouncedRecipient)) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .ilike('username', escapeLike(debouncedRecipient))
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: newConversationOpen && debouncedRecipient.length > 0,
    staleTime: 60_000,
  });
  const recipientReady = recipientSettled && !lookingUpRecipient;
  const recipientIsMe = !!recipient && recipient.user_id === userId;
  const recipientHint =
    !recipientName || !recipientReady || recipientLookupFailed
      ? null
      : recipient === null
        ? "no one has that username. check the spelling."
        : recipientIsMe
          ? "that is you."
          : null;
  const canStartConversation = recipientReady && !!recipient && !recipientIsMe;

  // Send direct message
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!userId || !partnerId || !newMessage.trim()) return null;

      const ms = messageTTL ? ttlMs[messageTTL] : undefined;
      const expiresAt = ms ? new Date(Date.now() + ms).toISOString() : null;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: userId,
          receiver_id: partnerId,
          content: newMessage,
          reply_to_id: replyTo?.id || null,
          expires_at: expiresAt,
          is_view_once: viewOnce
        })
        .select('*')
        .single();

      if (error) throw error;
      return { row: data, reply: replyTo, key: dmKey };
    },
    onSuccess: (result) => {
      setNewMessage("");
      setReplyTo(null);
      setViewOnce(false);
      if (result?.row) {
        const reply: ReplyRef | null = result.reply
          ? { id: result.reply.id, content: result.reply.content, sender_id: result.reply.senderName === 'you' ? userId ?? '' : partnerId ?? '' }
          : null;
        appendRow<DmMessage>(queryClient, result.key, { ...result.row, reply_to: reply });
      }
      void refreshConversations();
    },
    onError: (error) => {
      toast({ title: "not sent", description: sendFailure(error, "dm"), variant: "destructive" });
    }
  });

  // Send group message
  const sendGroupMessage = useMutation({
    mutationFn: async () => {
      if (!userId || !groupId || !newMessage.trim()) return;

      const { error } = await supabase.from('group_messages').insert({
        group_id: groupId,
        sender_id: userId,
        content: newMessage
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage("");
      void queryClient.invalidateQueries({ queryKey: groupKey });
      void queryClient.invalidateQueries({ queryKey: ['group-chats'] });
    },
    onError: (error) => {
      toast({ title: "not sent", description: sendFailure(error, "group"), variant: "destructive" });
    }
  });

  // Delete message
  const { mutate: deleteMessageMutate } = useMutation({
    mutationFn: async (messageId: string) => {
      if (!userId) throw new Error("not signed in");

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', userId);

      if (error) throw error;
      return { messageId, key: dmKey };
    },
    onSuccess: ({ messageId, key }) => {
      patchRows<DmMessage>(queryClient, key, (m) => (m.id === messageId ? null : m));
      void refreshConversations();
      toast({ title: "message deleted" });
    },
    onError: () => fail("could not delete that message."),
  });

  // Add or remove a reaction
  const { mutate: reactMutate } = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!userId) throw new Error("not signed in");

      const { data: existing, error: lookupError } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (existing) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('message_reactions').insert({
          message_id: messageId,
          user_id: userId,
          emoji
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['message-reactions', partnerId] });
    },
    onError: () => fail("could not react. try again."),
  });

  // Create group chat
  const createGroupChat = useMutation({
    mutationFn: async () => {
      if (!userId || !newGroupName.trim() || selectedMembers.length === 0) return null;

      const { data: group, error: groupError } = await supabase
        .from('group_chats')
        .insert({
          name: newGroupName,
          created_by: userId
        })
        .select()
        .single();

      if (groupError || !group) throw new UserFacingError("group not created. try again.");

      // One insert for everyone, so the group is never left half-built.
      const rows = [
        { group_id: group.id, user_id: userId, role: 'admin' },
        ...selectedMembers
          .filter((id) => id !== userId)
          .map((memberId) => ({ group_id: group.id, user_id: memberId, role: 'member' })),
      ];
      const { error: membersError } = await supabase.from('group_chat_members').insert(rows);
      if (membersError) {
        await supabase.from('group_chats').delete().eq('id', group.id);
        throw new UserFacingError("could not add those people, so the group was not created.");
      }

      return { group, memberCount: rows.length };
    },
    onSuccess: (result) => {
      if (result) {
        setSelectedGroup({
          id: result.group.id,
          name: result.group.name,
          description: result.group.description,
          avatar_url: result.group.avatar_url,
          member_count: result.memberCount
        });
        setSelectedUser(null);
      }
      setNewGroupName("");
      setSelectedMembers([]);
      setNewGroupOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['group-chats'] });
      toast({ title: "group created" });
    },
    onError: (error) => {
      toast({
        title: "group not created",
        description: error instanceof UserFacingError ? error.message : "something went wrong. try again.",
        variant: "destructive",
      });
    }
  });

  const conversationFromProfile = (
    profile: { user_id: string; username: string; display_name: string | null; avatar_url: string | null },
    last = { message: '', time: '' }
  ): Conversation => ({
    id: profile.user_id,
    user_id: profile.user_id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    last_message: last.message,
    last_message_time: last.time,
    unread: false,
    unread_count: 0,
    is_request: false,
  });

  // Start new conversation
  const startNewConversation = useMutation({
    mutationFn: async () => {
      if (!userId || !newConversationMessage.trim()) return null;
      if (!canStartConversation || !recipient) throw new UserFacingError("no one has that username. check the spelling.");

      const { error } = await supabase.from('messages').insert({
        sender_id: userId,
        receiver_id: recipient.user_id,
        content: newConversationMessage
      });

      if (error) throw error;

      return recipient;
    },
    onSuccess: (profile) => {
      if (profile) {
        setSelectedUser(conversationFromProfile(profile, { message: newConversationMessage, time: new Date().toISOString() }));
        setSelectedGroup(null);
      }
      setNewMessageRecipient("");
      setNewConversationMessage("");
      setNewConversationOpen(false);
      void refreshConversations();
      toast({ title: "message sent" });
    },
    onError: (error) => {
      toast({ title: "not sent", description: sendFailure(error, "dm"), variant: "destructive" });
    }
  });

  const acceptRequest = async (request: Conversation) => {
    if (!userId) return;
    const { error } = await supabase.from('dm_accepts').insert({ user_id: userId, partner_id: request.user_id });
    // Already accepted (e.g. in another tab) is fine.
    if (error && errorCode(error) !== '23505') {
      fail("could not accept. try again.");
      return;
    }
    queryClient.setQueryData<Conversation[]>(['conversations', userId], (prev) =>
      prev?.map((c) => (c.user_id === request.user_id ? { ...c, is_request: false } : c))
    );
    setSelectedUser({ ...request, is_request: false });
    setSelectedGroup(null);
    setActiveTab("all");
    void refreshConversations();
    void refreshUnread();
  };

  const declineRequest = async (request: Conversation) => {
    if (!userId) return;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('sender_id', request.user_id)
      .eq('receiver_id', userId);

    if (error) {
      fail("could not decline. try again.");
      return;
    }

    queryClient.setQueryData<Conversation[]>(['conversations', userId], (prev) =>
      prev?.filter((c) => c.user_id !== request.user_id)
    );
    if (selectedUser?.user_id === request.user_id) setSelectedUser(null);
    void refreshConversations();
    void refreshUnread();
    toast({ title: "request declined" });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (selectedGroup) {
      sendGroupMessage.mutate();
    } else {
      sendMessage.mutate();
    }
  };

  // Stable callbacks so memoized bubbles do not re-render while typing.
  const replyCtxRef = useRef({ messages, selectedUser, userId });
  replyCtxRef.current = { messages, selectedUser, userId };
  const handleReply = useCallback((messageId: string, content: string) => {
    const ctx = replyCtxRef.current;
    const senderName = ctx.messages.find(m => m.id === messageId)?.sender_id === ctx.userId
      ? 'you'
      : ctx.selectedUser?.display_name || ctx.selectedUser?.username || 'them';
    setReplyTo({ id: messageId, content, senderName });
  }, []);

  const handleReact = useCallback(
    (messageId: string, emoji: string) => reactMutate({ messageId, emoji }),
    [reactMutate]
  );

  const handleDeleteMessage = useCallback((messageId: string) => deleteMessageMutate(messageId), [deleteMessageMutate]);

  // Receiver opened a view-once message: record it (the database removes the
  // message a minute later). The bubble shows it until it unmounts, then "opened".
  const handleOpenViewOnce = useCallback(
    async (messageId: string) => {
      if (!userId) return;
      const stamp = new Date().toISOString();
      const { error } = await supabase
        .from('messages')
        .update({ viewed_at: stamp })
        .eq('id', messageId)
        .eq('receiver_id', userId)
        .is('viewed_at', null);
      if (error) {
        fail("could not open that message.");
        return;
      }
      patchRows<DmMessage>(queryClient, dmKey, (m) => (m.id === messageId ? { ...m, viewed_at: m.viewed_at ?? stamp } : m));
      void refreshConversations();
    },
    [userId, dmKey, queryClient, fail, refreshConversations]
  );

  const startConversation = (profile: { user_id: string; username: string; display_name: string | null; avatar_url: string | null }) => {
    setSelectedUser(conversationFromProfile(profile));
    setSelectedGroup(null);
    setSearchQuery("");
  };

  // Deep link from a profile's "Message" button: navigate('/messages', { state: { userId } }).
  // Open that direct conversation (adding a list entry if none exists yet) and clear the state.
  const targetUserId = (location.state as { userId?: string } | null)?.userId;
  useEffect(() => {
    if (!userId || !targetUserId || loadingConversations) return;
    let cancelled = false;

    (async () => {
      const existing = conversations?.find(c => c.user_id === targetUserId);
      if (existing) {
        setSelectedUser(existing);
        setSelectedGroup(null);
      } else {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url')
          .eq('user_id', targetUserId)
          .maybeSingle();
        if (cancelled) return;
        if (profile) {
          startConversation(profile);
          const entry = conversationFromProfile(profile);
          queryClient.setQueryData<Conversation[]>(['conversations', userId], (prev) =>
            prev?.some(c => c.user_id === entry.user_id) ? prev : [entry, ...(prev || [])]
          );
        }
      }
      if (!cancelled) navigate(location.pathname, { replace: true, state: null });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, targetUserId, loadingConversations]);

  const toggleMember = (memberId: string) => {
    setSelectedMembers(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Get wallpaper style
  const wallpaperUrl = cssUrl(userProfile?.message_wallpaper_url);
  const wallpaperStyle = useMemo(
    () => (wallpaperUrl ? { backgroundImage: wallpaperUrl, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
    [wallpaperUrl]
  );

  // ---------- presentation only from here ----------
  const threadOpen = !!(selectedUser || selectedGroup);
  const requestCount = requests.length;
  const q = searchQuery.trim().toLowerCase();

  // One list. Direct conversations and groups sit together, newest first;
  // the "groups" tab only narrows it. Requests live in their own tab.
  const allItems: ListItem[] = useMemo(
    () =>
      [
        ...directConversations.map((conv) => ({ kind: "dm" as const, conv })),
        ...(groupChats ?? []).map((group) => ({ kind: "group" as const, group })),
      ].sort((a, b) => {
        const ta = a.kind === "dm" ? a.conv.last_message_time : a.group.last_message_time ?? "";
        const tb = b.kind === "dm" ? b.conv.last_message_time : b.group.last_message_time ?? "";
        return tb.localeCompare(ta);
      }),
    [directConversations, groupChats]
  );
  const itemName = (item: ListItem) =>
    item.kind === "dm" ? `${item.conv.display_name ?? ""} ${item.conv.username}` : item.group.name;
  const visibleItems = (activeTab === "groups" ? allItems.filter((i) => i.kind === "group") : allItems).filter(
    (i) => !q || itemName(i).toLowerCase().includes(q)
  );
  const knownIds = new Set((conversations ?? []).map((c) => c.user_id));
  const people = (searchResults ?? []).filter((p) => !knownIds.has(p.user_id));
  const searchPending = q.length > 2 && (debouncedSearch.toLowerCase() !== q || searchingPeople);
  const loadingList = activeTab === "groups" ? loadingGroups : loadingConversations || loadingGroups;
  const listFailed = activeTab === "groups" ? groupsFailed : conversationsFailed || groupsFailed;
  const retryList = () => {
    if (conversationsFailed) void refetchConversations();
    if (groupsFailed) void refetchGroups();
  };

  const openItem = (item: ListItem) => {
    if (item.kind === "dm") {
      setSelectedUser(item.conv);
      setSelectedGroup(null);
    } else {
      setSelectedGroup(item.group);
      setSelectedUser(null);
    }
  };
  const closeThread = () => {
    setSelectedUser(null);
    setSelectedGroup(null);
  };

  const threadName = selectedUser ? selectedUser.display_name || selectedUser.username : selectedGroup?.name ?? "";
  const sending = selectedGroup ? sendGroupMessage.isPending : sendMessage.isPending;

  // Grouping and per-bubble props are derived from the thread data only, so
  // typing in the composer re-renders none of the bubbles.
  const partnerName = selectedUser ? selectedUser.display_name || selectedUser.username : "them";
  const dmRuns = useMemo(() => groupRuns(messages), [messages]);
  const replyLabels = useMemo(() => {
    const map = new Map<string, { id: string; content: string; senderName: string }>();
    for (const m of messages) {
      if (m.reply_to) {
        map.set(m.id, {
          id: m.reply_to.id,
          content: m.reply_to.content,
          senderName: m.reply_to.sender_id === userId ? "you" : partnerName,
        });
      }
    }
    return map;
  }, [messages, userId, partnerName]);
  const groupThreadRuns = useMemo(() => groupRuns(groupMessages), [groupMessages]);

  const tabs: { id: ListTab; label: string }[] = [
    { id: "all", label: "all" },
    { id: "groups", label: "groups" },
    { id: "requests", label: "requests" },
  ];

  const headerActions = (
    <>
      <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <DialogTrigger asChild>
          <button aria-label="new group" title="new group" className="quiet p-2 rounded-md">
            <Users className="w-4 h-4" />
          </button>
        </DialogTrigger>
        <DialogContent className="glass-panel border rounded-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-extralight lowercase tracking-[-0.02em]">new group</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-1">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="group name."
              aria-label="group name"
              className="field w-full h-10 text-[15px] font-light text-foreground placeholder:text-foreground/35"
            />
            <div>
              <input
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                placeholder="add people."
                aria-label="add people"
                className="field w-full h-10 text-[14px] font-light text-foreground placeholder:text-foreground/35"
              />
              {memberSearchResults && memberSearchResults.length > 0 && (
                <div className="mt-1 max-h-44 overflow-y-auto">
                  {memberSearchResults.map((profile) => {
                    const on = selectedMembers.includes(profile.user_id);
                    return (
                      <button
                        key={profile.user_id}
                        onClick={() => toggleMember(profile.user_id)}
                        aria-pressed={on}
                        className="row w-full flex items-center gap-3 px-1 py-2.5 text-left"
                      >
                        <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="sm" />
                        <span className={`flex-1 min-w-0 truncate text-[14px] font-light ${on ? "text-foreground" : "text-foreground/70"}`}>
                          {profile.display_name || profile.username}
                          <span className="text-foreground/40 ml-2">@{profile.username}</span>
                        </span>
                        {on && <Check className="w-4 h-4 text-foreground/70" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedMembers.length > 0 && (
                <p className="mt-2 text-[12px] font-light text-foreground/45 tabular-nums">
                  {selectedMembers.length} {selectedMembers.length === 1 ? "person" : "people"}
                </p>
              )}
            </div>
            <Button
              onClick={() => createGroupChat.mutate()}
              disabled={!newGroupName.trim() || selectedMembers.length === 0 || createGroupChat.isPending}
              variant="signal"
              size="sm"
              className="shadow-none"
            >
              {createGroupChat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "create group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
        <DialogTrigger asChild>
          <button aria-label="new message" title="new message" className="quiet p-2 -mr-2 rounded-md">
            <Plus className="w-4 h-4" />
          </button>
        </DialogTrigger>
        <DialogContent className="glass-panel border rounded-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[20px] font-extralight lowercase tracking-[-0.02em]">new message</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-1">
            <div>
              <input
                value={newMessageRecipient}
                onChange={(e) => setNewMessageRecipient(e.target.value)}
                placeholder="@username"
                aria-label="to"
                aria-describedby={recipientHint ? "recipient-hint" : undefined}
                autoComplete="off"
                className="field w-full h-10 text-[15px] font-light text-foreground placeholder:text-foreground/35"
              />
              {recipientHint && (
                <p id="recipient-hint" className="mt-1.5 text-[12px] font-light text-foreground/45">{recipientHint}</p>
              )}
            </div>
            <textarea
              value={newConversationMessage}
              onChange={(e) => setNewConversationMessage(e.target.value)}
              placeholder="write something."
              aria-label="message"
              rows={3}
              className="field w-full resize-none text-[15px] font-light leading-relaxed text-foreground placeholder:text-foreground/35"
            />
            <Button
              onClick={() => startNewConversation.mutate()}
              disabled={!canStartConversation || !newConversationMessage.trim() || startNewConversation.isPending}
              variant="signal"
              size="sm"
              className="shadow-none"
            >
              {startNewConversation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "send"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  const listControls = (
    <div>
      <div role="tablist" aria-label="conversations" className="flex items-center gap-6 border-b border-foreground/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className="text-tab text-[14px] whitespace-nowrap"
          >
            {t.label}
            {t.id === "requests" && requestCount > 0 && (
              <span className="ml-1.5 text-[11px] tabular-nums text-signal">{requestCount}</span>
            )}
          </button>
        ))}
      </div>
      {activeTab !== "requests" && (
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="search people."
          aria-label="search people"
          autoComplete="off"
          className="field w-full h-10 mt-3 text-[14px] font-light text-foreground placeholder:text-foreground/35 [&::-webkit-search-cancel-button]:appearance-none"
        />
      )}
    </div>
  );

  const conversationList = (
    <>
      {loadingList ? (
        <ListSkeleton />
      ) : listFailed ? (
        <LoadError label="conversations did not load." onRetry={retryList} />
      ) : visibleItems.length > 0 ? (
        <div className="stagger">
          {visibleItems.map((item, idx) => {
            const isDm = item.kind === "dm";
            const selected = isDm ? selectedUser?.id === item.conv.id : selectedGroup?.id === item.group.id;
            const unread = isDm && item.conv.unread;
            const name = isDm ? item.conv.display_name || item.conv.username : item.group.name;
            const last = isDm
              ? item.conv.last_message
              : item.group.last_message || `${item.group.member_count} ${item.group.member_count === 1 ? "member" : "members"}`;
            const time = shortTime(isDm ? item.conv.last_message_time : item.group.last_message_time);
            return (
              <button
                key={isDm ? `dm-${item.conv.id}` : `g-${item.group.id}`}
                onClick={() => openItem(item)}
                aria-current={selected ? "true" : undefined}
                style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
                className={`row w-full flex items-center gap-3 px-5 sm:px-8 py-3.5 text-left ${selected ? "bg-foreground/[0.04]" : ""}`}
              >
                {isDm ? (
                  <UserAvatar avatarUrl={item.conv.avatar_url} username={item.conv.username} size="sm" className="shrink-0" />
                ) : (
                  <GroupMark />
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate text-[14px] font-light ${unread ? "text-foreground" : "text-foreground/70"}`}>{name}</span>
                    <span className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] font-light text-foreground/35 tabular-nums">
                      {time}
                      {unread && (
                        <>
                          <span aria-hidden className="w-[5px] h-[5px] rounded-full bg-signal" />
                          <span className="sr-only">unread</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className={`block truncate text-[13px] font-light mt-0.5 ${unread ? "text-foreground/70" : "text-foreground/40"}`}>
                    {last || <span className="text-foreground/30">no messages yet</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : q ? (
        people.length === 0 && !searchPending && (
          <p className="px-5 sm:px-8 py-10 text-[14px] font-light text-foreground/45">
            {q.length > 2 ? `nobody matches "${searchQuery.trim()}".` : "keep typing to search people."}
          </p>
        )
      ) : activeTab === "groups" ? (
        <EmptyState
          title="no groups yet."
          description="a group is a room with a few people in it."
          actionLabel="new group"
          onAction={() => setNewGroupOpen(true)}
        />
      ) : (
        <EmptyState
          title="nothing here yet."
          description="write to someone and it starts here."
          actionLabel="new message"
          onAction={() => setNewConversationOpen(true)}
        />
      )}

      {people.length > 0 && (
        <div>
          <p className="px-5 sm:px-8 pt-5 pb-1.5 text-[10px] font-light uppercase tracking-[0.24em] text-foreground/35">people</p>
          {people.map((profile) => (
            <button
              key={profile.user_id}
              onClick={() => startConversation(profile)}
              className="row w-full flex items-center gap-3 px-5 sm:px-8 py-3 text-left"
            >
              <UserAvatar avatarUrl={profile.avatar_url} username={profile.username} size="sm" className="shrink-0" />
              <span className="flex-1 min-w-0 truncate text-[14px] font-light text-foreground/70">
                {profile.display_name || profile.username}
                <span className="text-foreground/40 ml-2">@{profile.username}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  const requestList = loadingConversations ? (
    <ListSkeleton count={2} />
  ) : conversationsFailed ? (
    <LoadError label="requests did not load." onRetry={() => { void refetchConversations(); }} />
  ) : requestCount > 0 ? (
    <div className="stagger">
      {requests.map((request, idx) => (
        <div key={request.id} className="row px-5 sm:px-8 py-4" style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}>
          <div className="flex items-start gap-3">
            <UserAvatar avatarUrl={request.avatar_url} username={request.username} size="sm" className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="flex items-baseline gap-2 text-[14px] font-light">
                <span className="text-foreground truncate">{request.display_name || request.username}</span>
                <span className="text-foreground/40 truncate">@{request.username}</span>
                <span className="ml-auto shrink-0 text-[11px] text-foreground/35 tabular-nums">{shortTime(request.last_message_time)}</span>
              </p>
              <p className="mt-1 text-[13px] font-light text-foreground/60 line-clamp-2">{request.last_message}</p>
              <div className="mt-1.5 -ml-1 flex items-center gap-3 text-[13px] font-light">
                <button onClick={() => acceptRequest(request)} className="h-10 px-1 text-foreground hover:text-signal transition-colors">
                  accept
                </button>
                <button onClick={() => declineRequest(request)} className="quiet h-10 px-1">
                  decline
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <EmptyState title="no requests." description="people you have not written to yet land here first." />
  );

  const composer = (
    <div className="shrink-0 border-t border-foreground/10 px-5 sm:px-8 pt-2 pb-3">
      {replyTo && !selectedGroup && (
        <div className="mb-2 pl-3 border-l border-foreground/25 flex items-start gap-3">
          <div className="flex-1 min-w-0 text-[12px] font-light">
            <p className="text-foreground/45">replying to {replyTo.senderName}</p>
            <p className="truncate text-foreground/70">{replyTo.content}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="cancel reply" className="quiet p-1.5 -mr-1.5 rounded-md">
            <X className="w-[15px] h-[15px]" />
          </button>
        </div>
      )}
      <form onSubmit={handleSend} className="flex items-center gap-0.5">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={`write to ${threadName}.`}
          aria-label={`write to ${threadName}`}
          autoComplete="off"
          className="field flex-1 min-w-0 h-10 mr-2 text-[15px] font-light text-foreground placeholder:text-foreground/35"
        />
        {!selectedGroup && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={messageTTL ? `auto-delete after ${messageTTL}` : "auto-delete"}
                  aria-pressed={!!messageTTL}
                  title="auto-delete"
                  className="quiet inline-flex items-center justify-center gap-1 h-10 min-w-10 px-2 rounded-md text-[11px] tabular-nums"
                >
                  <Timer className="w-4 h-4" />
                  {messageTTL && <span>{messageTTL}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="end" className="glass-panel border rounded-md w-40 p-1.5">
                <p className="px-2 pt-1 pb-1.5 text-[11px] font-light text-foreground/40">auto-delete after</p>
                {[
                  { value: null, label: "never" },
                  { value: "1h", label: "1 hour" },
                  { value: "24h", label: "24 hours" },
                  { value: "7d", label: "7 days" },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.label}
                    onClick={() => setMessageTTL(opt.value)}
                    aria-pressed={messageTTL === opt.value}
                    className="quiet w-full text-left text-[13px] font-light px-2 py-1.5 rounded-md"
                  >
                    {opt.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => setViewOnce(!viewOnce)}
              aria-pressed={viewOnce}
              aria-label="view once"
              title="view once"
              className="quiet inline-flex items-center justify-center h-10 w-10 rounded-md"
            >
              <Eye className="w-4 h-4" />
            </button>
            {replyTo && (
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-pressed
                aria-label="replying. press to cancel"
                title="replying"
                className="quiet inline-flex items-center justify-center h-10 w-10 rounded-md"
              >
                <Reply className="w-4 h-4" />
              </button>
            )}
          </>
        )}
        <Button type="submit" variant="signal" size="sm" disabled={!newMessage.trim() || sending} className="shadow-none h-9 px-3.5 ml-1.5">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "send"}
        </Button>
      </form>
    </div>
  );

  return (
    <DashboardLayout wide>
      <div className="flex h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] lg:h-[100dvh]">
        {/* Conversations */}
        <section
          aria-label="conversations"
          className={`w-full lg:w-[320px] lg:shrink-0 flex-col min-h-0 lg:border-r lg:border-foreground/10 ${threadOpen ? "hidden lg:flex" : "flex"}`}
        >
          <PageHeader title="messages" subtitle="between you and them." actions={headerActions} belowRow={listControls} />
          <div className="flex-1 min-h-0 overflow-y-auto">{activeTab === "requests" ? requestList : conversationList}</div>
        </section>

        {/* Thread */}
        <section aria-label="thread" className={`flex-1 min-w-0 flex-col min-h-0 pt-12 lg:pt-0 ${threadOpen ? "flex" : "hidden lg:flex"}`}>
          {threadOpen ? (
            <>
              <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 h-14 border-b border-foreground/10">
                <button onClick={closeThread} aria-label="back to conversations" className="quiet lg:hidden p-2 -ml-2 rounded-md">
                  <ArrowLeft className="w-[17px] h-[17px]" />
                </button>
                {selectedUser ? (
                  <UserAvatar avatarUrl={selectedUser.avatar_url} username={selectedUser.username} size="sm" className="shrink-0" />
                ) : (
                  <GroupMark />
                )}
                <div className="min-w-0 flex-1 flex items-baseline gap-2 text-[14px] font-light">
                  <span className="text-foreground truncate">{threadName}</span>
                  <span className="text-foreground/40 truncate">
                    {selectedUser
                      ? `@${selectedUser.username}`
                      : `${selectedGroup?.member_count ?? 0} ${selectedGroup?.member_count === 1 ? "member" : "members"}`}
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="more" className="quiet p-2 -mr-2 rounded-md">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="glass-panel border rounded-md min-w-[160px]">
                    {selectedUser && (
                      <DropdownMenuItem onClick={() => navigate(`/user/${selectedUser.username}`)} className="text-[13px] font-light">
                        view profile
                      </DropdownMenuItem>
                    )}
                    {selectedGroup?.description && (
                      <DropdownMenuItem disabled className="text-[13px] font-light text-foreground/60">
                        {selectedGroup.description}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={closeThread} className="text-[13px] font-light">
                      close
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {selectedUser ? (
                <div className="flex-1 min-h-0 overflow-y-auto message-container message-protected message-watermark" style={wallpaperStyle}>
                  {loadingMessages ? (
                    <ThreadSkeleton />
                  ) : dmQuery.isError ? (
                    <LoadError label="messages did not load." onRetry={() => { void dmQuery.refetch(); }} />
                  ) : messages.length > 0 ? (
                    <div className="flex flex-col gap-5 px-5 sm:px-8 py-6">
                      {dmQuery.hasNextPage && (
                        <EarlierButton onClick={() => { void dmQuery.fetchNextPage(); }} loading={dmQuery.isFetchingNextPage} />
                      )}
                      {renderRuns(dmRuns, (msg, _first, last) => (
                        <MessageBubble
                          key={msg.id}
                          id={msg.id}
                          content={msg.content}
                          senderId={msg.sender_id}
                          currentUserId={userId || ""}
                          createdAt={msg.created_at}
                          readAt={msg.read_at}
                          isViewOnce={!!msg.is_view_once}
                          viewedAt={msg.viewed_at}
                          onOpenViewOnce={handleOpenViewOnce}
                          showTime={last}
                          replyTo={replyLabels.get(msg.id) ?? null}
                          onDelete={handleDeleteMessage}
                          onReply={handleReply}
                          onReact={handleReact}
                          reactions={reactions?.get(msg.id) ?? NO_REACTIONS}
                        />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <p className="px-5 sm:px-8 py-14 text-[14px] font-light text-foreground/45">nothing yet. say hello.</p>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto message-container message-protected" style={wallpaperStyle}>
                  {loadingGroupMessages ? (
                    <ThreadSkeleton />
                  ) : groupQuery.isError ? (
                    <LoadError label="messages did not load." onRetry={() => { void groupQuery.refetch(); }} />
                  ) : groupMessages.length > 0 ? (
                    <div className="flex flex-col gap-5 px-5 sm:px-8 py-6">
                      {groupQuery.hasNextPage && (
                        <EarlierButton onClick={() => { void groupQuery.fetchNextPage(); }} loading={groupQuery.isFetchingNextPage} />
                      )}
                      {renderRuns(groupThreadRuns, (msg, first, last) => (
                        <MessageBubble
                          key={msg.id}
                          id={msg.id}
                          content={msg.content}
                          senderId={msg.sender_id}
                          currentUserId={userId || ""}
                          createdAt={msg.created_at}
                          sender={msg.sender}
                          showSenderInfo={first}
                          showTime={last}
                        />
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  ) : (
                    <p className="px-5 sm:px-8 py-14 text-[14px] font-light text-foreground/45">nothing yet. say hello.</p>
                  )}
                </div>
              )}

              {composer}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
              <p className="text-[15px] font-light text-foreground/50">pick a conversation, or start one.</p>
              <button
                onClick={() => setNewConversationOpen(true)}
                className="mt-3 text-[14px] font-light text-foreground hover:text-signal transition-colors"
              >
                new message
              </button>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
};

export default Messages;
