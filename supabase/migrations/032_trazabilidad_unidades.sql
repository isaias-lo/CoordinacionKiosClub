-- ─────────────────────────────────────────────────────────────────────────────
-- 032_trazabilidad_unidades.sql
-- Tabla central de trazabilidad por unidad logística (pallet / bulto / contenedor)
-- Espeja TRAZABILIDAD_ABASTECIMIENTO_PROD.
-- Se alimenta en 4 puntos del ciclo:
--   PUNTO 1 → Creación (despacho/santiago, despacho/regiones)
--   PUNTO 2 → Despacho / Salida del CD (conductor-hub)
--   PUNTO 3 → Recepción en Tienda (RecepcionTiendaScreen)
--   PUNTO 4 → Cierre de incidencia (panel supervisor)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trazabilidad_unidades (

  -- ── Identidad ─────────────────────────────────────────────────────
  id_unidad_logistica        TEXT         PRIMARY KEY,   -- canonical_id / barcode
  codigo_qr                  TEXT,                       -- código de barras legible
  url_qr                     TEXT,                       -- URL pública (toolskios.vercel.app/r/...)
  numero_guia                TEXT,                       -- folio DTE asociado
  tipo_unidad                TEXT         NOT NULL DEFAULT 'Pallet',
  -- 'Pallet' | 'Bulto' | 'Contenedor'
  origen                     TEXT,                       -- bodega / CD de origen

  -- ── Destino (caché desde tabla tiendas) ───────────────────────────
  codigo_tienda              TEXT         REFERENCES tiendas(codigo) ON DELETE SET NULL,
  tienda_destino             TEXT,
  tipo_tienda                TEXT,        -- 'Mall' | 'Stripcenter' | 'Supermercado' | 'Otro'
  comuna_destino             TEXT,
  region_destino             TEXT,
  direccion_tienda           TEXT,

  -- ── Logística ─────────────────────────────────────────────────────
  transportista              TEXT,
  tipo_carga                 TEXT,        -- 'Alimentos' | 'Hogar' | 'Mixto'
  regimen                    TEXT,        -- 'Seco' | 'Refrigerado' | 'Congelado'

  -- ── Dimensiones (opcionales, ingresadas en creación) ──────────────
  peso_kg                    NUMERIC(8,2),
  alto_cm                    INTEGER,
  ancho_cm                   INTEGER,
  largo_cm                   INTEGER,
  volumen_m3                 NUMERIC(8,4)
    GENERATED ALWAYS AS (
      CASE
        WHEN alto_cm IS NOT NULL AND ancho_cm IS NOT NULL AND largo_cm IS NOT NULL
        THEN ROUND((alto_cm::NUMERIC * ancho_cm::NUMERIC * largo_cm::NUMERIC) / 1000000, 4)
        ELSE NULL
      END
    ) STORED,

  -- ── Tiempos del ciclo de vida ──────────────────────────────────────
  fecha_hora_creacion        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  fecha_hora_despacho        TIMESTAMPTZ,           -- PUNTO 2
  fecha_tentativa_llegada    TIMESTAMPTZ,           -- calculada al crear
  ventana_horaria_recepcion  TEXT,                  -- ej: '08:00-12:00'
  fecha_hora_real_llegada    TIMESTAMPTZ,           -- PUNTO 3

  -- ── Indicadores de puntualidad (calculados por trigger) ───────────
  indicador_llegada_tiempo   TEXT,        -- 'OK' | 'TARDE'
  minutos_desfase            INTEGER,     -- negativo = llegó antes, positivo = tarde

  -- ── Temperatura ───────────────────────────────────────────────────
  temperatura_salida         NUMERIC(5,1),    -- °C al salir del CD (PUNTO 2)
  temperatura_llegada        NUMERIC(5,1),    -- °C al llegar a tienda (PUNTO 3)
  alerta_temperatura         TEXT,            -- 'OK' | 'ALERTA' | 'CRITICO'

  -- ── Estado del ciclo de vida ──────────────────────────────────────
  estado_actual              TEXT         NOT NULL DEFAULT 'CREADO',
  -- 'CREADO' | 'EN_RUTA' | 'RECIBIDO_CONFORME' | 'RECIBIDO_INCIDENCIA' | 'CERRADO'

  -- ── Usuarios del ciclo de vida ────────────────────────────────────
  usuario_creador            TEXT,
  usuario_despacho           TEXT,
  usuario_recepcion          TEXT,
  updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- ── Incidencia ────────────────────────────────────────────────────
  tipo_incidencia            TEXT,
  -- 'Faltante' | 'Daño' | 'Temperatura' | 'Sello roto' | 'Exceso' | 'Otro'
  descripcion_incidencia     TEXT,
  links_evidencia            TEXT[],      -- URLs de Supabase Storage
  estado_resolucion          TEXT,
  -- 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'RECHAZADO'
  observaciones              TEXT,

  -- ── Metadata operacional ──────────────────────────────────────────
  origen_carga               TEXT         NOT NULL DEFAULT 'manual',  -- 'manual' | 'masiva'
  reintentos_recepcion       INTEGER      NOT NULL DEFAULT 0,
  fecha_cierre               TIMESTAMPTZ,
  usuario_cierre             TEXT,

  -- ── FK al ecosistema ──────────────────────────────────────────────
  ruta_id                    BIGINT       REFERENCES rutas_despacho(id) ON DELETE SET NULL,
  recepcion_id               BIGINT       REFERENCES recepcion(id)      ON DELETE SET NULL
);

-- ── Índices ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_traz_codigo_tienda   ON trazabilidad_unidades(codigo_tienda);
CREATE INDEX IF NOT EXISTS idx_traz_ruta_id         ON trazabilidad_unidades(ruta_id);
CREATE INDEX IF NOT EXISTS idx_traz_estado_actual   ON trazabilidad_unidades(estado_actual);
CREATE INDEX IF NOT EXISTS idx_traz_fecha_creacion  ON trazabilidad_unidades(fecha_hora_creacion);
CREATE INDEX IF NOT EXISTS idx_traz_transportista   ON trazabilidad_unidades(transportista);
CREATE INDEX IF NOT EXISTS idx_traz_numero_guia     ON trazabilidad_unidades(numero_guia);
CREATE INDEX IF NOT EXISTS idx_traz_estado_resol    ON trazabilidad_unidades(estado_resolucion)
  WHERE estado_resolucion IS NOT NULL;

-- ── Trigger: auto-actualizar updated_at ───────────────────────────────
CREATE OR REPLACE FUNCTION trazabilidad_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trazabilidad_updated_at ON trazabilidad_unidades;
CREATE TRIGGER trazabilidad_updated_at
  BEFORE UPDATE ON trazabilidad_unidades
  FOR EACH ROW EXECUTE FUNCTION trazabilidad_set_updated_at();

-- ── Trigger: calcular indicadores de puntualidad y temperatura ────────
CREATE OR REPLACE FUNCTION trazabilidad_calcular_indicadores()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Puntualidad: se calcula cuando hay fecha real Y fecha tentativa
  IF NEW.fecha_hora_real_llegada IS NOT NULL AND NEW.fecha_tentativa_llegada IS NOT NULL THEN
    NEW.minutos_desfase := EXTRACT(EPOCH FROM (
      NEW.fecha_hora_real_llegada - NEW.fecha_tentativa_llegada
    ))::INTEGER / 60;
    NEW.indicador_llegada_tiempo := CASE
      WHEN NEW.minutos_desfase <= 0 THEN 'OK'
      ELSE 'TARDE'
    END;
  END IF;

  -- Alerta temperatura: solo para regimenes fríos
  IF NEW.temperatura_llegada IS NOT NULL AND NEW.regimen IN ('Refrigerado', 'Congelado') THEN
    NEW.alerta_temperatura := CASE
      WHEN NEW.regimen = 'Refrigerado' AND NEW.temperatura_llegada > 8   THEN 'CRITICO'
      WHEN NEW.regimen = 'Refrigerado' AND NEW.temperatura_llegada > 5   THEN 'ALERTA'
      WHEN NEW.regimen = 'Congelado'   AND NEW.temperatura_llegada > -12 THEN 'CRITICO'
      WHEN NEW.regimen = 'Congelado'   AND NEW.temperatura_llegada > -15 THEN 'ALERTA'
      ELSE 'OK'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trazabilidad_indicadores ON trazabilidad_unidades;
CREATE TRIGGER trazabilidad_indicadores
  BEFORE INSERT OR UPDATE ON trazabilidad_unidades
  FOR EACH ROW EXECUTE FUNCTION trazabilidad_calcular_indicadores();

-- ── Trigger: incrementar reintentos al reintentar recepción ───────────
CREATE OR REPLACE FUNCTION trazabilidad_incrementar_reintentos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Si ya estaba en RECIBIDO_INCIDENCIA y vuelve a recibirse → es un reintento
  IF OLD.estado_actual IN ('RECIBIDO_INCIDENCIA') AND
     NEW.estado_actual IN ('RECIBIDO_CONFORME', 'RECIBIDO_INCIDENCIA') THEN
    NEW.reintentos_recepcion := COALESCE(OLD.reintentos_recepcion, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trazabilidad_reintentos ON trazabilidad_unidades;
CREATE TRIGGER trazabilidad_reintentos
  BEFORE UPDATE ON trazabilidad_unidades
  FOR EACH ROW EXECUTE FUNCTION trazabilidad_incrementar_reintentos();

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE trazabilidad_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "traz_select_authenticated"
  ON trazabilidad_unidades FOR SELECT TO authenticated USING (true);

CREATE POLICY "traz_insert_any"
  ON trazabilidad_unidades FOR INSERT WITH CHECK (true);

CREATE POLICY "traz_update_any"
  ON trazabilidad_unidades FOR UPDATE USING (true);

-- ── Realtime ──────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE trazabilidad_unidades;
