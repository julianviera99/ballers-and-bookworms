-- Drop the pg_net-based trigger added in migration 009.
-- It relied on app.settings.supabase_url and app.settings.service_role_key,
-- which hosted Supabase does not allow setting.
--
-- Replacement: create a Database Webhook in the Supabase dashboard that
-- calls the embed-mentor edge function automatically.
--
-- Setup (one-time, in the Supabase dashboard):
--   Database → Webhooks → Create a new webhook
--     Name:       embed-mentor
--     Table:      public.mentors
--     Events:     INSERT, UPDATE
--     Type:       Supabase Edge Functions
--     Function:   embed-mentor
--
-- The webhook sends the full row payload; the edge function checks
-- status = 'active' itself before generating an embedding.

drop trigger if exists embed_mentor_after_activate on public.mentors;
drop function if exists public.queue_mentor_embedding();
