-- Add conductor, pionetas, codigo_verificacion and fuente to recepcion table
-- fuente distinguishes 'conductor' (Entrega a Tienda) vs 'tienda' (Recepcion/Tienda ctrl interno)
alter table public.recepcion
  add column if not exists conductor            text default '',
  add column if not exists pionetas             text default '',
  add column if not exists codigo_verificacion  text default '',
  add column if not exists fuente               text default 'conductor';
