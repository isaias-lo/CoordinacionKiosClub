-- Sincronización: columna 'tipo' existe en producción pero nunca fue versionada en migraciones.
-- Fue agregada vía Supabase dashboard. Este archivo la documenta y aplica de forma idempotente.
ALTER TABLE picking_prints ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'P';
