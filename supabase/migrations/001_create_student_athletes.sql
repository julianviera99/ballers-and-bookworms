create table public.student_athletes (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  hometown   text,
  home_state text,
  grade      text,
  sports     text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_athletes enable row level security;

create policy "Users can select their own row"
  on public.student_athletes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own row"
  on public.student_athletes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own row"
  on public.student_athletes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own row"
  on public.student_athletes for delete
  using (auth.uid() = user_id);
