-- Productos de Odoo para pesar bultos en Bodega. Pedido de Isaias del 19/10/2026.
-- Aplicado en la base de pruebas (kiosclub-pruebas) el 19/10/2026. Producción: pendiente de su OK.
--
-- En /admin/sistema se busca un producto en Odoo por su código y, si es el correcto, se guarda acá
-- con su nombre, código de barras, peso y medidas. En Bodega, al pesar un bulto, la handheld
-- escanea el código de barras del producto, lo busca en esta tabla y calcula el peso del bulto con
-- peso unitario × cantidad. El bulto sigue contando como un bulto.
--
-- RLS activo y SIN políticas, a propósito: se lee y escribe solo desde `/api/productos-bodega`, en el
-- servidor, con service role (la escritura, solo administradores). Mismo modelo que `rutas_despacho`.
-- Aditivo, se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.productos_bodega (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo      text NOT NULL UNIQUE CHECK (codigo = upper(btrim(codigo)) AND codigo <> ''),
  odoo_id     integer,
  barcode     text,
  nombre      text NOT NULL,
  peso_kg     numeric(10, 3) CHECK (peso_kg IS NULL OR peso_kg >= 0),
  alto_cm     numeric(10, 2) CHECK (alto_cm IS NULL OR alto_cm >= 0),
  ancho_cm    numeric(10, 2) CHECK (ancho_cm IS NULL OR ancho_cm >= 0),
  largo_cm    numeric(10, 2) CHECK (largo_cm IS NULL OR largo_cm >= 0),
  creado_por  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.productos_bodega IS
  'Productos traídos de Odoo desde /admin/sistema. Bodega los busca por código de barras para pesar bultos.';

ALTER TABLE public.productos_bodega ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS productos_bodega_barcode ON public.productos_bodega (barcode);
