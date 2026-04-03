-- Add name and school to student athlete profiles
alter table public.student_athletes
  add column name   text,
  add column school text;

-- Ensure each user has at most one athlete profile (needed for upsert)
alter table public.student_athletes
  add constraint student_athletes_user_id_key unique (user_id);

-- ---------------------------------------------------------------
-- updated_at trigger (shared by student_athletes and later tables)
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_student_athletes_updated_at
  before update on public.student_athletes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Staff registry
-- Only writable via the service role key (no client insert policy).
-- ---------------------------------------------------------------
create table public.staff_users (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;

-- Staff can read their own row (lets the client verify its own role)
create policy "Staff can read own record"
  on public.staff_users for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Reusable staff-check function (security definer so subqueries in
-- other tables' RLS policies can call it without needing direct
-- SELECT on staff_users)
-- ---------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.staff_users
    where user_id = auth.uid()
  );
$$;

-- Allow staff to read all athlete profiles (needed for admin dashboard)
create policy "Staff can select all student athletes"
  on public.student_athletes for select
  using (public.is_staff());
