-- 12/11/2026 · Día cuya carga lleva un manifiesto de 2ª vuelta.
--
-- Un camión de 2ª vuelta se cierra hoy (`fecha` = hoy) pero lleva lo que Bodega registró el día de
-- ORIGEN. Sin este dato Bodega pintaba «Cargada en …» a la tienda de HOY con el mismo código, con su
-- carga todavía en el piso. Nulo = la carga es la de `fecha` (1ª vuelta y congelados).
-- Ver src/features/despacho/shared/cargaEnCamion.ts.

alter table public.rutas_despacho add column if not exists fecha_origen date;

create index if not exists rutas_despacho_fecha_origen_idx
  on public.rutas_despacho (fecha_origen) where fecha_origen is not null;
