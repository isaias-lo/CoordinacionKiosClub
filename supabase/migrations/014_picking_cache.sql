-- Cache para respuestas costosas de Odoo (picking_today_operations, picking_today_all, get_picker_stats)
-- TTL configurable por fila; el API route lee si cache_key+fecha coinciden y aún no expiró.
create table if not exists picking_cache (
  cache_key   text        not null,
  cached_date date        not null default current_date,
  payload     jsonb       not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (cache_key, cached_date)
);

-- Limpia automáticamente filas expiradas para no crecer indefinidamente
create or replace function delete_expired_picking_cache()
returns trigger language plpgsql as $$
begin
  delete from picking_cache where expires_at < now();
  return new;
end;
$$;

drop trigger if exists picking_cache_cleanup on picking_cache;
create trigger picking_cache_cleanup
  after insert on picking_cache
  for each statement execute function delete_expired_picking_cache();

-- RLS: solo service_role escribe; authenticated puede leer
alter table picking_cache enable row level security;

create policy "Authenticated can read cache"
  on picking_cache for select to authenticated using (true);

create policy "Service role manages cache"
  on picking_cache for all to service_role using (true);
