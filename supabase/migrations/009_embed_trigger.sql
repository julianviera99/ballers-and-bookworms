-- Automatically queue embedding generation whenever a mentor's status
-- becomes 'active' or their bio is updated while already active.
--
-- HOW IT WORKS
--   The trigger calls the `embed-mentor` Supabase Edge Function via
--   pg_net (async HTTP — the INSERT/UPDATE is not blocked).
--
-- ONE-TIME SETUP (run these once in the Supabase SQL editor — not here,
-- because they contain secrets):
--
--   alter database postgres
--     set app.settings.supabase_url = 'https://<project-ref>.supabase.co';
--
--   alter database postgres
--     set app.settings.service_role_key = '<your-service-role-key>';
--
-- Also add OPENAI_API_KEY to your Edge Function secrets:
--   Supabase dashboard → Edge Functions → embed-mentor → Secrets
-- -----------------------------------------------------------------------

create extension if not exists pg_net;

create or replace function public.queue_mentor_embedding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _url text := current_setting('app.settings.supabase_url', true);
  _key text := current_setting('app.settings.service_role_key', true);
begin
  -- Fire when status becomes 'active' for the first time,
  -- or when bio changes while the mentor is already active.
  if new.status = 'active' and (
    tg_op = 'INSERT'
    or old.status is distinct from 'active'
    or coalesce(old.bio, '') is distinct from coalesce(new.bio, '')
  ) then

    if _url is null or _key is null then
      raise warning '[embed-mentor] app.settings.supabase_url or service_role_key not set — skipping embedding';
      return new;
    end if;

    perform net.http_post(
      url     := _url || '/functions/v1/embed-mentor',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _key
      ),
      body    := jsonb_build_object('mentor_id', new.id)::text
    );

  end if;
  return new;
end;
$$;

create trigger embed_mentor_after_activate
  after insert or update on public.mentors
  for each row execute function public.queue_mentor_embedding();
