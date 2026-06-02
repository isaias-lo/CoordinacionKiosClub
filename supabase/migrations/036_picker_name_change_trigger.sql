-- Atomic audit logging for picker name changes via Postgres trigger.
-- Replaces the manual SELECT→UPSERT→INSERT pattern in the API route,
-- eliminating the race condition where two concurrent editors produce
-- incorrect "old_name" in the audit trail.

CREATE OR REPLACE FUNCTION log_picker_name_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    INSERT INTO picker_name_changes (picker_key, old_name, new_name, changed_by_name, changed_at)
    VALUES (NEW.key, COALESCE(OLD.display_name, ''), NEW.display_name, NEW.updated_by_name, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_picker_name_change
  AFTER UPDATE ON picker_canonical_names
  FOR EACH ROW EXECUTE FUNCTION log_picker_name_change();

-- Also log deletions as "new_name = ''"
CREATE OR REPLACE FUNCTION log_picker_name_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.display_name IS NOT NULL AND OLD.display_name <> '' THEN
    INSERT INTO picker_name_changes (picker_key, old_name, new_name, changed_by_name, changed_at)
    VALUES (OLD.key, OLD.display_name, '', '', now());
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER trg_picker_name_delete
  AFTER DELETE ON picker_canonical_names
  FOR EACH ROW EXECUTE FUNCTION log_picker_name_delete();
