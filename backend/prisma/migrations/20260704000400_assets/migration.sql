CREATE TABLE asset_types (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE TABLE assets (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_type_id UUID NOT NULL REFERENCES asset_types(id) ON DELETE RESTRICT, location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL, qr_code TEXT NOT NULL, serial_number TEXT, model TEXT, manufacturer TEXT,
  status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, qr_code)
);
CREATE TABLE meter_readings (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  meter_type TEXT NOT NULL, value NUMERIC(18,4) NOT NULL, unit TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL, recorded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE inspections ADD COLUMN asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT;
ALTER TABLE defects ADD COLUMN asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT;
CREATE INDEX assets_project_status_idx ON assets(organization_id, project_id, status);
CREATE INDEX meter_readings_asset_idx ON meter_readings(organization_id, asset_id, meter_type, recorded_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_types, assets, meter_readings TO fieldpilot_runtime;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['asset_types','assets','meter_readings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
CREATE FUNCTION reject_meter_reading_changes() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION 'meter readings are append-only';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_meter_reading BEFORE UPDATE OR DELETE ON meter_readings
FOR EACH ROW EXECUTE FUNCTION reject_meter_reading_changes();
