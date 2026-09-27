import { useState, useEffect, useRef, Fragment } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import UserAvatar from "@/components/UserAvatar";
import MessageBubble from "@/components/messages/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useNotifications } from "@/hooks/useNotifications";
import { escapeFilterValue, cssUrl } from "@/lib/sanitize";
import "@/styles/message-protection.css";

interface Conversation {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  last_message: string;
  last_message_time: string;
  unread: boolean;
  is_group?: boolean;
  group_name?: string;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  receiver_id?: string;
  group_id?: string;
  created_at: string;
  read_at?: string | null;
  reply_to_id?: string | null;
  reply_to?: {
    id: string;
    content: string;
    sender_id: string;
  } | null;
}

interface MessageRequest {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string | null;
  sender_avatar_url: string | null;
  message: string;
  created_at: string;
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setUnreadMessages } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();

  // Fetch user profile for message wallpaper
  const { data: userProfile } = useQuery({
    queryKey: ['profile-wallpaper', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('message_wallpaper_url')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user
  });

  // Fetch conversations (declared below). We compute message arrays before the
  // scroll effect so the dependency array references the live data.

  // Fetch conversations
  const { data: conversations, isLoading: loadingConversations } = useQuery({
    queryKey: ['conversations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // Pull just the most recent slice rather than the entire message history.
      // For users with thousands of messages, an unbounded query would OOM the
      // browser and hit Supabase's default 1000-row cap unpredictably.
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (!messages || messages.length === 0) return [];

      const conversationMap = new Map<string, Message>();
      messages.forEach(msg => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (!conversationMap.has(partnerId)) {
          conversationMap.set(partnerId, msg);
        }
      });

      const partnerIds = Array.from(conversationMap.keys());
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', partnerIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      return partnerIds.map(partnerId => {
        const msg = conversationMap.get(partnerId)!;
        const profile = profilesMap.get(partnerId);
        return {
          id: partnerId,
          user_id: partnerId,
          username: profile?.username || 'Unknown',
          display_name: profile?.display_name,
          avatar_url: profile?.avatar_url,
          last_message: msg.content,
          last_message_time: msg.created_at,
          unread: msg.receiver_id === user.id && !msg.read_at
        };
      });
    },
    enabled: !!user
  });

  // Fetch group chats
  const { data: groupChats, isLoading: loadingGroups } = useQuery({
    queryKey: ['group-chats', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: memberships } = await supabase
        .from('group_chat_members')
        .select('group_id')
        .eq('user_id', user.id);
      
      if (!memberships || memberships.length === 0) return [];
      
      const groupIds = memberships.map(m => m.group_id);
      const { data: groups } = await supabase
        .from('group_chats')
        .select('*')
        .in('id', groupIds);

      // Replace the N+1 cascade with two batched queries: one for all members
      // across all groups, one for recent messages across all groups. We then
      // reduce client-side to per-group counts and last-message metadata.
      const [{ data: allMembers }, { data: recentMsgs }] = await Promise.all([
        supabase
          .from('group_chat_members')
          .select('group_id')
          .in('group_id', groupIds),
        supabase
          .from('group_messages')
          .select('group_id, content, created_at')
          .in('group_id', groupIds)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

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
    enabled: !!user
  });

  // Fetch message requests
  const { data: messageRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ['message-requests', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data: receivedMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: true });
      
      const { data: sentMessages } = await supabase
        .from('messages')
        .select('sender_id, receiver_id')
        .eq('sender_id', user.id);
      
      const sentToIds = new Set(sentMessages?.map(m => m.receiver_id) || []);
      
      const requestsMap = new Map<string, Message>();
      receivedMessages?.forEach(msg => {
        if (!sentToIds.has(msg.sender_id) && !requestsMap.has(msg.sender_id)) {
          requestsMap.set(msg.sender_id, msg);
        }
      });
      
      if (requestsMap.size === 0) return [];
      
      const senderIds = Array.from(requestsMap.keys());
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', senderIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return senderIds.map(senderId => {
        const msg = requestsMap.get(senderId)!;
        const profile = profilesMap.get(senderId);
        return {
          id: msg.id,
          sender_id: senderId,
          sender_username: profile?.username || 'Unknown',
          sender_display_name: profile?.display_name,
          sender_avatar_url: profile?.avatar_url,
          message: msg.content,
          created_at: msg.created_at
        };
      });
    },
    enabled: !!user
  });

  // Fetch messages for selected conversation
  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', selectedUser?.user_id],
    queryFn: async () => {
      if (!user || !selectedUser) return [];
      
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedUser.user_id}),and(sender_id.eq.${selectedUser.user_id},receiver_id.eq.${user.id})`)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: true });
      
      // Fetch reply-to messages
      const replyIds = data?.filter(m => m.reply_to_id).map(m => m.reply_to_id) || [];
      let repliesMap = new Map();
      if (replyIds.length > 0) {
        const { data: replies } = await supabase
          .from('messages')
          .select('id, content, sender_id')
          .in('id', replyIds);
        repliesMap = new Map(replies?.map(r => [r.id, r]) || []);
      }
      
      // Mark messages as read
      if (data && data.length > 0) {
        const unreadIds = data
          .filter(m => m.receiver_id === user.id && !m.read_at)
          .map(m => m.id);
        
        if (unreadIds.length > 0) {
          await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .in('id', unreadIds);
          
          setUnreadMessages(prev => Math.max(0, prev - unreadIds.length));
        }
      }
      
      return data?.map(msg => ({
        ...msg,
        reply_to: msg.reply_to_id ? repliesMap.get(msg.reply_to_id) : null
      })) || [];
    },
    enabled: !!user && !!selectedUser
  });

  // Fetch message reactions. The message ids live in the queryKey so reactions
  // refetch when new messages arrive, and are read back from the key rather
  // than from a possibly stale closure over `messages`.
  const messageIds = messages?.map(m => m.id) ?? [];
  const { data: reactions } = useQuery({
    queryKey: ['message-reactions', selectedUser?.user_id, messageIds],
    queryFn: async ({ queryKey }) => {
      const ids = queryKey[2] as string[];
      if (!user || !selectedUser) return new Map();
      if (ids.length === 0) return new Map();
      
      const { data } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', ids);
      
      // Group reactions by message
      const reactionsMap = new Map<string, { emoji: string; count: number; hasReacted: boolean }[]>();
      
      data?.forEach(reaction => {
        const existing = reactionsMap.get(reaction.message_id) || [];
        const emojiIndex = existing.findIndex(e => e.emoji === reaction.emoji);
        
        if (emojiIndex >= 0) {
          existing[emojiIndex].count++;
          if (reaction.user_id === user.id) {
            existing[emojiIndex].hasReacted = true;
          }
        } else {
          existing.push({
            emoji: reaction.emoji,
            count: 1,
            hasReacted: reaction.user_id === user.id
          });
        }
        
        reactionsMap.set(reaction.message_id, existing);
      });
      
      return reactionsMap;
    },
    enabled: !!user && !!selectedUser && messageIds.length > 0
  });

  // Fetch group messages
  const { data: groupMessages, isLoading: loadingGroupMessages } = useQuery({
    queryKey: ['group-messages', selectedGroup?.id],
    queryFn: async () => {
      if (!user || !selectedGroup) return [];
      
      const { data } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', selectedGroup.id)
        .order('created_at', { ascending: true });
      
      // Get sender profiles
      const senderIds = [...new Set(data?.map(m => m.sender_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', senderIds);
      
      const profilesMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      return data?.map(msg => ({
        ...msg,
        sender: profilesMap.get(msg.sender_id)
      })) || [];
    },
    enabled: !!user && !!selectedGroup
  });

  // Search users for adding to group
  const { data: memberSearchResults } = useQuery({
    queryKey: ['search-members', memberSearchQuery],
    queryFn: async () => {
      const term = escapeFilterValue(memberSearchQuery);
      if (!term || !user) return [];
      
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .neq('user_id', user.id)
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(10);
      
      return data || [];
    },
    enabled: memberSearchQuery.length > 1
  });

  // Scroll to the bottom of the active conversation whenever NEW messages
  // arrive — not just when the conversation switches. Depending on the
  // selected* objects (as before) meant incoming messages stacked below the
  // viewport without the user noticing.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, groupMessages?.length, selectedUser?.user_id, selectedGroup?.id]);

  // Realtime subscription: keep DM, group, and conversation-list queries fresh
  // without forcing the user to refresh. Without this, Messages was effectively
  // a snapshot, not a chat.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`messages-user-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations', user.id] });
          queryClient.invalidateQueries({ queryKey: ['message-requests', user.id] });
          if (selectedUser?.user_id) {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedUser.user_id] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations', user.id] });
          if (selectedUser?.user_id) {
            queryClient.invalidateQueries({ queryKey: ['messages', selectedUser.user_id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, selectedUser?.user_id, queryClient]);

  // Separate channel for group messages — filtered to the active group only.
  useEffect(() => {
    if (!user?.id || !selectedGroup?.id) return;

    const channel = supabase
      .channel(`group-messages-${selectedGroup.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_messages', filter: `group_id=eq.${selectedGroup.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroup.id] });
          queryClient.invalidateQueries({ queryKey: ['group-chats', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, selectedGroup?.id, queryClient]);

  // Search users
  const { data: searchResults } = useQuery({
    queryKey: ['search-users', searchQuery],
    queryFn: async () => {
      const term = escapeFilterValue(searchQuery);
      if (!term || !user) return [];
      
      const { data } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .neq('user_id', user.id)
        .ilike('username', `%${term}%`)
        .limit(10);
      
      return data || [];
    },
    enabled: searchQuery.length > 2
  });

  // Send direct message
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!user || !selectedUser || !newMessage.trim()) return;
      
      let expiresAt: string | null = null;
      if (messageTTL) {
        const now = new Date();
        const ttlMs = {
          '1h': 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
        }[messageTTL];
        if (ttlMs) expiresAt = new Date(now.getTime() + ttlMs).toISOString();
      }

      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: selectedUser.user_id,
        content: newMessage,
        reply_to_id: replyTo?.id || null,
        expires_at: expiresAt,
        is_view_once: viewOnce
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage("");
      setReplyTo(null);
      setViewOnce(false);
      queryClient.invalidateQueries({ queryKey: ['messages', selectedUser?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error) => {
      toast({ title: "not sent", description: error.message, variant: "destructive" });
    }
  });

  // Send group message
  const sendGroupMessage = useMutation({
    mutationFn: async () => {
      if (!user || !selectedGroup || !newMessage.trim()) return;
      
      const { error } = await supabase.from('group_messages').insert({
        group_id: selectedGroup.id,
        sender_id: user.id,
        content: newMessage
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroup?.id] });
      queryClient.invalidateQueries({ queryKey: ['group-chats'] });
    },
    onError: (error) => {
      toast({ title: "not sent", description: error.message, variant: "destructive" });
    }
  });

  // Delete message
  const deleteMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!user) return;
      
      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .eq('sender_id', user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', selectedUser?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: "message deleted" });
    }
  });

  // Add reaction
  const addReaction = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user) return;
      
      // Check if already reacted
      const { data: existing } = await supabase
        .from('message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji)
        .maybeSingle();
      
      if (existing) {
        // Remove reaction
        await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existing.id);
      } else {
        // Add reaction
        await supabase.from('message_reactions').insert({
          message_id: messageId,
          user_id: user.id,
          emoji
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', selectedUser?.user_id] });
    }
  });

  // Create group chat
  const createGroupChat = useMutation({
    mutationFn: async () => {
      if (!user || !newGroupName.trim() || selectedMembers.length === 0) return;
      
      const { data: group, error: groupError } = await supabase
        .from('group_chats')
        .insert({
          name: newGroupName,
          created_by: user.id
        })
        .select()
        .single();
      
      if (groupError) throw groupError;
      
      await supabase.from('group_chat_members').insert({
        group_id: group.id,
        user_id: user.id,
        role: 'admin'
      });
      
      await Promise.all(selectedMembers.map(memberId => 
        supabase.from('group_chat_members').insert({
          group_id: group.id,
          user_id: memberId,
          role: 'member'
        })
      ));
      
      return group;
    },
    onSuccess: (group) => {
      if (group) {
        setSelectedGroup({
          id: group.id,
          name: group.name,
          description: group.description,
          avatar_url: group.avatar_url,
          member_count: selectedMembers.length + 1
        });
        setSelectedUser(null);
      }
      setNewGroupName("");
      setSelectedMembers([]);
      setNewGroupOpen(false);
      queryClient.invalidateQueries({ queryKey: ['group-chats'] });
      toast({ title: "group created" });
    },
    onError: (error) => {
      toast({ title: "group not created", description: error.message, variant: "destructive" });
    }
  });

  // Start new conversation
  const startNewConversation = useMutation({
    mutationFn: async () => {
      if (!user || !newMessageRecipient.trim() || !newConversationMessage.trim()) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .eq('username', newMessageRecipient.trim())
        .single();
      
      if (!profile) throw new Error("no one has that username. check the spelling.");
      
      const { error } = await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: profile.user_id,
        content: newConversationMessage
      });
      
      if (error) throw error;
      
      return profile;
    },
    onSuccess: (profile) => {
      if (profile) {
        setSelectedUser({
          id: profile.user_id,
          user_id: profile.user_id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          last_message: newConversationMessage,
          last_message_time: new Date().toISOString(),
          unread: false
        });
        setSelectedGroup(null);
      }
      setNewMessageRecipient("");
      setNewConversationMessage("");
      setNewConversationOpen(false);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: "message sent" });
    },
    onError: (error) => {
      toast({ title: "not sent", description: error.message, variant: "destructive" });
    }
  });

  const acceptRequest = async (request: MessageRequest) => {
    setSelectedUser({
      id: request.sender_id,
      user_id: request.sender_id,
      username: request.sender_username,
      display_name: request.sender_display_name,
      avatar_url: request.sender_avatar_url,
      last_message: request.message,
      last_message_time: request.created_at,
      unread: false
    });
    setSelectedGroup(null);
    setActiveTab("all");
  };

  const declineRequest = async (request: MessageRequest) => {
    if (!user) return;
    
    await supabase
      .from('messages')
      .delete()
      .eq('sender_id', request.sender_id)
      .eq('receiver_id', user.id);
    
    queryClient.invalidateQueries({ queryKey: ['message-requests'] });
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

  const handleReply = (messageId: string, content: string) => {
    const senderName = messages?.find(m => m.id === messageId)?.sender_id === user?.id 
      ? 'you'
      : selectedUser?.display_name || selectedUser?.username || 'them';
    setReplyTo({ id: messageId, content, senderName });
  };

  const handleReact = (messageId: string, emoji: string) => {
    addReaction.mutate({ messageId, emoji });
  };

  const handleDeleteMessage = (messageId: string) => {
    deleteMessage.mutate(messageId);
  };

  const startConversation = (profile: { user_id: string; username: string; display_name: string | null; avatar_url: string | null }) => {
    setSelectedUser({
      id: profile.user_id,
      user_id: profile.user_id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      last_message: '',
      last_message_time: '',
      unread: false
    });
    setSelectedGroup(null);
    setSearchQuery("");
  };

  // Deep link from a profile's "Message" button: navigate('/messages', { state: { userId } }).
  // Open that direct conversation (adding a list entry if none exists yet) and clear the state.
  const targetUserId = (location.state as { userId?: string } | null)?.userId;
  useEffect(() => {
    if (!user || !targetUserId || loadingConversations) return;
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
          const entry: Conversation = {
            id: profile.user_id,
            user_id: profile.user_id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            last_message: '',
            last_message_time: '',
            unread: false,
          };
          queryClient.setQueryData<Conversation[]>(['conversations', user.id], (prev) =>
            prev?.some(c => c.user_id === entry.user_id) ? prev : [entry, ...(prev || [])]
          );
        }
      }
      if (!cancelled) navigate(location.pathname, { replace: true, state: null });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, targetUserId, loadingConversations]);

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Get wallpaper style
  const wallpaperUrl = cssUrl(userProfile?.message_wallpaper_url);
  const wallpaperStyle = wallpaperUrl
    ? { backgroundImage: wallpaperUrl, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {};

  // ---------- presentation only from here ----------
  const threadOpen = !!(selectedUser || selectedGroup);
  const requestCount = messageRequests?.length ?? 0;
  const q = searchQuery.trim().toLowerCase();

  // One list. Direct conversations and groups sit together, newest first;
  // the "groups" tab only narrows it.
  const allItems: ListItem[] = [
    ...(conversations ?? []).map((conv) => ({ kind: "dm" as const, conv })),
    ...(groupChats ?? []).map((group) => ({ kind: "group" as const, group })),
  ].sort((a, b) => {
    const ta = a.kind === "dm" ? a.conv.last_message_time : a.group.last_message_time ?? "";
    const tb = b.kind === "dm" ? b.conv.last_message_time : b.group.last_message_time ?? "";
    return tb.localeCompare(ta);
  });
  const itemName = (item: ListItem) =>
    item.kind === "dm" ? `${item.conv.display_name ?? ""} ${item.conv.username}` : item.group.name;
  const visibleItems = (activeTab === "groups" ? allItems.filter((i) => i.kind === "group") : allItems).filter(
    (i) => !q || itemName(i).toLowerCase().includes(q)
  );
  const knownIds = new Set((conversations ?? []).map((c) => c.user_id));
  const people = (searchResults ?? []).filter((p) => !knownIds.has(p.user_id));
  const loadingList = activeTab === "groups" ? loadingGroups : loadingConversations || loadingGroups;

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

  const GroupMark = ({ className = "" }: { className?: string }) => (
    <span className={`w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center shrink-0 ${className}`} aria-hidden>
      <Users className="w-[15px] h-[15px] text-foreground/60" />
    </span>
  );

  const renderRuns = <T extends { id: string; sender_id: string; created_at: string }>(
    list: T[],
    render: (msg: T, isFirst: boolean, isLast: boolean) => React.ReactNode
  ) => {
    let prevDay = "";
    return groupRuns(list).map((run) => {
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
            <input
              value={newMessageRecipient}
              onChange={(e) => setNewMessageRecipient(e.target.value)}
              placeholder="@username"
              aria-label="to"
              autoComplete="off"
              className="field w-full h-10 text-[15px] font-light text-foreground placeholder:text-foreground/35"
            />
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
              disabled={!newMessageRecipient.trim() || !newConversationMessage.trim() || startNewConversation.isPending}
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
        people.length === 0 && (
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

  const requestList = loadingRequests ? (
    <ListSkeleton count={2} />
  ) : requestCount > 0 ? (
    <div className="stagger">
      {messageRequests!.map((request, idx) => (
        <div key={request.id} className="row px-5 sm:px-8 py-4" style={{ "--i": idx } as React.CSSProperties}>
          <div className="flex items-start gap-3">
            <UserAvatar avatarUrl={request.sender_avatar_url} username={request.sender_username} size="sm" className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="flex items-baseline gap-2 text-[14px] font-light">
                <span className="text-foreground truncate">{request.sender_display_name || request.sender_username}</span>
                <span className="text-foreground/40 truncate">@{request.sender_username}</span>
                <span className="ml-auto shrink-0 text-[11px] text-foreground/35 tabular-nums">{shortTime(request.created_at)}</span>
              </p>
              <p className="mt-1 text-[13px] font-light text-foreground/60 line-clamp-2">{request.message}</p>
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
                  ) : messages && messages.length > 0 ? (
                    <div className="flex flex-col gap-5 px-5 sm:px-8 py-6">
                      {renderRuns(messages, (msg, _first, last) => (
                        <MessageBubble
                          key={msg.id}
                          id={msg.id}
                          content={msg.content}
                          senderId={msg.sender_id}
                          currentUserId={user?.id || ""}
                          createdAt={msg.created_at}
                          readAt={msg.read_at}
                          showTime={last}
                          replyTo={
                            msg.reply_to
                              ? {
                                  id: msg.reply_to.id,
                                  content: msg.reply_to.content,
                                  senderName: msg.reply_to.sender_id === user?.id ? "you" : selectedUser.display_name || selectedUser.username,
                                }
                              : null
                          }
                          onDelete={handleDeleteMessage}
                          onReply={handleReply}
                          onReact={handleReact}
                          reactions={reactions?.get(msg.id) || []}
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
                  ) : groupMessages && groupMessages.length > 0 ? (
                    <div className="flex flex-col gap-5 px-5 sm:px-8 py-6">
                      {renderRuns(groupMessages, (msg, first, last) => (
                        <MessageBubble
                          key={msg.id}
                          id={msg.id}
                          content={msg.content}
                          senderId={msg.sender_id}
                          currentUserId={user?.id || ""}
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
