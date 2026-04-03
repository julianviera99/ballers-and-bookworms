-- Allow staff to be pre-seeded by email before they've ever logged in.
-- user_id must become nullable so email-only rows can exist.
alter table public.staff_users
  alter column user_id drop not null;

alter table public.staff_users
  add column email text unique;

-- Update select policy: match by user_id (existing logins) OR email (pre-seeded, first login)
drop policy "Staff can read own record" on public.staff_users;
create policy "Staff can read own record"
  on public.staff_users for select
  using (auth.uid() = user_id or auth.email() = email);

-- Allow a pre-seeded staff member to link their user_id on first login
create policy "Staff can link their user_id"
  on public.staff_users for update
  using (auth.email() = email)
  with check (auth.uid() = user_id);

-- Update is_staff() to check both user_id and email
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
       or email = auth.email()
  );
$$;

-- Seed the first staff member
insert into public.staff_users (email) values ('julian@ballersandbookworms.org');
