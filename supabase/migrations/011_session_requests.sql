-- =============================================================================
-- Session requests + vector similarity search function
-- =============================================================================


-- -----------------------------------------------------------------------------
-- session_requests
-- Created when a student athlete clicks "Request a Session" on a mentor card.
-- A notification email is sent to the mentor via the request-session edge fn.
-- -----------------------------------------------------------------------------
create table public.session_requests (
  id         uuid        primary key default gen_random_uuid(),
  mentor_id  uuid        not null references public.mentors (id) on delete cascade,
  mentee_id  uuid        not null references public.student_athletes (id) on delete cascade,
  message    text,
  status     text        not null default 'pending'
               check (status in ('pending', 'responded', 'declined')),
  created_at timestamptz not null default now()
);

alter table public.session_requests enable row level security;

-- Athletes can submit and see their own requests
create policy "Athletes can insert own session requests"
  on public.session_requests for insert
  with check (exists (
    select 1 from public.student_athletes sa
    where sa.id = mentee_id and sa.user_id = auth.uid()
  ));

create policy "Athletes can select own session requests"
  on public.session_requests for select
  using (exists (
    select 1 from public.student_athletes sa
    where sa.id = mentee_id and sa.user_id = auth.uid()
  ));

-- Mentors can see requests addressed to them
create policy "Mentors can select own session requests"
  on public.session_requests for select
  using (exists (
    select 1 from public.mentors m
    where m.id = mentor_id and m.user_id = auth.uid()
  ));

-- Staff can read and manage everything
create policy "Staff can manage session requests"
  on public.session_requests for all
  using (public.is_staff())
  with check (public.is_staff());


-- -----------------------------------------------------------------------------
-- match_mentors
-- Vector similarity search called by the find-mentors edge function.
-- Accepts a query embedding and a list of pre-filtered candidate mentor IDs,
-- returns them ranked by cosine similarity (highest first).
--
-- security definer so the function can read mentor_embeddings regardless of
-- the calling user's RLS context. Only invokable by service_role.
-- -----------------------------------------------------------------------------
create or replace function public.match_mentors(
  query_embedding vector(1536),
  candidate_ids   uuid[],
  match_count     int default 3
)
returns table (
  mentor_id  uuid,
  similarity numeric
)
language sql stable
security definer
set search_path = public
as $$
  select
    me.mentor_id,
    (1 - (me.embedding <=> query_embedding))::numeric as similarity
  from public.mentor_embeddings me
  where me.mentor_id = any(candidate_ids)
  order by me.embedding <=> query_embedding
  limit match_count;
$$;

-- Only the service role (used by edge functions) should call this directly.
revoke execute on function public.match_mentors from public, anon, authenticated;
grant  execute on function public.match_mentors to service_role;
