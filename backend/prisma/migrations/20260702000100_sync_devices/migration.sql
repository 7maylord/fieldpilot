CREATE TABLE sync_devices (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  app_version TEXT NOT NULL,
  package_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  purge_requested_at TIMESTAMPTZ,
  purge_reason TEXT CHECK (purge_reason IN ('remote_revoke', 'package_expired', 'admin_request')),
  purge_acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE INDEX sync_devices_org_user_idx ON sync_devices(organization_id, user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON sync_devices TO fieldpilot_runtime;
ALTER TABLE sync_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sync_devices
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
