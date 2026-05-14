-- Add error_foto_urls column to audit_entries
alter table audit_entries
  add column if not exists error_foto_urls jsonb default '[]';
