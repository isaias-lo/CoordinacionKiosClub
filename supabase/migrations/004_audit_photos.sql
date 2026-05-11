-- ============================================================
-- Phase 4: Audit photos
-- ============================================================

-- Add foto_url column to existing audit_entries table
alter table public.audit_entries
  add column if not exists foto_url text;

-- Storage bucket for audit photos (public read)
insert into storage.buckets (id, name, public)
values ('audit-photos', 'audit-photos', true)
on conflict (id) do nothing;

-- Authenticated users can upload photos
create policy "audit_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'audit-photos'
    and auth.role() = 'authenticated'
  );

-- Anyone can view photos (public bucket)
create policy "audit_photos_select" on storage.objects
  for select using (bucket_id = 'audit-photos');

-- Users can delete their own photos
create policy "audit_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'audit-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
