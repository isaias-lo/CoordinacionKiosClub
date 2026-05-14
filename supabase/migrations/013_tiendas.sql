-- Tabla maestra de tiendas (sincronizada con Google Sheets hoja TIENDAS)
create table if not exists tiendas (
  codigo          text        primary key,
  nombre          text        not null default '',
  direccion       text        not null default '',
  region          text        not null default '',
  sector_comuna   text        not null default '',
  corredor        text        not null default '',
  tipo            text        not null default '',
  ventana         text        not null default '',
  frecuencia      text        not null default '',
  prom_por_dia    text        not null default '',
  lat             float8,
  lon             float8,
  correos         text        not null default '',
  tel_encargado   text        not null default '',
  supervisor      text        not null default '',
  tel_supervisor  text        not null default '',
  transportista   text        not null default '',
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_tiendas_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists tiendas_updated_at on tiendas;
create trigger tiendas_updated_at
  before update on tiendas
  for each row execute function update_tiendas_updated_at();

-- RLS: authenticated users can read, only service role can write
alter table tiendas enable row level security;

create policy "Authenticated users can read tiendas"
  on tiendas for select to authenticated using (true);

create policy "Service role can manage tiendas"
  on tiendas for all to service_role using (true);
