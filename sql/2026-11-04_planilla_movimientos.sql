-- La planilla de Picking: la foto del conteo al ASIGNAR, y las correcciones del coordinador.
-- Pedido de Erick el 03-04/11/2026.
--
-- ── POR QUÉ HACE FALTA GUARDAR ALGO ───────────────────────────────────────────────────────────
--
-- El coordinador pidió que la planilla registre «el número que ves en Odoo al asignar». Leer Odoo
-- en vivo NO lo cumple: el conteo BAJA cuando el picker valida, y las líneas se borran.
--
-- Medido el 03/11/2026 comparando los mismos 221 movimientos a dos horas de distancia:
-- 52 bajaron de registros y 0 subieron, todos en el salto `assigned → done`.
--
--   34SMB Comida      253 → 251
--   34SMB Chocolate    50 →  47
--   10TRQ Congelados   50 →  20
--
-- Y no se pueden recuperar: contar `stock.move` del picking sin filtrar estado devuelve el mismo
-- número reducido (251 líneas, todas `done`). Las líneas no quedan canceladas, desaparecen.
-- Por eso la foto hay que tomarla mientras el movimiento TODAVÍA está `assigned`.
--
-- ── QUIÉN ESCRIBE CADA COLUMNA ────────────────────────────────────────────────────────────────
--
-- Las columnas `*_odoo` son la FOTO del sistema y no se tocan nunca: se escriben una sola vez, la
-- primera vez que el servidor ve ese movimiento en estado `assigned`. Las otras son la CORRECCIÓN
-- del coordinador, y mandan sobre la foto cuando existen.
--
-- Están separadas a propósito. Es la misma lección de CRUCE PESOS, ya documentada en este
-- repositorio: cuando una columna que dice «medido» se llena con algo escrito a mano, se pierde la
-- capacidad de saber cuál era cuál. Acá el valor efectivo es `COALESCE(registros, registros_odoo)`
-- y los dos quedan a la vista.
--
-- ── DE DÓNDE SALE LA FOTO ─────────────────────────────────────────────────────────────────────
--
-- No hay tarea programada. La pantalla de Picking ya le pide a Odoo el día entero cada 3 minutos
-- mientras alguien la tiene abierta, y en el CD está abierta todo el día: la foto se escribe desde
-- esa consulta que ya ocurre, sin agregarle ni una llamada a Odoo.
--
-- Solo se fotografía lo que está en `assigned`. Un movimiento que nunca se vio asignado no tiene
-- fila acá y la planilla cae al número en vivo, marcándolo: es preferible a guardar el número de
-- después de validar bajo una columna que dice «al asignar».
--
-- RLS activo y SIN políticas, igual que `productos_bodega` y `rutas_despacho`: se lee y escribe
-- solo desde el servidor con service role.
--
-- Aditivo, se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.planilla_movimientos (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- El día de la HOJA (hora de Chile). Una tienda de apertura puede tener sus movimientos
  -- fechados otro día en Odoo; acá manda el día de la planilla en la que salen.
  fecha           date NOT NULL,

  -- La referencia de Odoo (`99REC/DT/146059`). NULL = línea agregada a mano por el coordinador,
  -- para algo que se pickeó y no quedó en Odoo.
  ref             text,

  cod             text NOT NULL CHECK (cod = upper(btrim(cod)) AND cod <> ''),
  seccion         text NOT NULL CHECK (seccion IN ('Comida', 'Aseo', 'Hogar', 'Chocolates')),

  -- ── La foto del sistema. Se escribe una vez y no se toca. ──
  registros_odoo  integer CHECK (registros_odoo IS NULL OR registros_odoo >= 0),
  picker_odoo     text,
  asignado_en     timestamptz,
  validado_en     timestamptz,
  capturado_en    timestamptz,

  -- ── La corrección del coordinador. NULL = no se corrigió. ──
  registros       integer CHECK (registros IS NULL OR registros >= 0),
  picker          text,
  editado_por     text,
  editado_en      timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Una línea a mano tiene que traer sus datos: sin `ref` no hay foto de Odoo de dónde sacarlos.
  CONSTRAINT planilla_movimientos_manual_completa
    CHECK (ref IS NOT NULL OR registros IS NOT NULL)
);

-- Una sola fila por movimiento de Odoo y día. Las líneas a mano (ref NULL) quedan fuera del
-- índice: puede haber varias en la misma celda.
CREATE UNIQUE INDEX IF NOT EXISTS planilla_movimientos_ref_uidx
  ON public.planilla_movimientos (fecha, ref) WHERE ref IS NOT NULL;

-- La planilla siempre se lee por día.
CREATE INDEX IF NOT EXISTS planilla_movimientos_fecha_idx
  ON public.planilla_movimientos (fecha);

ALTER TABLE public.planilla_movimientos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.planilla_movimientos IS
  'Planilla de Picking: foto del conteo al asignar (columnas *_odoo, inmutables) y correcciones '
  'del coordinador. El valor efectivo es COALESCE(registros, registros_odoo). RLS sin políticas: '
  'solo service role. Ver sql/2026-11-04_planilla_movimientos.sql para el porqué.';
