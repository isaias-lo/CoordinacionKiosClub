-- Peticiones de productos que faltan en `productos_bodega`. Pedido de Isaias del 20/10/2026:
-- «al escanear bultos, por ahora no están todos los códigos de los productos, los estamos agregando
-- de a poco. Si escanean y no está el producto aún en la base de datos, pedir petición para que se
-- agregue, y esa petición (con el nombre de la persona y el código del producto) que llegue a
-- /admin/sistema para ser agregado a la tabla».
--
-- En Bodega, «Escanear producto» con un código que no está ofrece «Pedir que se agregue». La
-- petición queda acá con lo leído y quién la pidió (el nombre sale de la sesión, en el servidor).
-- En /admin/sistema el administrador la ve, busca el código en Odoo y lo guarda: al guardar el
-- producto, sus peticiones pendientes pasan solas a 'agregado'. También puede descartarla.
--
-- Una sola petición PENDIENTE por código (índice único parcial sobre `llave`): si otra persona
-- escanea el mismo código, se suma a `veces` y queda como último en pedirlo, en vez de otra fila.
-- `llave` es el código como lo compara Bodega (`llaveBarcode` en productosBodega.ts: sin ceros a la
-- izquierda si es numérico, mayúsculas si tiene letras); `codigo` es lo que leyó la pistola.
--
-- RLS activo y SIN políticas, igual que `productos_bodega`: todo pasa por
-- `/api/productos-bodega/peticiones` con service role.
-- Aditivo, se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.productos_peticiones (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo            text NOT NULL CHECK (codigo = btrim(codigo) AND codigo <> ''),
  llave             text NOT NULL CHECK (llave <> ''),
  pedido_por        text NOT NULL,
  pedido_por_id     uuid,
  ultimo_pedido_por text,
  veces             integer NOT NULL DEFAULT 1 CHECK (veces >= 1),
  estado            text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'agregado', 'descartado')),
  resuelto_por      text,
  resuelto_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.productos_peticiones IS
  'Códigos que Bodega escaneó y no estaban en productos_bodega. Se atienden en /admin/sistema.';

ALTER TABLE public.productos_peticiones ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS productos_peticiones_pendiente_uidx
  ON public.productos_peticiones (llave) WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS productos_peticiones_estado_idx
  ON public.productos_peticiones (estado, created_at DESC);
