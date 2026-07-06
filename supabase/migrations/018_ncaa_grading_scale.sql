-- Add grading_scale column to ncaa_approved_courses_cache.
-- Stores the school-specific numeric grade cutoffs scraped from the NCAA portal.
-- Example: { "A": 90, "B": 80, "C": 70, "D": 60 } (each value is the minimum score for that letter)
alter table public.ncaa_approved_courses_cache
  add column grading_scale jsonb default null;
