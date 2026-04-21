-- =============================================================================
-- Transcripts Storage Bucket
-- Private bucket for student transcript uploads (PDFs and images).
-- Athletes can upload and read their own files.
-- Staff can read all files (for eligibility review).
-- The edge function uses service_role to read files — no extra policy needed.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transcripts',
  'transcripts',
  false,
  10485760,   -- 10 MB
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do nothing;

-- Athletes upload under their own user_id prefix: {user_id}/{timestamp}_transcript.ext
create policy "Users can upload own transcripts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'transcripts'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Users can read own transcripts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'transcripts'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "Staff can read all transcripts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'transcripts'
    and public.is_staff()
  );
