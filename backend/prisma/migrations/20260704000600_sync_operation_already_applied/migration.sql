ALTER TABLE sync_operations DROP CONSTRAINT sync_operations_status_check;
ALTER TABLE sync_operations ADD CONSTRAINT sync_operations_status_check
  CHECK (status IN ('applied', 'auto_merged', 'conflict', 'rejected', 'already_applied'));
