CREATE TABLE media_objects (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 104857600),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'processing', 'ready', 'rejected', 'quarantined')),
  scan_status TEXT NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'clean', 'infected', 'failed')),
  immutable_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id)
);

CREATE TABLE media_upload_sessions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  media_id UUID NOT NULL,
  multipart_upload_id TEXT NOT NULL,
  part_size INTEGER NOT NULL,
  total_parts INTEGER NOT NULL,
  completed_parts JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (media_id, organization_id) REFERENCES media_objects(id, organization_id) ON DELETE CASCADE
);

CREATE TABLE media_links (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  media_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (media_id, organization_id) REFERENCES media_objects(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (media_id, entity_type, entity_id)
);

CREATE TABLE media_derivatives (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  source_media_id UUID NOT NULL,
  derivative_media_id UUID NOT NULL,
  derivative_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (source_media_id, organization_id) REFERENCES media_objects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (derivative_media_id, organization_id) REFERENCES media_objects(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (source_media_id, derivative_type)
);

CREATE INDEX media_objects_org_project_status_idx ON media_objects(organization_id, project_id, status);
CREATE INDEX media_upload_sessions_org_status_idx ON media_upload_sessions(organization_id, status, expires_at);
CREATE INDEX media_links_entity_idx ON media_links(organization_id, entity_type, entity_id);
CREATE INDEX media_derivatives_org_idx ON media_derivatives(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON media_objects, media_upload_sessions, media_links, media_derivatives TO fieldpilot_runtime;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['media_objects', 'media_upload_sessions', 'media_links', 'media_derivatives'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

CREATE FUNCTION reject_immutable_media_changes() RETURNS trigger AS $$
BEGIN
  IF OLD.immutable_at IS NOT NULL AND (NEW.object_key, NEW.sha256, NEW.byte_size, NEW.mime_type) IS DISTINCT FROM (OLD.object_key, OLD.sha256, OLD.byte_size, OLD.mime_type) THEN
    RAISE EXCEPTION 'submitted evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_media_object BEFORE UPDATE ON media_objects
FOR EACH ROW EXECUTE FUNCTION reject_immutable_media_changes();

CREATE FUNCTION reject_media_link_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'evidence links are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_media_link BEFORE UPDATE OR DELETE ON media_links
FOR EACH ROW EXECUTE FUNCTION reject_media_link_changes();
