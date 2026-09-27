export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      anonymous_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          created_at: string
          id: string
          is_hidden: boolean | null
          is_public: boolean | null
          question_text: string
          recipient_user_id: string
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          is_public?: boolean | null
          question_text: string
          recipient_user_id: string
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string
          id?: string
          is_hidden?: boolean | null
          is_public?: boolean | null
          question_text?: string
          recipient_user_id?: string
        }
        Relationships: []
      }
      audience_circles: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      block_rules: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          rule_config: Json
          rule_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          rule_config?: Json
          rule_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          rule_config?: Json
          rule_type?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_email_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          collection_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          post_id: string
          tags: string[] | null
          user_id: string
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          post_id: string
          tags?: string[] | null
          user_id: string
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          post_id?: string
          tags?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_members: {
        Row: {
          added_at: string
          circle_id: string
          id: string
          member_user_id: string
        }
        Insert: {
          added_at?: string
          circle_id: string
          id?: string
          member_user_id: string
        }
        Update: {
          added_at?: string
          circle_id?: string
          id?: string
          member_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "audience_circles"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          banner_url: string | null
          created_at: string
          created_by: string
          description: string | null
          icon_url: string | null
          id: string
          is_nsfw: boolean
          is_private: boolean
          member_count: number
          name: string
          rules: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_nsfw?: boolean
          is_private?: boolean
          member_count?: number
          name: string
          rules?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_nsfw?: boolean
          is_private?: boolean
          member_count?: number
          name?: string
          rules?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          helpful_count: number | null
          id: string
          not_helpful_count: number | null
          post_id: string
          source_url: string | null
          status: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          helpful_count?: number | null
          id?: string
          not_helpful_count?: number | null
          post_id: string
          source_url?: string | null
          status?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          helpful_count?: number | null
          id?: string
          not_helpful_count?: number | null
          post_id?: string
          source_url?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_notes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_privacy: {
        Row: {
          contact_user_id: string
          created_at: string
          id: string
          read_receipts: boolean | null
          user_id: string
        }
        Insert: {
          contact_user_id: string
          created_at?: string
          id?: string
          read_receipts?: boolean | null
          user_id: string
        }
        Update: {
          contact_user_id?: string
          created_at?: string
          id?: string
          read_receipts?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          community_id: string | null
          cover_url: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          location: string | null
          starts_at: string
          title: string
          virtual_url: string | null
        }
        Insert: {
          community_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          starts_at: string
          title: string
          virtual_url?: string | null
        }
        Update: {
          community_id?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          starts_at?: string
          title?: string
          virtual_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_profiles: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      group_chat_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chats: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_follows: {
        Row: {
          created_at: string
          hashtag_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hashtag_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hashtag_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_follows_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtags: {
        Row: {
          created_at: string
          id: string
          name: string
          post_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          post_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          post_count?: number
        }
        Relationships: []
      }
      keyword_filters: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_regex: boolean | null
          pattern: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_regex?: boolean | null
          pattern: string
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_regex?: boolean | null
          pattern?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      list_members: {
        Row: {
          added_at: string
          id: string
          list_id: string
          member_user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          list_id: string
          member_user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          list_id?: string
          member_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      list_subscriptions: {
        Row: {
          created_at: string
          id: string
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_subscriptions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          success?: boolean
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          expires_at: string | null
          id: string
          is_view_once: boolean | null
          read_at: string | null
          receiver_id: string
          reply_to_id: string | null
          sender_id: string
          viewed_at: string | null
        }
        Insert: {
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_view_once?: boolean | null
          read_at?: string | null
          receiver_id: string
          reply_to_id?: string | null
          sender_id: string
          viewed_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_view_once?: boolean | null
          read_at?: string | null
          receiver_id?: string
          reply_to_id?: string | null
          sender_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action_type: string
          created_at: string
          expires_at: string | null
          id: string
          moderator_id: string
          reason: string | null
          target_post_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          expires_at?: string | null
          id?: string
          moderator_id: string
          reason?: string | null
          target_post_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          moderator_id?: string
          reason?: string | null
          target_post_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_target_post_id_fkey"
            columns: ["target_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      mutes: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          mute_retweets: boolean
          muted_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          mute_retweets?: boolean
          muted_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          mute_retweets?: boolean
          muted_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      note_votes: {
        Row: {
          created_at: string
          id: string
          is_helpful: boolean
          note_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_helpful: boolean
          note_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_helpful?: boolean
          note_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_votes_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "community_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_options: {
        Row: {
          id: string
          option_text: string
          poll_id: string
          position: number
        }
        Insert: {
          id?: string
          option_text: string
          poll_id: string
          position?: number
        }
        Update: {
          id?: string
          option_text?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          allows_multiple: boolean | null
          created_at: string
          ends_at: string | null
          id: string
          post_id: string
          question: string
        }
        Insert: {
          allows_multiple?: boolean | null
          created_at?: string
          ends_at?: string | null
          id?: string
          post_id: string
          question: string
        }
        Update: {
          allows_multiple?: boolean | null
          created_at?: string
          ends_at?: string | null
          id?: string
          post_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_collaborators: {
        Row: {
          id: string
          invited_at: string
          post_id: string
          responded_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string
          post_id: string
          responded_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string
          post_id?: string
          responded_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_collaborators_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_drafts: {
        Row: {
          content: string
          created_at: string
          id: string
          is_thread: boolean
          media_urls: string[] | null
          thread_posts: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_thread?: boolean
          media_urls?: string[] | null
          thread_posts?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_thread?: boolean
          media_urls?: string[] | null
          thread_posts?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_edits: {
        Row: {
          edited_at: string
          edited_by: string
          id: string
          post_id: string
          previous_content: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          id?: string
          post_id: string
          previous_content: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          id?: string
          post_id?: string
          previous_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_edits_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_flags: {
        Row: {
          action_taken: string | null
          created_at: string
          id: string
          post_id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          id?: string
          post_id: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_flags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_hashtags: {
        Row: {
          hashtag_id: string
          id: string
          post_id: string
        }
        Insert: {
          hashtag_id: string
          id?: string
          post_id: string
        }
        Update: {
          hashtag_id?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_hashtags_hashtag_id_fkey"
            columns: ["hashtag_id"]
            isOneToOne: false
            referencedRelation: "hashtags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_hashtags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_rule_runs: {
        Row: {
          created_at: string
          details: Json | null
          error_message: string | null
          id: string
          rule_id: string
          success: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          rule_id: string
          success: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          rule_id?: string
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_rule_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "post_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      post_rules: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          post_id: string | null
          trigger_config: Json
          trigger_count: number
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          post_id?: string | null
          trigger_config?: Json
          trigger_count?: number
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          post_id?: string | null
          trigger_config?: Json
          trigger_count?: number
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          circle_ids: string[] | null
          content: string
          content_warning: string | null
          created_at: string
          edit_count: number | null
          expires_at: string | null
          id: string
          is_long_form: boolean | null
          is_nsfw: boolean | null
          is_thread: boolean | null
          last_edited_at: string | null
          media_urls: string[] | null
          min_account_age_days: number | null
          min_follower_count: number | null
          quoted_post_id: string | null
          reply_control: string | null
          slow_mode_minutes: number | null
          summary: string | null
          thread_id: string | null
          thread_position: number | null
          topic_id: string | null
          updated_at: string
          user_id: string
          visibility: string | null
        }
        Insert: {
          circle_ids?: string[] | null
          content: string
          content_warning?: string | null
          created_at?: string
          edit_count?: number | null
          expires_at?: string | null
          id?: string
          is_long_form?: boolean | null
          is_nsfw?: boolean | null
          is_thread?: boolean | null
          last_edited_at?: string | null
          media_urls?: string[] | null
          min_account_age_days?: number | null
          min_follower_count?: number | null
          quoted_post_id?: string | null
          reply_control?: string | null
          slow_mode_minutes?: number | null
          summary?: string | null
          thread_id?: string | null
          thread_position?: number | null
          topic_id?: string | null
          updated_at?: string
          user_id: string
          visibility?: string | null
        }
        Update: {
          circle_ids?: string[] | null
          content?: string
          content_warning?: string | null
          created_at?: string
          edit_count?: number | null
          expires_at?: string | null
          id?: string
          is_long_form?: boolean | null
          is_nsfw?: boolean | null
          is_thread?: boolean | null
          last_edited_at?: string | null
          media_urls?: string[] | null
          min_account_age_days?: number | null
          min_follower_count?: number | null
          quoted_post_id?: string | null
          reply_control?: string | null
          slow_mode_minutes?: number | null
          summary?: string | null
          thread_id?: string | null
          thread_position?: number | null
          topic_id?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_quoted_post_id_fkey"
            columns: ["quoted_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          birthday: string | null
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          birthday?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          id: string
          profile_user_id: string
          viewed_at: string
          viewer_user_id: string
        }
        Insert: {
          id?: string
          profile_user_id: string
          viewed_at?: string
          viewer_user_id: string
        }
        Update: {
          id?: string
          profile_user_id?: string
          viewed_at?: string
          viewer_user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string
          custom_background_url: string | null
          display_name: string | null
          id: string
          location: string | null
          message_wallpaper_url: string | null
          pinned_post_ids: string[] | null
          pronouns: string | null
          updated_at: string
          user_id: string
          username: string
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          custom_background_url?: string | null
          display_name?: string | null
          id?: string
          location?: string | null
          message_wallpaper_url?: string | null
          pinned_post_ids?: string[] | null
          pronouns?: string | null
          updated_at?: string
          user_id: string
          username: string
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          custom_background_url?: string | null
          display_name?: string | null
          id?: string
          location?: string | null
          message_wallpaper_url?: string | null
          pinned_post_ids?: string[] | null
          pronouns?: string | null
          updated_at?: string
          user_id?: string
          username?: string
          website?: string | null
        }
        Relationships: []
      }
      reposts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reposts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          id: string
          query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_posts: {
        Row: {
          circle_ids: string[] | null
          content: string
          created_at: string
          expires_at: string | null
          id: string
          media_urls: string[] | null
          published_at: string | null
          scheduled_for: string
          status: string | null
          user_id: string
          visibility: string | null
        }
        Insert: {
          circle_ids?: string[] | null
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          media_urls?: string[] | null
          published_at?: string | null
          scheduled_for: string
          status?: string | null
          user_id: string
          visibility?: string | null
        }
        Update: {
          circle_ids?: string[] | null
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          media_urls?: string[] | null
          published_at?: string | null
          scheduled_for?: string
          status?: string | null
          user_id?: string
          visibility?: string | null
        }
        Relationships: []
      }
      topic_subscriptions: {
        Row: {
          created_at: string
          id: string
          priority: number | null
          topic_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: number | null
          topic_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          priority?: number | null
          topic_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_subscriptions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          amoled_dark: boolean | null
          color_blind_mode: string | null
          created_at: string
          dyslexia_font: boolean | null
          font_size: string | null
          high_contrast: boolean | null
          id: string
          layout_mode: string | null
          reduce_motion: boolean | null
          sidebar_position: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amoled_dark?: boolean | null
          color_blind_mode?: string | null
          created_at?: string
          dyslexia_font?: boolean | null
          font_size?: string | null
          high_contrast?: boolean | null
          id?: string
          layout_mode?: string | null
          reduce_motion?: boolean | null
          sidebar_position?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amoled_dark?: boolean | null
          color_blind_mode?: string | null
          created_at?: string
          dyslexia_font?: boolean | null
          font_size?: string | null
          high_contrast?: boolean | null
          id?: string
          layout_mode?: string | null
          reduce_motion?: boolean | null
          sidebar_position?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          anonymous_qa_enabled: boolean | null
          created_at: string
          feed_mode: string | null
          hide_insults: boolean | null
          hide_political_arguments: boolean | null
          id: string
          last_seen_visible: boolean | null
          message_requests_enabled: boolean | null
          notifications_enabled: boolean | null
          online_status_visible: boolean | null
          read_receipts_enabled: boolean | null
          show_politics: boolean | null
          show_viral: boolean | null
          stealth_mode: boolean | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anonymous_qa_enabled?: boolean | null
          created_at?: string
          feed_mode?: string | null
          hide_insults?: boolean | null
          hide_political_arguments?: boolean | null
          id?: string
          last_seen_visible?: boolean | null
          message_requests_enabled?: boolean | null
          notifications_enabled?: boolean | null
          online_status_visible?: boolean | null
          read_receipts_enabled?: boolean | null
          show_politics?: boolean | null
          show_viral?: boolean | null
          stealth_mode?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anonymous_qa_enabled?: boolean | null
          created_at?: string
          feed_mode?: string | null
          hide_insults?: boolean | null
          hide_political_arguments?: boolean | null
          id?: string
          last_seen_visible?: boolean | null
          message_requests_enabled?: boolean | null
          notifications_enabled?: boolean | null
          online_status_visible?: boolean | null
          read_receipts_enabled?: boolean | null
          show_politics?: boolean | null
          show_viral?: boolean | null
          stealth_mode?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_verifications: {
        Row: {
          id: string
          is_active: boolean
          user_id: string
          verification_method: string | null
          verification_type: string
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          user_id: string
          verification_method?: string | null
          verification_type: string
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          user_id?: string
          verification_method?: string | null
          verification_type?: string
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      user_verification_badges: {
        Row: {
          is_active: boolean | null
          user_id: string | null
          verification_type: string | null
          verified_at: string | null
        }
        Insert: {
          is_active?: boolean | null
          user_id?: string | null
          verification_type?: string | null
          verified_at?: string | null
        }
        Update: {
          is_active?: boolean | null
          user_id?: string | null
          verification_type?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_public_preview_posts: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          content: string
          created_at: string
          media_urls: string[] | null
          is_nsfw: boolean
          content_warning: string | null
          user_id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          likes_count: number
          comments_count: number
        }[]
      }
      cleanup_expired_messages: { Args: never; Returns: undefined }
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      get_post_engagement: {
        Args: { post_ids: string[] }
        Returns: {
          comments_count: number
          likes_count: number
          post_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_locked:
        | { Args: { check_email: string }; Returns: boolean }
        | { Args: { check_email: string; check_ip: string }; Returns: boolean }
      is_community_member: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      is_email_domain_blocked: { Args: { email: string }; Returns: boolean }
      is_group_admin: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_public_community: { Args: { _community_id: string }; Returns: boolean }
      is_username_taken: { Args: { check_username: string }; Returns: boolean }
      record_audit_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: undefined
      }
      record_login_attempt: {
        Args: {
          attempt_email: string
          attempt_ip?: string
          attempt_success?: boolean
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
