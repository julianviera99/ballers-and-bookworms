-- Additional mentor profile columns not included in 007
alter table public.mentors
  add column gender           text,
  add column ethnicity        text,
  add column years_active     integer check (years_active > 0),
  add column position         text,
  add column career_highlights text,
  add column industry         text,
  add column current_city     text,
  add column current_state    text,
  add column gpa_range        text,
  add column graduate_school  text;

-- Public storage bucket for mentor profile photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mentor-photos',
  'mentor-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Mentors can upload to their own folder (path: <user_id>/...)
create policy "Mentors can upload own photo"
  on storage.objects for insert
  with check (
    bucket_id = 'mentor-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Anyone can view mentor photos (public bucket)
create policy "Anyone can view mentor photos"
  on storage.objects for select
  using (bucket_id = 'mentor-photos');

-- Mentors can replace their own photo
create policy "Mentors can update own photo"
  on storage.objects for update
  using (
    bucket_id = 'mentor-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Mentors can delete own photo"
  on storage.objects for delete
  using (
    bucket_id = 'mentor-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
