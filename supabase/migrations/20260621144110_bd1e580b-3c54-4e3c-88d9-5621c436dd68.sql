
-- Add super_admin tier
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
