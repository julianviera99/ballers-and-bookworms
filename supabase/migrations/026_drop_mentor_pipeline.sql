-- Remove the mentor-matching pipeline entirely (feature removed, not preserved).
-- Drop order respects foreign keys: session_requests/matches reference mentors
-- and student_athletes; mentee_intake references student_athletes; the mentor
-- support tables reference mentors.

drop table if exists public.session_requests;
drop table if exists public.matches;
drop table if exists public.mentee_intake;
drop table if exists public.mentor_availability;
drop table if exists public.mentor_mentorship_areas;
drop table if exists public.mentor_embeddings;
drop table if exists public.mentors;

drop function if exists public.match_mentors;
drop function if exists public.queue_mentor_embedding();
