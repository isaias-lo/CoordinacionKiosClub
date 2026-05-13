-- Dynamic picker names list (replaces fixed 18-slot nombres map)
ALTER TABLE picker_config
  ADD COLUMN IF NOT EXISTS picker_nombres JSONB DEFAULT '[]';
