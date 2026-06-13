-- Add nombre and ventana to ruta_tiendas so the public QR page can show store names
ALTER TABLE ruta_tiendas
  ADD COLUMN IF NOT EXISTS nombre  text,
  ADD COLUMN IF NOT EXISTS ventana text;
