-- Fix creator_id to be TEXT instead of UUID since we don't use authentication
ALTER TABLE public.rooms 
ALTER COLUMN creator_id TYPE TEXT;