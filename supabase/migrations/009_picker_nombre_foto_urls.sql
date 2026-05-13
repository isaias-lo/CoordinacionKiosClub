-- picker_nombre: nombre real del armador de pallet (seleccionado por auditor)
-- foto_urls: array de URLs de fotos de productos (permite múltiples fotos)
ALTER TABLE audit_entries
  ADD COLUMN IF NOT EXISTS picker_nombre TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS foto_urls JSONB DEFAULT '[]';
