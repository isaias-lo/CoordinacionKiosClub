-- [Config · Nombres de pickers] Dos correcciones de `picker_canonical_names`, pedidas por el
-- coordinador el 18/11/2026. Solo DATOS: no toca el esquema.
--
-- ── 1. «Haisenberg» estaba mal escrito ────────────────────────────────────────────────────────
--
-- La tabla tiene `Congelado 2` → «Haisenberg» con N. La hoja «Abastecimiento por Olas» lo escribe
-- «Haisemberg Garmendia» con M en las 260 filas de octubre en que aparece, y el coordinador lo
-- confirmó: «el nombre es Haisemberg».
--
-- Hoy no rompe nada —`Congelado 2` no tuvo movimientos en noviembre y su `nombre_olas` está en
-- NULL, así que el registro de olas la salta— pero es el nombre de una persona y sale impreso en
-- la etiqueta de Picking.
--
-- ── 2. «Sofía Leonor Sánchez Roiatti» no existía en la tabla ──────────────────────────────────
--
-- Es una cuenta de Odoo con trabajo real que no estaba en la lista de pickers, así que Estadísticas
-- la dejaba fuera de la tabla y la contaba en el aviso de «operaciones fuera de la lista». Medido:
--
--     octubre 2026 ....... 11 movimientos ·  1.790 unidades aprox. en 11 filas de la hoja
--     noviembre 1 al 16 ..  2 movimientos ·  1.790 unidades ·  3,0 h de reloj
--
-- OJO: NO es la misma cuenta que `Sofia Sanchez`, que ya está en la tabla y también sin nombre.
-- Son dos cuentas distintas de Odoo.
--
-- Se agrega SIN `display_name` a propósito. Es una cuenta compartida y la hoja de la jefatura le
-- pone dos nombres distintos en el mismo octubre:
--
--     «BASTIAN VALDES» .... 16 filas
--     «DANNAE ABARCA» .....  1 fila
--
-- Poner uno de los dos sería elegir por el coordinador. Sin nombre, la cuenta aparece en
-- Configuración como «Sin asignar» —que es un estado normal, ver `ajustes/nombresDePicker.ts`— y
-- en Estadísticas con su nombre de Odoo, y él escribe la persona cuando lo decida.
--
-- `nombre_olas` queda en NULL por la misma razón: un nombre que nadie confirmó no se adivina, y el
-- registro de olas salta la fila y lo informa. Ver `sql/2026-11-06_nombre_olas.sql`.
--
-- ── IDEMPOTENTE ───────────────────────────────────────────────────────────────────────────────
--
-- El UPDATE solo toca la fila si todavía dice «Haisenberg», y el INSERT no pisa nada si la clave
-- ya está. Correrlo dos veces no cambia nada la segunda vez.

update picker_canonical_names
   set display_name = 'Haisemberg',
       updated_by_name = 'corrección de grafía · 18/11/2026',
       updated_at = now()
 where key = 'Congelado 2'
   and display_name = 'Haisenberg';

insert into picker_canonical_names (key, display_name, updated_by_name)
values ('Sofía Leonor Sánchez Roiatti', '', 'agregada desde el análisis del bono · 18/11/2026')
on conflict (key) do nothing;
