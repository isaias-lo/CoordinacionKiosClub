-- picker_name_changes: GET /api/picker-name-changes filters by changed_at range — full scan without index
CREATE INDEX IF NOT EXISTS picker_name_changes_changed_at
  ON picker_name_changes (changed_at DESC);

-- picking_prints: GET /api/picking-prints filters by date — full scan without index
CREATE INDEX IF NOT EXISTS picking_prints_date
  ON picking_prints (date);
