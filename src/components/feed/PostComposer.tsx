import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import UserAvatar from "@/components/UserAvatar";
import { 
  Send, Image, Loader2, X, Clock, Hash, Video, WifiOff, MessageSquareOff, FileStack, Eye, GripVertical, SlidersHorizontal
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { stripMetadataAll, stripTextMetadata } from "@/lib/mediaSanitize";
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_FILE_SIZES,
  extensionForMime,
  validateUpload,
} from "@/lib/sanitize";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queuePostOffline, isOnline } from "@/lib/offlineQueue";
import { isBlockedLink, containsScamContent } from "@/lib/linkUtils";
import PollCreator, { PollData } from "@/components/polls/PollCreator";
import AudienceSelector, { type ComposerVisibility } from "@/components/composer/AudienceSelector";
import { isRateLimitError, SLOW_DOWN } from "@/lib/dbErrors";
import { FEED_QUERY_ROOTS, fetchQuotedPost } from "@/lib/postFeed";

// The date picker (react-day-picker) is only needed once someone opens the
// options row; keep it out of the Dashboard chunk.
const ScheduleSelector = lazy(() => import("@/components/composer/ScheduleSelector"));

interface MediaPreview {
  type: 'image' | 'video';
  url: string;
}

const MAX_MEDIA_FILES = 4;
/** posts.content is capped at 500 characters unless is_long_form (25,000). */
const POST_MAX = 500;
/** Scheduled posts must be at least this far in the future (matches ScheduleSelector). */
const SCHEDULE_MIN_LEAD_MS = 2 * 60 * 1000;

/**
 * Values the reply-control trigger understands: everyone, followers,
 * following, mutuals, mentioned. Anything else closes replies, which is what
 * "no replies" ('none') deliberately relies on.
 */
const REPLY_CONTROL_OPTIONS = [
  { value: "everyone", label: "everyone can reply" },
  { value: "followers", label: "followers only" },
  { value: "following", label: "people i follow" },
  { value: "mutuals", label: "mutuals only" },
  { value: "mentioned", label: "mentioned only" },
  { value: "none", label: "no replies" },
] as const;

type ComposerLocationState = {
  compose?: boolean;
  draft?: { id: string; content: string };
  quotePostId?: string;
} | null;

const uploadErrorMessage = "media could not be uploaded. nothing was posted.";
const IMAGE_MAX_MB = Math.round(MAX_FILE_SIZES.image / 1024 / 1024);
const VIDEO_MAX_MB = Math.round(MAX_FILE_SIZES.video / 1024 / 1024);

const PostComposer = () => {
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<MediaPreview[]>([]);
  // Latest previews, readable from the unmount cleanup without a stale closure.
  const mediaPreviewsRef = useRef<MediaPreview[]>([]);
  mediaPreviewsRef.current = mediaPreviews;
  const [expiresIn, setExpiresIn] = useState<string>("");
  const [topicId, setTopicId] = useState<string>("");
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<ComposerVisibility>('public');
  const [quotePostId, setQuotePostId] = useState<string | null>(null);
  // Remounts the poll form after a post so its local fields clear too.
  const [pollResetKey, setPollResetKey] = useState(0);
  const [replyControl, setReplyControl] = useState<string>('everyone');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  // Topics and templates are only ever read once someone starts composing, but
  // fetching them on mount put two extra round trips in front of the feed's
  // first paint on every dashboard visit. They now warm up on first contact
  // with the composer, long before any dropdown can be opened.
  const { user } = useAuth();
  const [composerEngaged, setComposerEngaged] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const location = useLocation();
  const navigate = useNavigate();

  // "write" from the rail or the phone bar lands the cursor here.
  const focusComposer = useCallback(() => {
    setComposerEngaged(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  useEffect(() => {
    window.addEventListener("bosley:compose", focusComposer);
    return () => window.removeEventListener("bosley:compose", focusComposer);
  }, [focusComposer]);

  // Arriving with router state: a draft from /drafts, a post to quote, or a
  // plain "compose". Read on every navigation (quoting from a card while already
  // on the dashboard does not remount the composer), then cleared so a reload
  // does not resurrect it.
  useEffect(() => {
    const usr = location.state as ComposerLocationState;
    if (!usr || (!usr.draft && !usr.quotePostId && !usr.compose)) return;
    if (usr.draft) {
      setContent(usr.draft.content);
      setDraftId(usr.draft.id);
    }
    if (usr.quotePostId) setQuotePostId(usr.quotePostId);
    focusComposer();
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate, focusComposer]);
  const { data: myProfile } = useQuery({
    queryKey: ["composer-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("username, avatar_url").eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Compact preview of the post being quoted (same cache as a card's quote).
  const { data: quotedPreview, isLoading: quoteLoading } = useQuery({
    queryKey: ["quoted-post", quotePostId, user?.id],
    queryFn: () => fetchQuotedPost(quotePostId as string),
    enabled: !!user && !!quotePostId,
    staleTime: 10 * 60_000,
  });

  // How many defaults the writer has deliberately changed — surfaced as a
  // count on the folded Options control so nothing is silently in effect.
  const changedOptionCount =
    (scheduledDate ? 1 : 0) +
    (visibility !== 'public' || selectedCircleIds.length > 0 ? 1 : 0) +
    (topicId ? 1 : 0) +
    (replyControl !== 'everyone' ? 1 : 0) +
    (expiresIn ? 1 : 0);

  // Fetch topics
  const { data: topics } = useQuery({
    queryKey: ['topics'],
    queryFn: async () => {
      const { data } = await supabase.from('topics').select('*').order('name');
      return data || [];
    },
    enabled: composerEngaged,
    staleTime: 1000 * 60 * 30,
  });

  // Templates
  const { data: templates } = useQuery({
    queryKey: ['templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('post_templates').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!user && composerEngaged
  });

  // Bumped whenever a post is sent. An autosave that started before the post
  // went out must not leave a draft behind for text that is already posted.
  const postGenRef = useRef(0);

  // Auto-save draft (debounced)
  useEffect(() => {
    if (!user || !content.trim() || content.length < 5) return;
    const t = setTimeout(async () => {
      const gen = postGenRef.current;
      try {
        if (draftId) {
          await supabase.from('post_drafts').update({ content, updated_at: new Date().toISOString() }).eq('id', draftId);
        } else {
          const { data } = await supabase.from('post_drafts').insert({ user_id: user.id, content }).select('id').single();
          if (!data) return;
          if (postGenRef.current !== gen) {
            await supabase.from('post_drafts').delete().eq('id', data.id);
          } else {
            setDraftId(data.id);
          }
        }
        // The drafts page and the rail's count are cached; refresh them.
        queryClient.invalidateQueries({ queryKey: ['drafts'] });
        queryClient.invalidateQueries({ queryKey: ['room-rail'] });
      } catch {/* swallow */}
    }, 1500);
    return () => clearTimeout(t);
  }, [content, user, draftId, queryClient]);

  // Revoke any outstanding preview object URLs on unmount to avoid memory leaks
  // for the life of the session.
  useEffect(() => {
    return () => {
      mediaPreviewsRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, []);

  const createPost = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Strip invisible fingerprints / click-tracking params out of the text
      // before anything leaves the device.
      const cleanContent = stripTextMetadata(content);

      // Everything that can reject the post is checked before any upload, so
      // a refused post never leaves orphaned files in storage.
      if (!cleanContent.trim() && mediaFiles.length === 0) {
        throw new Error("write something first.");
      }
      if (cleanContent.length > POST_MAX) {
        throw new Error(`posts can be up to ${POST_MAX} characters. this one is ${cleanContent.length}.`);
      }
      if (containsScamContent(cleanContent)) {
        throw new Error("this reads like a scam or spam pattern, so it was not posted. change the wording and try again.");
      }
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = cleanContent.match(urlRegex) || [];
      if (urls.some(url => isBlockedLink(url))) {
        throw new Error("one of the links is not allowed here. remove it and try again.");
      }
      if (scheduledDate) {
        if (scheduledDate.getTime() < Date.now() + SCHEDULE_MIN_LEAD_MS) {
          throw new Error("pick a time at least two minutes from now.");
        }
        // scheduled_posts has no poll, quote, topic or reply-control columns,
        // and the publisher does not carry them; refuse rather than drop them.
        if (pollData) throw new Error("polls cannot be scheduled yet. post now, or remove the poll.");
        if (quotePostId) throw new Error("quotes cannot be scheduled yet. post now, or remove the quote.");
        if (topicId || replyControl !== 'everyone') {
          throw new Error("scheduled posts cannot keep a topic or reply limit yet. clear them, or post now.");
        }
      }
      if (!isOnline() && (pollData || quotePostId)) {
        throw new Error("polls and quotes need a connection. try again when you are back online.");
      }

      // Every EXIF-style tag out of the media.
      const cleanMedia = await stripMetadataAll(mediaFiles);

      // Calculate expiry date, from when the post goes out.
      let expiresAt: Date | null = null;
      if (expiresIn) {
        const from = scheduledDate ? scheduledDate.getTime() : Date.now();
        const days = ({ '7d': 7, '30d': 30, '90d': 90 } as Record<string, number>)[expiresIn];
        if (days) expiresAt = new Date(from + days * 24 * 60 * 60 * 1000);
      }

      // If offline, queue the post (preserve audience / visibility selection)
      if (!isOnline()) {
        await queuePostOffline(cleanContent, {
          topicId: topicId || undefined,
          expiresIn: expiresIn || undefined,
          mediaFiles: cleanMedia.length > 0 ? cleanMedia : undefined,
          circleIds: selectedCircleIds,
          // offlineQueue still names this type; the value written is 'circle'.
          visibility: visibility as NonNullable<Parameters<typeof queuePostOffline>[1]>['visibility'],
          replyControl,
        });
        return { queued: true, scheduled: false };
      }

      const uploaded: string[] = [];
      // Set once the post row exists with these files attached.
      let keepUploads = false;
      try {
        // Upload media files. Rows store the object path; the bucket is
        // private and every reader signs its own URL.
        const results = await Promise.allSettled(cleanMedia.map(async (file) => {
          // Extension comes from the allow-listed MIME type, never the filename.
          const fileExt = extensionForMime(file.type);
          if (!fileExt) throw new Error("that file type is not supported.");
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 11)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('post-media').upload(fileName, file);
          if (uploadError) throw uploadError;
          uploaded.push(fileName);
          return fileName;
        }));
        const failedUpload = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (failedUpload) {
          throw new Error(failedUpload.reason instanceof Error && failedUpload.reason.message === "that file type is not supported."
            ? failedUpload.reason.message
            : uploadErrorMessage);
        }
        // Keep the writer's order, not upload completion order.
        const mediaUrls = results.map((r) => (r as PromiseFulfilledResult<string>).value);

        // If scheduled, create scheduled post (audience and expiry carried over).
        if (scheduledDate) {
          const { error } = await supabase.from('scheduled_posts').insert({
            content: cleanContent,
            user_id: user.id,
            media_urls: mediaUrls,
            scheduled_for: scheduledDate.toISOString(),
            circle_ids: selectedCircleIds,
            visibility,
            expires_at: expiresAt?.toISOString() ?? null,
          });
          if (error) throw error;
          keepUploads = true;
          return { queued: false, scheduled: true };
        }

        // Create immediate post
        const { data: newPost, error } = await supabase.from('posts').insert({
          content: cleanContent,
          user_id: user.id,
          media_urls: mediaUrls,
          expires_at: expiresAt?.toISOString() ?? null,
          topic_id: topicId || null,
          circle_ids: selectedCircleIds,
          visibility,
          reply_control: replyControl,
          quoted_post_id: quotePostId,
        }).select('id').single();
        if (error) throw error;
        keepUploads = true;

        // If poll data exists, create poll. A post whose poll failed is
        // removed again so a retry does not publish a duplicate.
        if (pollData && newPost) {
          let pollEndsAt: Date | null = null;
          if (pollData.duration !== 'none') {
            const daysMap: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7 };
            const days = daysMap[pollData.duration] || 1;
            pollEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          }

          let pollFailed = false;
          const { data: poll, error: pollError } = await supabase.from('polls').insert({
            post_id: newPost.id,
            question: pollData.question,
            allows_multiple: false,
            ends_at: pollEndsAt?.toISOString() ?? null,
          }).select('id').single();
          if (pollError || !poll) {
            pollFailed = true;
          } else {
            const { error: optError } = await supabase.from('poll_options').insert(
              pollData.options.map((opt, idx) => ({ poll_id: poll.id, option_text: opt, position: idx })),
            );
            if (optError) pollFailed = true;
          }

          if (pollFailed) {
            // Cascades to the poll and any options that did save.
            const { error: undoError } = await supabase.from('posts').delete().eq('id', newPost.id).eq('user_id', user.id);
            if (undoError) {
              throw new Error("the post went out, but its poll did not save. delete the post and try again.");
            }
            keepUploads = false;
            throw new Error("the poll did not save, so nothing was posted. try again.");
          }
        }

        return { queued: false, scheduled: false };
      } catch (err) {
        if (!keepUploads && uploaded.length > 0) {
          await supabase.storage.from('post-media').remove(uploaded).catch(() => undefined);
        }
        throw err;
      }
    },
    onMutate: () => {
      postGenRef.current += 1;
    },
    onSuccess: (result) => {
      postGenRef.current += 1;
      setContent("");
      setMediaFiles([]);
      mediaPreviewsRef.current.forEach((p) => URL.revokeObjectURL(p.url));
      setMediaPreviews([]);
      setExpiresIn("");
      setTopicId("");
      setPollData(null);
      setScheduledDate(null);
      setSelectedCircleIds([]);
      setVisibility('public');
      setReplyControl('everyone');
      setQuotePostId(null);
      setPollResetKey((k) => k + 1);
      // Every list that shows posts (the profile's own list included).
      for (const root of FEED_QUERY_ROOTS) queryClient.invalidateQueries({ queryKey: [root] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-calendar'] });
      // Clean up the draft after a successful publish, then refresh what
      // counts drafts (refreshing first would still count this one).
      const refreshDrafts = () => {
        queryClient.invalidateQueries({ queryKey: ['drafts'] });
        queryClient.invalidateQueries({ queryKey: ['room-rail'] });
      };
      if (draftId) {
        void supabase.from('post_drafts').delete().eq('id', draftId).then(refreshDrafts, refreshDrafts);
        setDraftId(null);
      } else {
        refreshDrafts();
      }

      if (result?.queued) {
        toast({ 
          title: "post queued",
          description: "you are offline. it goes out when you are back.",
        });
      } else if (result?.scheduled) {
        toast({ 
          title: "post scheduled",
          description: "it goes out at the time you picked.",
        });
      } else {
        toast({ title: "posted" });
      }
    },
    onError: (error) => {
      toast({
        title: "not posted",
        description: isRateLimitError(error) ? SLOW_DOWN : error.message,
        variant: "destructive",
      });
    }
  });

  const addFiles = async (files: File[]) => {
    const validFiles: File[] = [];
    for (const file of files) {
      const isVideoFile = file.type.startsWith('video/');
      const limit = isVideoFile ? MAX_FILE_SIZES.video : MAX_FILE_SIZES.image;
      // Allow-list + size + magic-byte check, before any metadata stripping.
      const error = await validateUpload(
        file,
        isVideoFile ? ALLOWED_VIDEO_TYPES : ALLOWED_IMAGE_TYPES,
        limit,
      );
      if (error) {
        toast({ title: "file not added", description: `${file.name}: ${error}`, variant: "destructive" });
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    // Previews are created synchronously alongside the files so that
    // mediaPreviews[i] always corresponds to mediaFiles[i].
    const newPreviews: MediaPreview[] = validFiles.map((file) => ({
      type: file.type.startsWith('video/') ? 'video' : 'image',
      url: URL.createObjectURL(file),
    }));

    setMediaFiles(prev => [...prev, ...validFiles].slice(0, MAX_MEDIA_FILES));
    setMediaPreviews(prev => {
      const combined = [...prev, ...newPreviews];
      // Free object URLs for anything that did not fit under the cap.
      combined.slice(MAX_MEDIA_FILES).forEach((p) => URL.revokeObjectURL(p.url));
      return combined.slice(0, MAX_MEDIA_FILES);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    void addFiles(Array.from(e.target.files || []));
    // Reset so re-selecting the same file still fires onChange
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file && (file.type.startsWith("image/") || file.type.startsWith("video/"))) {
          pasted.push(file);
        }
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      void addFiles(pasted);
      toast({ title: `added ${pasted.length} file${pasted.length > 1 ? "s" : ""} from the clipboard` });
    }
  };

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const removeMedia = (index: number) => {
    // Free the object URL we allocated for the preview to prevent a memory leak.
    const preview = mediaPreviews[index];
    if (preview) URL.revokeObjectURL(preview.url);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const reorderMedia = (from: number, to: number) => {
    if (from === to) return;
    setMediaFiles(prev => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
    setMediaPreviews(prev => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };

  const remaining = POST_MAX - content.length;
  const overLimit = remaining < 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && mediaFiles.length === 0) return;
    if (overLimit) {
      toast({ title: "too long", description: `posts can be up to ${POST_MAX} characters.`, variant: "destructive" });
      return;
    }
    createPost.mutate();
  };

  const pollDisabledReason = scheduledDate
    ? "polls go out with the post, so they cannot be scheduled."
    : null;

  const engaged = composerEngaged || content.length > 0 || mediaFiles.length > 0 || !!pollData || !!quotePostId;

  return (
    <div className="row px-5 sm:px-8 py-4">
      <form onSubmit={handleSubmit}>
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-0.5">
            <UserAvatar avatarUrl={myProfile?.avatar_url} username={myProfile?.username} size="md" />
          </div>
          <div className="flex-1 min-w-0">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setComposerEngaged(true)}
              onPaste={handlePaste}
              placeholder="write something."
              rows={engaged ? 4 : 1}
              className={`bg-transparent border-none resize-none text-[15.5px] font-light leading-[1.65] text-foreground placeholder:text-foreground/35 focus-visible:ring-0 p-0 shadow-none transition-[min-height] duration-200 ease-soft ${
                engaged ? "min-h-[104px]" : "min-h-[28px]"
              }`}
              maxLength={POST_MAX}
              aria-describedby={engaged ? "composer-count" : undefined}
            />

            {quotePostId && (
              <div className="mt-3 pl-4 border-l border-foreground/20 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {quoteLoading ? (
                    <p className="text-[13px] font-light text-foreground/40">quoting…</p>
                  ) : quotedPreview ? (
                    <>
                      <p className="text-[13px] font-light text-foreground/50">quoting @{quotedPreview.profiles?.username || "user"}</p>
                      <p className="mt-1 text-foreground/75 text-[14px] font-light leading-relaxed line-clamp-2">
                        {quotedPreview.content_warning || quotedPreview.is_nsfw
                          ? (quotedPreview.content_warning || "sensitive content")
                          : quotedPreview.content}
                      </p>
                    </>
                  ) : (
                    <p className="text-[13px] font-light text-foreground/40">that post is not available to quote.</p>
                  )}
                </div>
                <button type="button" onClick={() => setQuotePostId(null)} aria-label="remove quote" className="quiet p-1 rounded-md shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {mediaPreviews.length > 0 && (
              <div className={`grid gap-1.5 mt-3 ${mediaPreviews.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {mediaPreviews.map((preview, idx) => {
                  const isVideoPreview = preview.type === "video";
                  return (
                    <div
                      key={idx}
                      className={`relative group ${dragIndex === idx ? "opacity-50" : ""}`}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderMedia(dragIndex, idx); setDragIndex(null); }}
                      onDragEnd={() => setDragIndex(null)}
                    >
                      <div className="absolute top-2 left-2 bg-background/80 rounded-md p-1 opacity-0 group-hover:opacity-100 cursor-move z-10">
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      {isVideoPreview ? (
                        <video src={preview.url} className="w-full rounded-md object-cover max-h-56" controls />
                      ) : (
                        <img src={preview.url} alt="" className="w-full rounded-md object-cover max-h-56" />
                      )}
                      <button type="button" onClick={() => removeMedia(idx)} aria-label="remove" className="absolute top-2 right-2 bg-background/80 rounded-md p-1 quiet">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {engaged && (
              <PollCreator key={pollResetKey} poll={pollData} onPollChange={setPollData} disabledReason={pollDisabledReason} />
            )}

            {engaged && (
              <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-foreground/10">
                <div className="flex items-center gap-0.5 -ml-2">
                  <input ref={imageInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} multiple onChange={handleFileSelect} className="hidden" />
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="quiet p-2 rounded-md" title={`image · up to ${IMAGE_MAX_MB}MB`} aria-label="add image">
                    <Image className="w-[17px] h-[17px]" />
                  </button>
                  <input ref={videoInputRef} type="file" accept={ALLOWED_VIDEO_TYPES.join(",")} onChange={handleFileSelect} className="hidden" />
                  <button type="button" onClick={() => videoInputRef.current?.click()} className="quiet p-2 rounded-md" title={`video · up to ${VIDEO_MAX_MB}MB`} aria-label="add video">
                    <Video className="w-[17px] h-[17px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOptions((v) => !v)}
                    aria-expanded={showOptions}
                    aria-pressed={showOptions}
                    className="quiet inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-[13px]"
                  >
                    <SlidersHorizontal className="w-[15px] h-[15px]" />
                    <span>options</span>
                    {!showOptions && changedOptionCount > 0 && <span className="text-signal tabular-nums">{changedOptionCount}</span>}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {content.length > 0 && (
                    <span
                      id="composer-count"
                      className="text-[12px] tabular-nums font-light"
                      style={{ color: remaining <= 20 ? "hsl(var(--destructive))" : "hsl(var(--foreground) / 0.5)" }}
                      title={`${content.length}/${POST_MAX}`}
                      aria-live="polite"
                    >
                      {remaining}
                    </span>
                  )}
                  {(content.trim() || mediaFiles.length > 0) && (
                    <button type="button" onClick={() => setPreviewOpen(true)} className="quiet p-2 rounded-md" title="preview" aria-label="preview">
                      <Eye className="w-[15px] h-[15px]" />
                    </button>
                  )}
                  <Button
                    type="submit"
                    variant="signal"
                    size="sm"
                    disabled={(!content.trim() && mediaFiles.length === 0) || overLimit || (!!quotePostId && quotedPreview === null) || createPost.isPending}
                    className="rounded-md h-8 px-3.5 text-[13px] font-medium"
                  >
                    {createPost.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : scheduledDate ? "schedule" : "post"}
                  </Button>
                </div>
              </div>
            )}

            {engaged && showOptions && scheduledDate && (
              <p className="mt-2 text-[12px] font-light text-foreground/40">
                scheduled posts keep their audience and expiry. polls, quotes, topics and reply limits need posting now.
              </p>
            )}
            {engaged && showOptions && (
              <div className="flex flex-wrap items-center gap-1 mt-2 -ml-1">
                <Suspense fallback={<span className="inline-block h-8 w-9" aria-hidden />}>
                  <ScheduleSelector scheduledDate={scheduledDate} onScheduleChange={setScheduledDate} />
                </Suspense>
                <AudienceSelector
                  selectedCircleIds={selectedCircleIds}
                  visibility={visibility}
                  onSelectionChange={(circleIds, vis) => { setSelectedCircleIds(circleIds); setVisibility(vis); }}
                />
                <Select value={topicId || "none"} onValueChange={(v) => setTopicId(v === "none" ? "" : v)}>
                  <SelectTrigger className="w-auto border-none bg-transparent quiet h-8 gap-1 text-[13px] shadow-none focus:ring-0">
                    <Hash className="w-3.5 h-3.5" />
                    <SelectValue placeholder="topic" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border">
                    <SelectItem value="none">no topic</SelectItem>
                    {topics?.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>{topic.icon} {topic.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={replyControl} onValueChange={setReplyControl}>
                  <SelectTrigger className="w-auto border-none bg-transparent quiet h-8 gap-1 text-[13px] shadow-none focus:ring-0">
                    <MessageSquareOff className="w-3.5 h-3.5" />
                    <SelectValue placeholder="replies" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border">
                    {REPLY_CONTROL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates && templates.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="quiet inline-flex items-center gap-1 h-8 px-2 rounded-md text-[13px]" title="insert template">
                        <FileStack className="w-3.5 h-3.5" /> template
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="glass-panel border w-72 p-2">
                      <div className="space-y-0.5 max-h-64 overflow-y-auto">
                        {templates.map((t: { id: string; name: string; content: string }) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setContent((prev) => (prev ? prev + "\n" + t.content : t.content))}
                            className="w-full text-left p-2 rounded-md hover:bg-foreground/5 transition-colors"
                          >
                            <div className="text-[13px] text-foreground">{t.name}</div>
                            <div className="text-[12px] text-foreground/50 line-clamp-1 font-light">{t.content}</div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Select value={expiresIn || "never"} onValueChange={(v) => setExpiresIn(v === "never" ? "" : v)}>
                  <SelectTrigger className="w-auto border-none bg-transparent quiet h-8 gap-1 text-[13px] shadow-none focus:ring-0">
                    <Clock className="w-3.5 h-3.5" />
                    <SelectValue placeholder="expires" />
                  </SelectTrigger>
                  <SelectContent className="glass-panel border">
                    <SelectItem value="never">keeps forever</SelectItem>
                    <SelectItem value="7d">gone in 7 days</SelectItem>
                    <SelectItem value="30d">gone in 30 days</SelectItem>
                    <SelectItem value="90d">gone in 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Pre-publish preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="glass-panel border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-light lowercase">preview</DialogTitle>
          </DialogHeader>
          <div className="glass-card rounded-xl p-4 my-2">
            <div className="text-[11px] text-foreground/40 uppercase tracking-[0.2em] font-light mb-2">how it will read</div>
            <p className="text-foreground font-light whitespace-pre-wrap leading-relaxed">{content || <span className="text-foreground/40 italic">No text</span>}</p>
            {mediaPreviews.length > 0 && (
              <div className={`grid gap-2 mt-3 ${mediaPreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {mediaPreviews.map((p, i) => (
                  p.type === 'video'
                    ? <video key={i} src={p.url} className="w-full rounded max-h-48 object-cover" />
                    : <img key={i} src={p.url} alt="" className="w-full rounded max-h-48 object-cover" />
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPreviewOpen(false)} className="font-light">keep editing</Button>
            <Button onClick={() => { setPreviewOpen(false); createPost.mutate(); }} disabled={createPost.isPending || overLimit}>
              post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PostComposer;
