-- La planilla de Picking: las correcciones a mano del coordinador.
-- Pedido de Erick el 03-04/11/2026.
--
-- ── QUÉ GUARDA Y QUÉ NO ───────────────────────────────────────────────────────────────────────
--
-- La hoja se arma leyendo Odoo en vivo. Acá SOLO vive lo que el coordinador corrige a mano, más
-- las líneas que agrega para algo que se pickeó y no quedó en Odoo.
--
-- Decidido el 04/11/2026: **la hoja se queda con lo VALIDADO**, que es lo que la persona
-- efectivamente hizo. Por eso no hay captura automática de nada.
--
-- ── POR QUÉ ESTUVO A PUNTO DE SER OTRA COSA ───────────────────────────────────────────────────
--
-- Primero se midió que el conteo de registros BAJA al validar —52 de 221 movimientos el 03/11, 0
-- subieron— y se concluyó que las líneas se borraban y había que fotografiar el número mientras el
-- movimiento estaba asignado. Esa conclusión estaba incompleta: **las líneas no se borran, se
-- mudan a un backorder**. Comprobado en 34SMB del 03/11:
--
--   99REC/DT/146140  done    251 líneas
--   99REC/DT/146421  cancel    4 líneas   backorder_id = 146140
--
-- Odoo valida lo que se pickeó y manda el resto a un movimiento nuevo, que aparece en la hoja como
-- otra línea pendiente. No se pierde nada, y el número de lo validado es el correcto.
--
-- ── QUIÉN ESCRIBE CADA COLUMNA ────────────────────────────────────────────────────────────────
--
-- Las columnas `*_odoo` guardan **lo que Odoo decía en el momento de corregir**, y no se tocan
-- después. Las otras son la corrección, y mandan sobre ellas — también en los KPI, porque si se
-- corrige es porque Odoo estaba equivocado.
--
-- Están separadas a propósito. Es la lección de CRUCE PESOS, ya documentada en este repositorio:
-- cuando una columna que dice «medido» se llena con algo escrito a mano, se pierde la capacidad de
-- saber cuál era cuál. Acá el valor efectivo es `COALESCE(registros, registros_odoo)` y los dos
-- quedan a la vista.
--
-- RLS activo y SIN políticas, igual que `productos_bodega` y `rutas_despacho`: se lee y escribe
-- solo desde el servidor con service role.
--
-- Aditivo, se puede correr más de una vez. APLICADO en producción (epiwlmegimfftivqzzup) el
-- 04/11/2026, con el control de `max(date)` para confirmar que era el proyecto vivo.

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

  -- ── Lo que Odoo decía al momento de corregir. Se escribe una vez y no se toca. ──
  registros_odoo  integer CHECK (registros_odoo IS NULL OR registros_odoo >= 0),
  picker_odoo     text,
  asignado_en     timestamptz,
  validado_en     timestamptz,
  capturado_en    timestamptz,   -- cuándo se leyó de Odoo lo de arriba

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
