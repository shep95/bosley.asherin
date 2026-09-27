-- Server-side length validation for posts/comments/messages
CREATE OR REPLACE FUNCTION public.validate_post_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS NULL OR length(trim(NEW.content)) = 0 THEN
    -- Allow empty content only when the post has media attached
    IF NEW.media_urls IS NULL OR array_length(NEW.media_urls, 1) IS NULL THEN
      RAISE EXCEPTION 'Post content cannot be empty';
    END IF;
  END IF;
  IF length(NEW.content) > 500 AND COALESCE(NEW.is_long_form, false) = false THEN
    RAISE EXCEPTION 'Post content exceeds 500 character limit';
  END IF;
  IF length(NEW.content) > 25000 THEN
    RAISE EXCEPTION 'Long-form post exceeds 25000 character limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_validate_content ON public.posts;
CREATE TRIGGER posts_validate_content
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.validate_post_content();

CREATE OR REPLACE FUNCTION public.validate_comment_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS NULL OR length(trim(NEW.content)) = 0 THEN
    RAISE EXCEPTION 'Comment cannot be empty';
  END IF;
  IF length(NEW.content) > 500 THEN
    RAISE EXCEPTION 'Comment exceeds 500 character limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_validate_content ON public.comments;
CREATE TRIGGER comments_validate_content
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.validate_comment_content();

CREATE OR REPLACE FUNCTION public.validate_message_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS NULL OR length(trim(NEW.content)) = 0 THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;
  IF length(NEW.content) > 4000 THEN
    RAISE EXCEPTION 'Message exceeds 4000 character limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_validate_content ON public.messages;
CREATE TRIGGER messages_validate_content
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_content();

-- Username server-side validation (alphanumeric + underscore, 3-30 chars)
CREATE OR REPLACE FUNCTION public.validate_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username !~ '^[A-Za-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters: letters, numbers, underscore only';
  END IF;
  IF NEW.bio IS NOT NULL AND length(NEW.bio) > 500 THEN
    RAISE EXCEPTION 'Bio exceeds 500 characters';
  END IF;
  IF NEW.display_name IS NOT NULL AND length(NEW.display_name) > 50 THEN
    RAISE EXCEPTION 'Display name exceeds 50 characters';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate ON public.profiles;
CREATE TRIGGER profiles_validate
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile();