-- 060 — Registro de actividad de bodega (trazabilidad "quién hizo qué"). Append-only.
-- Modelado sobre picking_eventos; la atribución (actor_id/actor_name) la estampa la API
-- (/api/actividad) desde el token verificado (verifyActor), NO el cliente → no se puede falsear.
create table if not exists public.actividad_bodega (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  fecha         date        not null default (timezone('utc', now()))::date,
  actor_id      uuid,
  actor_name    text,
  fuente        text        not null,   -- 'nacional' | 'rmcosta'
  accion        text        not null,   -- registrar_item | editar_item | eliminar_item | unificar | sumar | registrar_dia
  tienda_cod    text,
  tienda_nombre text,
  mensaje       text        not null,
  detalle       jsonb
);

create index if not exists idx_actividad_bodega_fecha  on public.actividad_bodega (fecha desc, created_at desc);
create index if not exists idx_actividad_bodega_actor  on public.actividad_bodega (actor_id);
create index if not exists idx_actividad_bodega_tienda on public.actividad_bodega (tienda_cod);

alter table public.actividad_bodega enable row level security;

-- Lectura para usuarios autenticados (feed + Realtime). Inserts sólo vía service role (API).
drop policy if exists actividad_bodega_select_auth on public.actividad_bodega;
create policy actividad_bodega_select_auth on public.actividad_bodega
  for select to authenticated using (true);

-- Feed en vivo.
alter publication supabase_realtime add table public.actividad_bodega;
