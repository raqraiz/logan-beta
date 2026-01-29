-- Create enum for insight status
CREATE TYPE public.insight_status AS ENUM ('pending', 'approved', 'rejected', 'sent');

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Users/Participants table (onboarding data)
CREATE TABLE public.participants (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    full_name TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL UNIQUE,
    email TEXT,
    age INTEGER,
    cycle_length_days INTEGER DEFAULT 28,
    last_period_start DATE,
    cycle_regularity TEXT, -- regular, irregular, very_irregular
    typical_symptoms TEXT[], -- array of common symptoms
    goals TEXT[], -- what they want from Logan
    timezone TEXT DEFAULT 'Asia/Jerusalem',
    is_active BOOLEAN DEFAULT true
);

-- User roles table for admin access
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    UNIQUE (user_id, role)
);

-- Insights table (AI-generated content for approval)
CREATE TABLE public.insights (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    insight_type TEXT, -- prediction, recommendation, check_in
    scheduled_for TIMESTAMP WITH TIME ZONE,
    status insight_status DEFAULT 'pending',
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    ai_prompt_used TEXT,
    admin_notes TEXT
);

-- Feedback table (user responses to insights)
CREATE TABLE public.feedback (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    insight_id UUID REFERENCES public.insights(id) ON DELETE CASCADE NOT NULL,
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
    emoji_reaction TEXT,
    is_useful BOOLEAN,
    emotion TEXT,
    action_taken BOOLEAN,
    improvement_suggestion TEXT,
    free_form_text TEXT
);

-- Cycle updates (user-reported changes)
CREATE TABLE public.cycle_updates (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    participant_id UUID REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
    update_type TEXT NOT NULL, -- internal, external
    description TEXT NOT NULL,
    category TEXT -- mood, physical, travel, sleep, exercise, food, other
);

-- Enable RLS
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_updates ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for participants (public can insert for onboarding, admins can view all)
CREATE POLICY "Anyone can register as participant" 
ON public.participants FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can view all participants" 
ON public.participants FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update participants" 
ON public.participants FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for insights
CREATE POLICY "Admins can manage insights" 
ON public.insights FOR ALL 
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for feedback
CREATE POLICY "Anyone can submit feedback" 
ON public.feedback FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can view feedback" 
ON public.feedback FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for cycle_updates
CREATE POLICY "Anyone can submit cycle updates" 
ON public.cycle_updates FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can view cycle updates" 
ON public.cycle_updates FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_participants_updated_at
BEFORE UPDATE ON public.participants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_insights_updated_at
BEFORE UPDATE ON public.insights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();