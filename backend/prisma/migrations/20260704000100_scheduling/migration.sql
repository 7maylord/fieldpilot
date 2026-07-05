CREATE TABLE schedule_resources (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('user', 'team', 'equipment')),
  resource_id UUID NOT NULL,
  name TEXT NOT NULL,
  skills TEXT[] NOT NULL DEFAULT '{}',
  project_ids UUID[] NOT NULL DEFAULT '{}',
  shifts JSONB NOT NULL DEFAULT '[]',
  blackouts JSONB NOT NULL DEFAULT '[]',
  travel_speed_kph INTEGER NOT NULL DEFAULT 40 CHECK (travel_speed_kph BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, resource_type, resource_id)
);
CREATE INDEX schedule_resources_org_type_idx ON schedule_resources(organization_id, resource_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_resources TO fieldpilot_runtime;
ALTER TABLE schedule_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON schedule_resources
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
