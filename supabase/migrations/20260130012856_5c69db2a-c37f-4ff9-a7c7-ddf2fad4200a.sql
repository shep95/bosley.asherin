begin;

-- =====================
-- 1) Remove sensitive/unused field
-- =====================
alter table public.profiles drop column if exists owner_email;

-- =====================
-- 2) Make ALL data non-public (no anonymous reads)
-- =====================

-- blocked_email_domains: no direct reads (server-side checks via security definer function)
drop policy if exists "Blocked domains are viewable by everyone" on public.blocked_email_domains;
create policy "Blocked domains are not directly readable"
  on public.blocked_email_domains
  for select
  to authenticated
  using (false);

-- collections: remove anon visibility
drop policy if exists "Public collections viewable by everyone" on public.collections;
create policy "Collections viewable by authenticated"
  on public.collections
  for select
  to authenticated
  using ((is_public = true) or (auth.uid() = user_id));

-- comment_likes: remove anon visibility + force authenticated for writes
drop policy if exists "Anyone can view comment likes" on public.comment_likes;
drop policy if exists "Users can like comments" on public.comment_likes;
drop policy if exists "Users can unlike comments" on public.comment_likes;

create policy "Authenticated can view comment likes"
  on public.comment_likes
  for select
  to authenticated
  using (true);

create policy "Users can like comments"
  on public.comment_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can unlike comments"
  on public.comment_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- follows: remove anon visibility
drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy "Authenticated can view follows"
  on public.follows
  for select
  to authenticated
  using (true);

-- post_likes: remove anon visibility
drop policy if exists "Likes are viewable by everyone" on public.post_likes;
create policy "Authenticated can view post likes"
  on public.post_likes
  for select
  to authenticated
  using (true);

-- topics: remove anon visibility
drop policy if exists "Topics are viewable by everyone" on public.topics;
create policy "Authenticated can view topics"
  on public.topics
  for select
  to authenticated
  using (true);

-- post_edits: remove public visibility
-- NOTE: only post owner can read edit history
drop policy if exists "Post edits are viewable by everyone" on public.post_edits;
create policy "Post owners can view edit history"
  on public.post_edits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_edits.post_id
        and p.user_id = auth.uid()
    )
  );

-- notifications: ensure authenticated only
-- (these were previously roles=public + auth checks; tighten roles)
drop policy if exists "Authenticated users can create notifications" on public.notifications;
drop policy if exists "Users can delete their own notifications" on public.notifications;
drop policy if exists "Users can update their own notifications" on public.notifications;
drop policy if exists "Users can view their own notifications" on public.notifications;

create policy "Users can view their own notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create notifications"
  on public.notifications
  for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "Users can update their own notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own notifications"
  on public.notifications
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- profiles: tighten roles on policies (still row-restricted by auth checks)
drop policy if exists "Profiles viewable by authenticated users" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Profiles viewable by authenticated users"
  on public.profiles
  for select
  to authenticated
  using (auth.role() = 'authenticated'::text);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id);

-- group chat policies were dangerously incorrect; replace with security-definer helpers to avoid recursion
create or replace function public.is_group_member(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_chat_members m
    where m.group_id = _group_id
      and m.user_id = _user_id
  );
$$;

create or replace function public.is_group_admin(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_chat_members m
    where m.group_id = _group_id
      and m.user_id = _user_id
      and m.role = 'admin'
  );
$$;

create or replace function public.is_group_owner(_group_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_chats g
    where g.id = _group_id
      and g.created_by = _user_id
  );
$$;

-- group_chats

drop policy if exists "Authenticated users can create groups" on public.group_chats;
drop policy if exists "Group admins can delete groups" on public.group_chats;
drop policy if exists "Group admins can update groups" on public.group_chats;
drop policy if exists "Users can view groups they are members of" on public.group_chats;

create policy "Members can view their groups"
  on public.group_chats
  for select
  to authenticated
  using (public.is_group_member(id, auth.uid()) or created_by = auth.uid());

create policy "Users can create groups"
  on public.group_chats
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Admins can update their groups"
  on public.group_chats
  for update
  to authenticated
  using (public.is_group_owner(id, auth.uid()) or public.is_group_admin(id, auth.uid()))
  with check (public.is_group_owner(id, auth.uid()) or public.is_group_admin(id, auth.uid()));

create policy "Owners can delete groups"
  on public.group_chats
  for delete
  to authenticated
  using (public.is_group_owner(id, auth.uid()));

-- group_chat_members

drop policy if exists "Admins can add members" on public.group_chat_members;
drop policy if exists "Admins can remove members" on public.group_chat_members;
drop policy if exists "Users can view members of their groups" on public.group_chat_members;

create policy "Members can view group members"
  on public.group_chat_members
  for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy "Admins can add members"
  on public.group_chat_members
  for insert
  to authenticated
  with check (public.is_group_owner(group_id, auth.uid()) or public.is_group_admin(group_id, auth.uid()));

create policy "Admins can remove members"
  on public.group_chat_members
  for delete
  to authenticated
  using (
    public.is_group_owner(group_id, auth.uid())
    or public.is_group_admin(group_id, auth.uid())
    or user_id = auth.uid()
  );

-- group_messages

drop policy if exists "Members can send messages" on public.group_messages;
drop policy if exists "Users can delete their own messages" on public.group_messages;
drop policy if exists "Users can view messages in their groups" on public.group_messages;

create policy "Members can view group messages"
  on public.group_messages
  for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy "Members can send messages"
  on public.group_messages
  for insert
  to authenticated
  with check (auth.uid() = sender_id and public.is_group_member(group_id, auth.uid()));

create policy "Users can delete their own messages"
  on public.group_messages
  for delete
  to authenticated
  using (auth.uid() = sender_id);

-- posts: keep authenticated-only, re-create to eliminate any drift
-- (idempotent: drop by name if present)
drop policy if exists "Posts are viewable by authenticated users" on public.posts;
create policy "Posts are viewable by authenticated users"
  on public.posts
  for select
  to authenticated
  using (true);

-- =====================
-- 3) Lock down media access (no public/anon storage reads)
-- =====================

-- Make buckets non-public at the bucket level (defense-in-depth)
update storage.buckets
set public = false
where id in ('avatars', 'post-media', 'backgrounds');

-- Remove public read policies on storage.objects
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
drop policy if exists "Background images are publicly accessible" on storage.objects;
drop policy if exists "Post media is publicly accessible" on storage.objects;

-- Tighten remaining storage policies to authenticated
drop policy if exists "Users can view their own files" on storage.objects;
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Users can delete their own avatar" on storage.objects;
drop policy if exists "Users can upload their own post media" on storage.objects;
drop policy if exists "Users can delete their own post media" on storage.objects;
drop policy if exists "Premium users can upload backgrounds" on storage.objects;
drop policy if exists "Users can delete their own backgrounds" on storage.objects;
drop policy if exists "Users can upload their own files" on storage.objects;
drop policy if exists "Users can delete their own files" on storage.objects;

-- Authenticated users can read media (still private from the open internet)
create policy "Authenticated can read avatars"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars');

create policy "Authenticated can read post media"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'post-media');

create policy "Authenticated can read backgrounds"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'backgrounds');

create policy "Users can view their own files"
  on storage.objects
  for select
  to authenticated
  using ((bucket_id = 'files') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check ((bucket_id = 'avatars') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can update their own avatar"
  on storage.objects
  for update
  to authenticated
  using ((bucket_id = 'avatars') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using ((bucket_id = 'avatars') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can upload their own post media"
  on storage.objects
  for insert
  to authenticated
  with check ((bucket_id = 'post-media') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can delete their own post media"
  on storage.objects
  for delete
  to authenticated
  using ((bucket_id = 'post-media') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Premium users can upload backgrounds"
  on storage.objects
  for insert
  to authenticated
  with check ((bucket_id = 'backgrounds') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can delete their own backgrounds"
  on storage.objects
  for delete
  to authenticated
  using ((bucket_id = 'backgrounds') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can upload their own files"
  on storage.objects
  for insert
  to authenticated
  with check ((bucket_id = 'files') and ((auth.uid())::text = (storage.foldername(name))[1]));

create policy "Users can delete their own files"
  on storage.objects
  for delete
  to authenticated
  using ((bucket_id = 'files') and ((auth.uid())::text = (storage.foldername(name))[1]));

commit;