-- Panel Conductor — fundaciones de datos (Fase 0)
--
-- Contexto: hoy cerrar un camión en el Enrutador NO deja la ruta lista para el chofer — falta
-- que el coordinador ADEMÁS presione "Guardar" dentro de <ManifiestoPanel>, sin ningún aviso si
-- se olvida (ver ManifiestoPanel.tsx, ahora con auto-guardado). Esta migración agrega lo que ese
-- auto-guardado y el nuevo flujo de entrega del chofer necesitan.
--
-- Aditivo, idempotente. Se puede correr más de una vez.

-- `tipo` decide qué fotos pedir por parada (temperatura si congelado, sello+pallets si seco).
-- Se graba en la RUTA al momento del cierre (desde `flota_vehiculos.refrigerado`), NO se re-deriva
-- del vehículo cada vez que se consulta — un camión refrigerado puede llevar carga seca ese día,
-- y el coordinador puede corregirlo a mano si hace falta.
alter table rutas_despacho add column if not exists tipo text not null default 'seco';

-- Registro de entrega POR PARADA: fotos y hora real de entrega. `estado_entrega` ya existía pero
-- hasta ahora solo se escribía a nivel de RUTA completa (ver PATCH /api/rutas-despacho, que pone
-- el mismo estado a todas las filas de `ruta_tiendas` de una ruta) — estas columnas se escriben
-- por PARADA individual desde el nuevo flujo del chofer en /conductor-hub.
alter table ruta_tiendas add column if not exists foto_urls text[] default '{}';
alter table ruta_tiendas add column if not exists hora_entrega timestamptz;

-- Bucket para las fotos de entrega del chofer (sello + pallets en ruta seca; temperatura del
-- camión + foto de la entrega en congelados). Separado de `recepcion-fotos`: es un caso de uso
-- distinto (prueba de entrega de CUALQUIER ruta, no el flujo de recepción-con-OTP de una tienda
-- puntual) y mezclar convenciones de nombre de archivo en el mismo bucket es fuente de bugs.
insert into storage.buckets (id, name, public)
values ('entrega-fotos', 'entrega-fotos', true)
on conflict (id) do nothing;

-- Misma policy que ya se corrigió para recepcion-fotos (sql/2026-09-11_recepcion_fotos_insert.sql):
-- sin esto, Supabase deniega por defecto el INSERT en storage.objects y la subida directa desde el
-- teléfono del chofer falla en silencio.
drop policy if exists entrega_fotos_insert on storage.objects;
create policy entrega_fotos_insert on storage.objects
  for insert to public
  with check (bucket_id = 'entrega-fotos' and auth.role() = 'authenticated');
