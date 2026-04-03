create table public.funding_requests (
  id                 uuid          primary key default gen_random_uuid(),
  student_athlete_id uuid          not null references public.student_athletes (id) on delete cascade,
  user_id            uuid          not null references auth.users (id) on delete cascade,
  category           text          not null check (category in (
                       'academic_supplies', 'athletic_equipment', 'tutoring',
                       'athletic_training', 'nutrition_consulting', 'camp_fees',
                       'travel_costs', 'other'
                     )),
  amount             numeric(10,2) not null check (amount > 0),
  description        text          not null,
  receipt_url        text,
  status             text          not null default 'pending' check (status in (
                       'pending', 'approved', 'reimbursed', 'denied', 'flagged'
                     )),
  staff_note         text,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);

alter table public.funding_requests enable row level security;

create trigger set_funding_requests_updated_at
  before update on public.funding_requests
  for each row execute function public.set_updated_at();

-- Students can read their own requests
create policy "Students can select own requests"
  on public.funding_requests for select
  using (auth.uid() = user_id);

-- Students can submit requests for themselves
create policy "Students can insert own requests"
  on public.funding_requests for insert
  with check (auth.uid() = user_id);

-- Staff can read all requests (for the admin dashboard)
create policy "Staff can select all requests"
  on public.funding_requests for select
  using (public.is_staff());

-- Staff can update any request (approve / deny / flag / reimburse)
create policy "Staff can update all requests"
  on public.funding_requests for update
  using (public.is_staff())
  with check (public.is_staff());
