CREATE TABLE sync_conflicts (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  device_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  local_value JSONB NOT NULL,
  server_value JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved')),
  resolution JSONB,
  resolved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (device_id, organization_id) REFERENCES sync_devices(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE sync_operations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  device_id UUID NOT NULL,
  client_operation_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation_type TEXT NOT NULL,
  base_version INTEGER,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'auto_merged', 'conflict', 'rejected')),
  rejection_code TEXT,
  conflict_id UUID REFERENCES sync_conflicts(id) ON DELETE SET NULL,
  client_created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  FOREIGN KEY (device_id, organization_id) REFERENCES sync_devices(id, organization_id) ON DELETE CASCADE,
  UNIQUE (organization_id, device_id, client_operation_id)
);

CREATE TABLE sync_checkpoints (
  token UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  device_id UUID NOT NULL,
  sequence BIGINT NOT NULL,
  project_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (device_id, organization_id) REFERENCES sync_devices(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE entity_change_log (
  sequence BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  project_id UUID,
  operation_type TEXT NOT NULL,
  version INTEGER,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sync_conflicts_org_status_idx ON sync_conflicts(organization_id, status, created_at);
CREATE INDEX sync_operations_org_received_idx ON sync_operations(organization_id, received_at);
CREATE INDEX sync_checkpoints_org_device_idx ON sync_checkpoints(organization_id, device_id, created_at);
CREATE INDEX entity_change_log_org_project_sequence_idx ON entity_change_log(organization_id, project_id, sequence);

GRANT SELECT, INSERT, UPDATE, DELETE ON sync_conflicts, sync_operations, sync_checkpoints, entity_change_log TO fieldpilot_runtime;
GRANT USAGE, SELECT ON SEQUENCE entity_change_log_sequence_seq TO fieldpilot_runtime;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['sync_conflicts', 'sync_operations', 'sync_checkpoints', 'entity_change_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
