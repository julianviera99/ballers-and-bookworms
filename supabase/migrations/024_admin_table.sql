-- Replace the profiles-based admin check with a minimal, dedicated admins table.
-- This is the only role that exists in the new public-tool + minimal-admin-backend app.

create table public.admins (
  id         uuid        primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "Admins can read admins"
  on public.admins for select
  using (public.is_admin());

-- Seed from the existing hardcoded admin emails (same accounts that were
-- admins under the old profiles.role = 'admin' system).
insert into public.admins (id, email)
select au.id, au.email
from auth.users au
where au.email in ('julian@ballersandbookworms.org', 'julianviera99@gmail.com')
on conflict (id) do nothing;

-- Redefine is_admin() against the new table. Every existing policy that
-- calls is_admin() (ncaa_schools, student_athletes, funding_requests, etc.)
-- keeps working unchanged.
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.admins where id = auth.uid()
  );
$$;
