CREATE TABLE form_templates (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE TABLE form_versions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  template_id UUID NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  schema JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (template_id, organization_id) REFERENCES form_templates(id, organization_id) ON DELETE CASCADE,
  UNIQUE (template_id, version_number)
);

CREATE UNIQUE INDEX form_versions_one_draft_idx ON form_versions(template_id) WHERE status = 'draft';
CREATE INDEX form_templates_org_name_idx ON form_templates(organization_id, name);
CREATE INDEX form_versions_org_status_idx ON form_versions(organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON form_templates, form_versions TO fieldpilot_runtime;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['form_templates', 'form_versions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

CREATE FUNCTION reject_published_form_version_changes() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published form versions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_published_form_version
BEFORE UPDATE OR DELETE ON form_versions
FOR EACH ROW EXECUTE FUNCTION reject_published_form_version_changes();
