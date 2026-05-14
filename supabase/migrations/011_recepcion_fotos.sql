-- Add new columns to recepcion table
alter table recepcion
  add column if not exists observaciones   text    default '',
  add column if not exists sello_estado    text    default '',
  add column if not exists sello_foto_url  text    default '',
  add column if not exists estado_fotos    jsonb   default '[]';

-- Storage bucket for reception photos (run in Supabase Dashboard > Storage if not exists)
-- insert into storage.buckets (id, name, public) values ('recepcion-fotos', 'recepcion-fotos', true)
-- on conflict (id) do nothing;

-- Storage policies for recepcion-fotos bucket
-- (run in Supabase Dashboard > Storage > recepcion-fotos > Policies)
--
-- Policy: Allow authenticated uploads
-- create policy "Authenticated users can upload reception photos"
-- on storage.objects for insert to authenticated
-- with check (bucket_id = 'recepcion-fotos');
--
-- Policy: Public read
-- create policy "Public read reception photos"
-- on storage.objects for select to public
-- using (bucket_id = 'recepcion-fotos');
