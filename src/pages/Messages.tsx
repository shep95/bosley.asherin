import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import MessageBubble from "@/components/messages/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  MessageSquare, Send, Loader2, Search, ArrowLeft, Plus, Check, X, Inbox, Users, Timer, Eye
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
  const [activeTab, setActiveTab] = useState("messages");
  const [chatType, setChatType] = useState<"direct" | "groups">("direct");
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Message deleted" });
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
      toast({ title: "Group created!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      
      if (!profile) throw new Error("User not found");
      
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
      toast({ title: "Message sent!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
    setActiveTab("messages");
  };

  const declineRequest = async (request: MessageRequest) => {
    if (!user) return;
    
    await supabase
      .from('messages')
      .delete()
      .eq('sender_id', request.sender_id)
      .eq('receiver_id', user.id);
    
    queryClient.invalidateQueries({ queryKey: ['message-requests'] });
    toast({ title: "Request declined" });
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
      ? 'You' 
      : selectedUser?.display_name || selectedUser?.username || 'User';
    setReplyTo({ id: messageId, content, senderName });
  };

  const handleReact = (messageId: string, emoji: string) => {
    addReaction.mutate({ messageId, emoji });
  };

  const handleDeleteMessage = (messageId: string) => {
    deleteMessage.mutate(messageId);
  };

  const startConversation = (profile: any) => {
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

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

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-4rem)] lg:h-screen flex">
        {/* Conversations list */}
        <div className={`w-full lg:w-80 border-r border-border/20 flex flex-col ${selectedUser || selectedGroup ? 'hidden lg:flex' : 'flex'}`}>
          <div className="p-4 border-b border-foreground/5 backdrop-blur-xl bg-background/70">
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">Messages</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-foreground/50 uppercase font-medium tracking-wider">
                    Transport secured with HTTPS
                  </span>
                </div>
              </div>
              
              <div className="flex gap-1">
                <Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-lg">
                      <Users className="w-5 h-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-panel border">
                    <DialogHeader>
                      <DialogTitle className="font-light">Create Group</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Group name"
                        className="bg-background/50 border-border/50 rounded-lg font-light"
                      />
                      <div>
                        <p className="text-sm text-foreground/60 font-light mb-2">Add members</p>
                        <Input
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          placeholder="Search users..."
                          className="bg-background/50 border-border/50 rounded-lg font-light"
                        />
                        {memberSearchResults && memberSearchResults.length > 0 && (
                          <div className="mt-2 glass-card rounded-xl p-2 space-y-1 max-h-40 overflow-y-auto">
                            {memberSearchResults.map((profile) => (
                              <button
                                key={profile.user_id}
                                onClick={() => toggleMember(profile.user_id)}
                                className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${
                                  selectedMembers.includes(profile.user_id) ? 'bg-foreground/20' : 'hover:bg-accent/30'
                                }`}
                              >
                                <UserAvatar avatarUrl={profile.avatar_url} size="sm" />
                                <span className="text-foreground font-light text-sm flex-1 text-left">
                                  @{profile.username}
                                </span>
                                {selectedMembers.includes(profile.user_id) && (
                                  <Check className="w-4 h-4 text-green-500" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedMembers.length > 0 && (
                          <p className="text-xs text-foreground/50 mt-2 font-light">
                            {selectedMembers.length} member(s) selected
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={() => createGroupChat.mutate()}
                        disabled={!newGroupName.trim() || selectedMembers.length === 0 || createGroupChat.isPending}
                        className="w-full rounded-lg bg-foreground text-background"
                      >
                        {createGroupChat.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Users className="w-4 h-4 mr-2" />
                            Create Group
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={newConversationOpen} onOpenChange={setNewConversationOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-lg">
                      <Plus className="w-5 h-5" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-panel border">
                    <DialogHeader>
                      <DialogTitle className="font-light">New Message</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <Input
                        value={newMessageRecipient}
                        onChange={(e) => setNewMessageRecipient(e.target.value)}
                        placeholder="Username"
                        className="bg-background/50 border-border/50 rounded-lg font-light"
                      />
                      <Textarea
                        value={newConversationMessage}
                        onChange={(e) => setNewConversationMessage(e.target.value)}
                        placeholder="Write your message..."
                        className="bg-background/50 border-border/50 rounded-lg font-light resize-none min-h-[100px]"
                      />
                      <Button
                        onClick={() => startNewConversation.mutate()}
                        disabled={!newMessageRecipient.trim() || !newConversationMessage.trim() || startNewConversation.isPending}
                        className="w-full rounded-lg bg-foreground text-background"
                      >
                        {startNewConversation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send Message
                          </>
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
              <TabsList className="p-1 glass-inset rounded-xl flex items-center gap-1 w-full h-auto">
                <TabsTrigger value="messages" className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ease-soft text-foreground/60 hover:text-foreground data-[state=active]:bg-foreground/[0.12] data-[state=active]:text-foreground data-[state=active]:shadow-card">
                  Chats
                </TabsTrigger>
                <TabsTrigger value="requests" className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ease-soft text-foreground/60 hover:text-foreground data-[state=active]:bg-foreground/[0.12] data-[state=active]:text-foreground data-[state=active]:shadow-card relative">
                  Requests
                  {messageRequests && messageRequests.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                      {messageRequests.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === "messages" && (
              <>
                <div className="flex gap-1 mb-3 p-1 glass-inset rounded-xl">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChatType("direct")}
                    aria-pressed={chatType === "direct"}
                    className={`flex-1 rounded-lg text-xs font-medium press ${chatType === "direct" ? 'bg-foreground/[0.12] text-foreground shadow-card' : 'text-foreground/60 hover:text-foreground'}`}
                  >
                    Direct
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setChatType("groups")}
                    aria-pressed={chatType === "groups"}
                    className={`flex-1 rounded-lg text-xs font-medium press ${chatType === "groups" ? 'bg-foreground/[0.12] text-foreground shadow-card' : 'text-foreground/60 hover:text-foreground'}`}
                  >
                    Groups
                  </Button>
                </div>

                {chatType === "direct" && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users..."
                      className="pl-10 bg-background/50 border-border/50 rounded-lg font-light"
                    />
                  </div>
                )}
                
                {searchResults && searchResults.length > 0 && (
                  <div className="mt-2 glass-card rounded-xl p-2 space-y-1">
                    {searchResults.map((profile) => (
                      <button
                        key={profile.user_id}
                        onClick={() => startConversation(profile)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors"
                      >
                        <UserAvatar avatarUrl={profile.avatar_url} size="sm" />
                        <span className="text-foreground font-light text-sm">@{profile.username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {activeTab === "messages" ? (
              chatType === "direct" ? (
                loadingConversations ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                  </div>
                ) : conversations && conversations.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => {
                          setSelectedUser(conv);
                          setSelectedGroup(null);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          selectedUser?.id === conv.id ? 'bg-accent/30' : 'hover:bg-accent/20'
                        }`}
                      >
                        <UserAvatar 
                          avatarUrl={conv.avatar_url} 
                          username={conv.username}
                          size="md" 
                        />
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-foreground font-normal truncate">
                            {conv.display_name || conv.username}
                          </p>
                          <p className="text-foreground/40 text-sm font-light truncate">
                            {conv.last_message}
                          </p>
                        </div>
                        {conv.unread && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <Inbox className="w-12 h-12 mx-auto text-foreground/20 mb-3" />
                    <p className="text-foreground/40 font-light text-sm">
                      No conversations yet
                    </p>
                  </div>
                )
              ) : (
                loadingGroups ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                  </div>
                ) : groupChats && groupChats.length > 0 ? (
                  <div className="p-2 space-y-1">
                    {groupChats.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setSelectedGroup(group);
                          setSelectedUser(null);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          selectedGroup?.id === group.id ? 'bg-accent/30' : 'hover:bg-accent/20'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                          <Users className="w-6 h-6 text-foreground/60" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-foreground font-normal truncate">
                            {group.name}
                          </p>
                          <p className="text-foreground/40 text-sm font-light truncate">
                            {group.member_count} members
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <Users className="w-12 h-12 mx-auto text-foreground/20 mb-3" />
                    <p className="text-foreground/40 font-light text-sm">
                      No groups yet
                    </p>
                    <p className="text-foreground/30 font-light text-xs mt-1">
                      Click the group icon to create one
                    </p>
                  </div>
                )
              )
            ) : (
              loadingRequests ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                </div>
              ) : messageRequests && messageRequests.length > 0 ? (
                <div className="p-2 space-y-2">
                  {messageRequests.map((request) => (
                    <div key={request.id} className="glass-card rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <UserAvatar avatarUrl={request.sender_avatar_url} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground font-normal">
                            {request.sender_display_name || request.sender_username}
                          </p>
                          <p className="text-foreground/40 text-sm font-light">
                            @{request.sender_username}
                          </p>
                          <p className="text-foreground/70 text-sm font-light mt-2 line-clamp-2">
                            {request.message}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          onClick={() => acceptRequest(request)}
                          size="sm"
                          className="flex-1 rounded-lg bg-foreground text-background"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                        <Button
                          onClick={() => declineRequest(request)}
                          size="sm"
                          variant="ghost"
                          className="flex-1 rounded-lg"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <Inbox className="w-12 h-12 mx-auto text-foreground/20 mb-3" />
                  <p className="text-foreground/40 font-light text-sm">
                    No message requests
                  </p>
                </div>
              )
            )}
          </div>
        </div>
        
        {/* Chat area */}
        <div className={`flex-1 flex flex-col ${selectedUser || selectedGroup ? 'flex' : 'hidden lg:flex'}`}>
          {selectedUser ? (
            <>
              <div className="p-4 border-b border-border/20 flex items-center gap-3">
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="lg:hidden text-foreground/60 hover:text-foreground"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <UserAvatar 
                  avatarUrl={selectedUser.avatar_url} 
                  username={selectedUser.username}
                  size="md" 
                />
                <div>
                  <p className="text-foreground font-normal">
                    {selectedUser.display_name || selectedUser.username}
                  </p>
                  <p className="text-foreground/40 text-sm font-light">
                    @{selectedUser.username}
                  </p>
                </div>
              </div>
              
              {/* Messages with anti-screenshot protection */}
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-3 message-container message-protected message-watermark"
                style={wallpaperStyle}
              >
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                  </div>
                ) : messages && messages.length > 0 ? (
                  <>
                    {messages.map((msg) => (
                      <MessageBubble
                        key={msg.id}
                        id={msg.id}
                        content={msg.content}
                        senderId={msg.sender_id}
                        currentUserId={user?.id || ''}
                        createdAt={msg.created_at}
                        readAt={msg.read_at}
                        replyTo={msg.reply_to ? {
                          id: msg.reply_to.id,
                          content: msg.reply_to.content,
                          senderName: msg.reply_to.sender_id === user?.id ? 'You' : (selectedUser.display_name || selectedUser.username)
                        } : null}
                        onDelete={handleDeleteMessage}
                        onReply={handleReply}
                        onReact={handleReact}
                        reactions={reactions?.get(msg.id) || []}
                      />
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-foreground/40 font-light">
                      Start the conversation
                    </p>
                  </div>
                )}
              </div>
              
              {/* Reply preview */}
              {replyTo && (
                <div className="px-4 py-2 border-t border-border/20 flex items-center gap-3 bg-accent/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground/60">Replying to {replyTo.senderName}</p>
                    <p className="text-sm text-foreground/80 truncate">{replyTo.content}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-foreground/40 hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              <div className="p-4 border-t border-border/20">
                {/* Disappearing message controls */}
                <div className="flex items-center gap-2 mb-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-7 rounded-full text-xs font-light ${messageTTL ? 'text-foreground bg-accent/20' : 'text-foreground/40'}`}
                      >
                        <Timer className="w-3.5 h-3.5 mr-1" />
                        {messageTTL === '1h' ? '1 hour' : messageTTL === '24h' ? '24 hours' : messageTTL === '7d' ? '7 days' : 'Auto-delete'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="glass-panel border w-40 p-1" side="top">
                      <div className="space-y-0.5">
                        {[
                          { value: null, label: 'Off' },
                          { value: '1h', label: '1 hour' },
                          { value: '24h', label: '24 hours' },
                          { value: '7d', label: '7 days' },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            onClick={() => setMessageTTL(opt.value)}
                            className={`w-full text-left text-sm font-light px-3 py-1.5 rounded hover:bg-accent/20 ${messageTTL === opt.value ? 'text-foreground bg-accent/10' : 'text-foreground/60'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewOnce(!viewOnce)}
                    className={`h-7 rounded-full text-xs font-light ${viewOnce ? 'text-foreground bg-accent/20' : 'text-foreground/40'}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    View once {viewOnce ? '✓' : ''}
                  </Button>
                </div>
                <form onSubmit={handleSend} className="flex items-center gap-3">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-background/50 border-border/50 rounded-lg font-light resize-none min-h-[44px] max-h-32"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || sendMessage.isPending}
                    className="rounded-lg bg-foreground text-background hover:bg-foreground/90 h-11 w-11 p-0"
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : selectedGroup ? (
            <>
              <div className="p-4 border-b border-border/20 flex items-center gap-3">
                <button 
                  onClick={() => setSelectedGroup(null)}
                  className="lg:hidden text-foreground/60 hover:text-foreground"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                  <Users className="w-5 h-5 text-foreground/60" />
                </div>
                <div>
                  <p className="text-foreground font-normal">
                    {selectedGroup.name}
                  </p>
                  <p className="text-foreground/40 text-sm font-light">
                    {selectedGroup.member_count} members
                  </p>
                </div>
              </div>
              
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-3 message-container message-protected"
                style={wallpaperStyle}
              >
                {loadingGroupMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-foreground/60" />
                  </div>
                ) : groupMessages && groupMessages.length > 0 ? (
                  <>
                    {groupMessages.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[70%] ${msg.sender_id === user?.id ? '' : 'flex gap-2'}`}>
                          {msg.sender_id !== user?.id && (
                            <UserAvatar avatarUrl={msg.sender?.avatar_url} size="sm" />
                          )}
                          <div className={`rounded-lg px-4 py-2 ${
                            msg.sender_id === user?.id 
                              ? 'bg-foreground text-background' 
                              : 'glass-card'
                          }`}>
                            {msg.sender_id !== user?.id && (
                              <p className="text-xs text-foreground/60 font-light mb-1 select-none">
                                {msg.sender?.display_name || msg.sender?.username}
                              </p>
                            )}
                            <p className="font-light select-none">{msg.content}</p>
                            <p className={`text-xs mt-1 ${
                              msg.sender_id === user?.id ? 'text-background/60' : 'text-foreground/40'
                            }`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-foreground/40 font-light">
                      Start the conversation
                    </p>
                  </div>
                )}
              </div>
              
              <div className="p-4 border-t border-border/20">
                <form onSubmit={handleSend} className="flex items-center gap-3">
                  <Textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-background/50 border-border/50 rounded-lg font-light resize-none min-h-[44px] max-h-32"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || sendGroupMessage.isPending}
                    className="rounded-lg bg-foreground text-background hover:bg-foreground/90 h-11 w-11 p-0"
                  >
                    {sendGroupMessage.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              {/* Scrim card: the empty state used to sit directly on the
                  wallpaper, where the copy was effectively unreadable. */}
              <div className="glass-card rounded-2xl px-10 py-8 text-center max-w-sm mx-4">
                <MessageSquare className="w-10 h-10 mx-auto text-foreground/35 mb-3" />
                <p className="text-foreground/80 font-medium">
                  Select a conversation
                </p>
                <p className="text-foreground/55 text-sm mt-1">
                  Or start a new one — messages stay between you and them.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Messages;