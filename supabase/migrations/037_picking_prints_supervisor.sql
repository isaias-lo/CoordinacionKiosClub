-- Agrega responsable de impresión para historial de actividad por supervisor
ALTER TABLE picking_prints ADD COLUMN IF NOT EXISTS printed_by_name text;
