-- =============================================
-- ANONYMOUS Q&A FEATURE
-- =============================================

-- Questions table - stores anonymous questions sent to users
CREATE TABLE public.anonymous_questions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_user_id UUID NOT NULL,
    question_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    answered_at TIMESTAMP WITH TIME ZONE,
    answer_text TEXT,
    is_public BOOLEAN DEFAULT false,
    is_hidden BOOLEAN DEFAULT false
);

-- Index for efficient querying
CREATE INDEX idx_anonymous_questions_recipient ON public.anonymous_questions(recipient_user_id, created_at DESC);
CREATE INDEX idx_anonymous_questions_public ON public.anonymous_questions(recipient_user_id, is_public, created_at DESC);

-- Enable RLS
ALTER TABLE public.anonymous_questions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can submit anonymous questions (sender not stored)
CREATE POLICY "Authenticated users can ask questions"
ON public.anonymous_questions FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() != recipient_user_id);

-- Recipients can view their own questions
CREATE POLICY "Recipients can view their questions"
ON public.anonymous_questions FOR SELECT
USING (auth.uid() = recipient_user_id);

-- Recipients can update (answer) their questions
CREATE POLICY "Recipients can answer questions"
ON public.anonymous_questions FOR UPDATE
USING (auth.uid() = recipient_user_id);

-- Recipients can delete questions
CREATE POLICY "Recipients can delete questions"
ON public.anonymous_questions FOR DELETE
USING (auth.uid() = recipient_user_id);

-- Public answered questions visible to everyone
CREATE POLICY "Public answers visible to authenticated"
ON public.anonymous_questions FOR SELECT
USING (is_public = true AND answered_at IS NOT NULL);

-- Add setting to enable/disable Q&A
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS anonymous_qa_enabled BOOLEAN DEFAULT true;