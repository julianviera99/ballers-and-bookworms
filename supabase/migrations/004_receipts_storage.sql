-- Private bucket for receipt uploads (5 MB limit, images + PDF only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- Path convention: receipts/<user_id>/<filename>
-- (storage.foldername returns the path segments as an array; index [1] is the first folder)

-- Students: upload only to their own folder
create policy "Users can upload own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Students: read their own receipts; staff can read all
create policy "Users and staff can read receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff()
    )
  );
