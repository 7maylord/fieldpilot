CREATE TABLE daily_reports (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE, report_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', current_revision INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, report_date)
);
CREATE TABLE daily_report_versions (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, report_id UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, content JSONB NOT NULL, source_references JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ,
  UNIQUE (report_id, revision)
);
CREATE TABLE report_reviews (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, version_id UUID NOT NULL REFERENCES daily_report_versions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')), comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE report_signatures (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, version_id UUID NOT NULL REFERENCES daily_report_versions(id) ON DELETE RESTRICT,
  signer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, media_id UUID NOT NULL REFERENCES media_objects(id) ON DELETE RESTRICT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (version_id, signer_id)
);
CREATE INDEX daily_reports_project_idx ON daily_reports(organization_id, project_id, status);
CREATE INDEX daily_report_versions_report_idx ON daily_report_versions(organization_id, report_id);
CREATE INDEX report_reviews_version_idx ON report_reviews(organization_id, version_id);
CREATE INDEX report_signatures_version_idx ON report_signatures(organization_id, version_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_reports, daily_report_versions, report_reviews, report_signatures TO fieldpilot_runtime;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['daily_reports','daily_report_versions','report_reviews','report_signatures'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
CREATE FUNCTION protect_report_version() RETURNS trigger AS $$ BEGIN
  IF TG_OP = 'DELETE' OR NEW.content IS DISTINCT FROM OLD.content OR NEW.source_references IS DISTINCT FROM OLD.source_references OR OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'daily report revisions are immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_report_version BEFORE UPDATE OR DELETE ON daily_report_versions
FOR EACH ROW EXECUTE FUNCTION protect_report_version();
CREATE FUNCTION reject_report_signature_changes() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION 'report signatures are immutable';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_report_signature BEFORE UPDATE OR DELETE ON report_signatures
FOR EACH ROW EXECUTE FUNCTION reject_report_signature_changes();
