-- =============================================================================
-- Mentor review: add 'rejected' status and staff_note column
-- =============================================================================

-- Extend the status check to allow staff to reject applications.
-- PostgreSQL requires dropping and re-adding the constraint.
alter table public.mentors drop constraint if exists mentors_status_check;
alter table public.mentors add constraint mentors_status_check
  check (status in ('pending', 'active', 'inactive', 'rejected'));

-- Optional note left by staff when approving or rejecting a mentor.
alter table public.mentors add column if not exists staff_note text;
