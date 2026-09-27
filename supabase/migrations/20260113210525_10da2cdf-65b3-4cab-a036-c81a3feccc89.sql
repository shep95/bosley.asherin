-- Enable RLS on blocked_email_domains table
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read blocked domains (needed for validation)
CREATE POLICY "Blocked domains are viewable by everyone" 
ON public.blocked_email_domains 
FOR SELECT 
USING (true);