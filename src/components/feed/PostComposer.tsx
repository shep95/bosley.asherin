import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import ScheduleSelector from "@/components/composer/ScheduleSelector";
import AudienceSelector from "@/components/composer/AudienceSelector";

interface MediaPreview {
  type: 'image' | 'video';
  url: string;
}

const MAX_MEDIA_FILES = 4;
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
  const [visibility, setVisibility] = useState<'public' | 'circles'>('public');
  const [replyControl, setReplyControl] = useState<string>('everyone');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  // Topics and templates are only ever read once someone starts composing, but
  // fetching them on mount put two extra round trips in front of the feed's
  // first paint on every dashboard visit. They now warm up on first contact
  // with the composer, long before any dropdown can be opened.
  const [composerEngaged, setComposerEngaged] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  // Auto-save draft (debounced)
  useEffect(() => {
    if (!user || !content.trim() || content.length < 5) return;
    const t = setTimeout(async () => {
      try {
        if (draftId) {
          await supabase.from('post_drafts').update({ content, updated_at: new Date().toISOString() }).eq('id', draftId);
        } else {
          const { data } = await supabase.from('post_drafts').insert({ user_id: user.id, content }).select('id').single();
          if (data) setDraftId(data.id);
        }
      } catch {/* swallow */}
    }, 1500);
    return () => clearTimeout(t);
  }, [content, user, draftId]);

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

      // Strip invisible fingerprints / click-tracking params out of the text,
      // and every EXIF-style tag out of the media, before anything leaves the device.
      const cleanContent = stripTextMetadata(content);
      const cleanMedia = await stripMetadataAll(mediaFiles);

      // Check for harmful content
      if (containsScamContent(cleanContent)) {
        throw new Error("Your post contains content that violates our community guidelines.");
      }
      
      // Check for blocked links
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = cleanContent.match(urlRegex) || [];
      if (urls.some(url => isBlockedLink(url))) {
        throw new Error("Your post contains links that are not allowed.");
      }
      
      // If offline, queue the post (preserve audience / visibility selection)
      if (!isOnline()) {
        await queuePostOffline(cleanContent, {
          topicId: topicId || undefined,
          expiresIn: expiresIn || undefined,
          mediaFiles: cleanMedia.length > 0 ? cleanMedia : undefined,
          circleIds: selectedCircleIds,
          visibility,
          replyControl,
        });
        return { queued: true, scheduled: false };
      }
      
      const mediaUrls: string[] = [];
      
      // Upload media files
      for (const file of cleanMedia) {
        // Extension comes from the allow-listed MIME type, never the filename.
        const fileExt = extensionForMime(file.type);
        if (!fileExt) throw new Error("That file type is not supported.");
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(fileName, file);
          
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('post-media')
          .getPublicUrl(fileName);
          
        mediaUrls.push(publicUrl);
      }
      
      // Calculate expiry date
      let expiresAt = null;
      if (expiresIn) {
        const now = new Date();
        switch (expiresIn) {
          case '7d': expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); break;
          case '30d': expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); break;
          case '90d': expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); break;
        }
      }
      
      // If scheduled, create scheduled post
      if (scheduledDate) {
        const { error } = await supabase.from('scheduled_posts').insert({
          content: cleanContent,
          user_id: user.id,
          media_urls: mediaUrls,
          scheduled_for: scheduledDate.toISOString(),
          circle_ids: selectedCircleIds,
          visibility,
          expires_at: expiresAt?.toISOString()
        });
        if (error) throw error;
        return { queued: false, scheduled: true };
      }
      
      // Create immediate post
      const { data: newPost, error } = await supabase.from('posts').insert({
        content: cleanContent,
        user_id: user.id,
        media_urls: mediaUrls,
        expires_at: expiresAt?.toISOString(),
        topic_id: topicId || null,
        circle_ids: selectedCircleIds,
        visibility,
        reply_control: replyControl
      }).select().single();
      
      if (error) throw error;
      
      // If poll data exists, create poll
      if (pollData && newPost) {
        let pollEndsAt = null;
        if (pollData.duration !== 'none') {
          const daysMap: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7 };
          const days = daysMap[pollData.duration] || 1;
          pollEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        }
        
        const { data: poll, error: pollError } = await supabase.from('polls').insert({
          post_id: newPost.id,
          question: pollData.question,
          allows_multiple: pollData.allowsMultiple,
          ends_at: pollEndsAt?.toISOString()
        }).select().single();
        
        if (pollError) throw pollError;
        
        // Create poll options
        const optionInserts = pollData.options.map((opt, idx) => ({
          poll_id: poll.id,
          option_text: opt,
          position: idx
        }));
        
        const { error: optError } = await supabase.from('poll_options').insert(optionInserts);
        if (optError) throw optError;
      }
      
      return { queued: false, scheduled: false };
    },
    onSuccess: (result) => {
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
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      // Clean up draft after successful publish
      if (draftId) {
        supabase.from('post_drafts').delete().eq('id', draftId).then();
        setDraftId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      
      if (result?.queued) {
        toast({ 
          title: "Post queued", 
          description: "You're offline. Your post will be published when you're back online.",
        });
      } else if (result?.scheduled) {
        toast({ 
          title: "Post scheduled!", 
          description: "Your post will be published at the scheduled time.",
        });
      } else {
        toast({ title: "Posted!", description: "Your thoughts are now live." });
      }
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
        toast({ title: "File not added", description: `${file.name}: ${error}`, variant: "destructive" });
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
      toast({ title: "Pasted", description: `Added ${pasted.length} file${pasted.length > 1 ? "s" : ""} from clipboard.` });
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

  const charPercent = Math.min(100, (content.length / 1000) * 100);
  const charColor = content.length > 950 ? 'hsl(var(--destructive))' : content.length > 800 ? 'hsl(35 90% 55%)' : 'hsl(var(--primary))';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && mediaFiles.length === 0) return;
    if (content.length > 1000) {
      toast({ title: "Error", description: "Post must be less than 1000 characters", variant: "destructive" });
      return;
    }
    createPost.mutate();
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 focus-within:border-foreground/20 focus-within:shadow-lift">
      <form onSubmit={handleSubmit}>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setComposerEngaged(true)}
          onPaste={handlePaste}
          placeholder="What's on your mind? Speak freely..."
          className="bg-transparent border-none resize-none min-h-[88px] text-[0.9375rem] leading-[1.6] text-foreground placeholder:text-foreground/45 focus-visible:ring-0 p-0 mb-4"
          maxLength={1000}
        />
        
        {/* Media previews */}
        {mediaPreviews.length > 0 && (
          <div className={`grid gap-2 mb-4 ${mediaPreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {mediaPreviews.map((preview, idx) => {
              const isVideoPreview = preview.type === 'video';
              return (
                <div
                  key={idx}
                  className={`relative group ${dragIndex === idx ? 'opacity-50' : ''}`}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorderMedia(dragIndex, idx); setDragIndex(null); }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <div className="absolute top-2 left-2 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 cursor-move z-10">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                  {isVideoPreview ? (
                    <video src={preview.url} className="w-full rounded-xl object-cover max-h-48" controls />
                  ) : (
                    <img src={preview.url} alt="" className="w-full rounded-xl object-cover max-h-48" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(idx)}
                    className="absolute top-2 right-2 bg-background/80 rounded-full p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Poll Creator */}
        <PollCreator poll={pollData} onPollChange={setPollData} />
        
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Image upload */}
            <input
              ref={imageInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              className="text-foreground/60 hover:text-foreground"
              title={`Add image (max ${IMAGE_MAX_MB}MB)`}
            >
              <Image className="w-5 h-5" />
            </Button>
            
            {/* Video upload */}
            <input
              ref={videoInputRef}
              type="file"
              accept={ALLOWED_VIDEO_TYPES.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => videoInputRef.current?.click()}
              className="text-foreground/60 hover:text-foreground"
              title={`Add video (max ${VIDEO_MAX_MB}MB)`}
            >
              <Video className="w-5 h-5" />
            </Button>

            {/* Progressive disclosure: five dropdowns before a first post is
                paralysing. Defaults are sane, so keep them folded away until
                the writer actually wants to change one. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowOptions((v) => !v)}
              onFocus={() => setComposerEngaged(true)}
              aria-expanded={showOptions}
              className="text-foreground/60 hover:text-foreground gap-1.5"
              title="Post options"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-xs">Options</span>
              {!showOptions && changedOptionCount > 0 && (
                <span className="ml-0.5 rounded-full bg-signal/20 text-signal text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">
                  {changedOptionCount}
                </span>
              )}
            </Button>

            {showOptions && (
              <>
            {/* Schedule selector */}
            <ScheduleSelector 
              scheduledDate={scheduledDate} 
              onScheduleChange={setScheduledDate} 
            />
            
            {/* Audience selector */}
            <AudienceSelector
              selectedCircleIds={selectedCircleIds}
              visibility={visibility}
              onSelectionChange={(circleIds, vis) => {
                setSelectedCircleIds(circleIds);
                setVisibility(vis);
              }}
            />
            
            {/* Topic selector */}
            <Select value={topicId || "none"} onValueChange={(v) => setTopicId(v === "none" ? "" : v)}>
              <SelectTrigger className="w-auto border-none bg-transparent text-foreground/60 hover:text-foreground h-9 gap-1">
                <Hash className="w-4 h-4" />
                <SelectValue placeholder="Topic" />
              </SelectTrigger>
              <SelectContent className="glass-panel border">
                <SelectItem value="none">No topic</SelectItem>
                {topics?.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topic.icon} {topic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Reply control */}
            <Select value={replyControl} onValueChange={setReplyControl}>
              <SelectTrigger className="w-auto border-none bg-transparent text-foreground/60 hover:text-foreground h-9 gap-1">
                <MessageSquareOff className="w-4 h-4" />
                <SelectValue placeholder="Replies" />
              </SelectTrigger>
              <SelectContent className="glass-panel border">
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="followers">Followers only</SelectItem>
                <SelectItem value="mutuals">Mutuals only</SelectItem>
                <SelectItem value="mentioned">Mentioned only</SelectItem>
                <SelectItem value="none">No replies</SelectItem>
              </SelectContent>
            </Select>

            {/* Templates picker */}
            {templates && templates.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="text-foreground/60 hover:text-foreground gap-1" title="Insert template">
                    <FileStack className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="glass-panel border w-72 p-2">
                  <p className="text-xs text-foreground/50 px-2 py-1 uppercase tracking-wider">Templates</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {templates.map((t: any) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setContent(prev => prev ? prev + '\n' + t.content : t.content)}
                        className="w-full text-left p-2 rounded hover:bg-foreground/5 transition-colors"
                      >
                        <div className="font-medium text-sm">{t.name}</div>
                        <div className="text-xs text-foreground/50 line-clamp-1">{t.content}</div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Expiry selector */}
            <Select value={expiresIn || "never"} onValueChange={(v) => setExpiresIn(v === "never" ? "" : v)}>
              <SelectTrigger className="w-auto border-none bg-transparent text-foreground/60 hover:text-foreground h-9 gap-1">
                <Clock className="w-4 h-4" />
                <SelectValue placeholder="Expires" />
              </SelectTrigger>
              <SelectContent className="glass-panel border">
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="90d">90 days</SelectItem>
              </SelectContent>
            </Select>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {/* Character arc ring */}
            <div className="relative w-7 h-7" title={`${content.length}/1000`}>
              <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
                <circle cx="14" cy="14" r="11" stroke="hsl(var(--foreground) / 0.1)" strokeWidth="2.5" fill="none" />
                <circle
                  cx="14" cy="14" r="11" fill="none"
                  stroke={charColor} strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 11}
                  strokeDashoffset={(2 * Math.PI * 11) * (1 - charPercent / 100)}
                  style={{ transition: 'stroke-dashoffset 0.2s, stroke 0.2s' }}
                />
              </svg>
              {content.length > 800 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium" style={{ color: charColor }}>
                  {1000 - content.length}
                </span>
              )}
            </div>

            {/* Preview button */}
            {(content.trim() || mediaFiles.length > 0) && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreviewOpen(true)} className="text-foreground/60 hover:text-foreground" title="Preview">
                <Eye className="w-4 h-4" />
              </Button>
            )}
            <Button
              type="submit"
              disabled={(!content.trim() && mediaFiles.length === 0) || createPost.isPending}
              className="rounded-xl font-light bg-foreground text-background hover:bg-foreground/90"
            >
              {createPost.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Post
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Pre-publish preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="glass-panel border max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview</DialogTitle>
          </DialogHeader>
          <div className="glass-card rounded-xl p-4 my-2">
            <div className="text-xs text-foreground/40 uppercase tracking-wider mb-2">How your post will look</div>
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
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>Keep editing</Button>
            <Button onClick={() => { setPreviewOpen(false); createPost.mutate(); }} disabled={createPost.isPending}>
              <Send className="w-4 h-4 mr-2" /> Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PostComposer;
