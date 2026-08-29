-- [E8] Quién transporta cada zona, y si se rutea o se consolida.
--
-- Nace del traspaso del sur a Luis Fica (lunes 31/08/2026). Hasta ahora el motor deducía el
-- transportista del historial, y el historial está en plena migración: Falabella hacía todo
-- Regiones a través de Ortiz y otros, y ahora Luis Fica —que ya hace todo Santiago— tomó el
-- sur completo. El norte (Antofagasta ×2, La Serena ×2) sigue con Falabella, y más adelante
-- también pasaría.
--
-- Con esto, mover una zona de un transportista a otro es cambiar UNA FILA, sin deploy.
--
-- `modo` distingue las dos cosas que hoy se mezclan en el tablero:
--   'ruta'          → se calcula recorrido, orden de paradas, ventanas y kilómetros.
--   'consolidacion' → solo se asigna transportista. Un camión puede consolidar La Serena y
--                     Castro, que están en puntas opuestas: no es un recorrido, y mostrarle
--                     kilómetros al coordinador infla el total del día sin significar nada.
--
-- `orden` refleja cómo se arma en la operación: lo más lejano se carga primero y sale más
-- temprano — primero Regiones, después Costa los días que se arma, y Santiago al final.

create table if not exists public.zonas_transporte (
  zona      text primary key check (zona in ('santiago','costa','sur','norte')),
  modo      text not null    check (modo in ('ruta','consolidacion')),
  empresas  text[] not null default '{}',
  orden     int  not null default 99,
  activo    boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.zonas_transporte is
  'Qué empresa transporta cada zona y si se rutea o se consolida. Editable desde Config. Tiendas.';

-- La semilla es el estado de HOY (29/08), no el del lunes: el sur está repartido — las seis
-- ya traspasadas (Machalí, Talca, Chillán, El Trébol, San Pedro ×2) van con Luis Fica y el
-- resto sigue con Falabella. Verificado en el despacho del 28/08, donde Panguipulli salió en
-- un camión de Falabella.
--
--   EL LUNES 31/08, cuando Luis Fica tome todo el sur, se ejecuta:
--     update public.zonas_transporte set empresas = array['Luis Fica'] where zona = 'sur';
--   o se cambia desde Config. Tiendas, que es para lo que existe esta tabla.
insert into public.zonas_transporte (zona, modo, empresas, orden) values
  ('sur',      'consolidacion', array['Luis Fica','Falabella'], 1),
  ('norte',    'consolidacion', array['Falabella','Ortiz'],      2),
  ('costa',    'ruta',          array['Luis Fica','Kios Club'],  3),
  ('santiago', 'ruta',          array['Luis Fica','Kios Club'],  4)
on conflict (zona) do nothing;

alter table public.zonas_transporte enable row level security;

drop policy if exists "zonas_transporte_select" on public.zonas_transporte;
create policy "zonas_transporte_select" on public.zonas_transporte for select using (true);
