CREATE TABLE inspections (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  work_order_id UUID,
  form_version_id UUID NOT NULL,
  inspector_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  inspection_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'clarification_requested', 'rejected', 'approved')),
  draft_answers JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (work_order_id, organization_id) REFERENCES work_orders(id, organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (form_version_id, organization_id) REFERENCES form_versions(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (id, organization_id)
);

CREATE TABLE form_submissions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  inspection_id UUID NOT NULL,
  form_version_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  answers JSONB NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('passed', 'passed_with_observations', 'failed', 'incomplete', 'not_applicable')),
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (inspection_id, organization_id) REFERENCES inspections(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (form_version_id, organization_id) REFERENCES form_versions(id, organization_id) ON DELETE RESTRICT,
  UNIQUE (inspection_id, revision),
  UNIQUE (id, organization_id)
);

CREATE TABLE inspection_reviews (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  inspection_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'clarification')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (inspection_id, organization_id) REFERENCES inspections(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id, organization_id) REFERENCES form_submissions(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX inspections_org_project_status_idx ON inspections(organization_id, project_id, status);
CREATE INDEX form_submissions_org_submitted_idx ON form_submissions(organization_id, submitted_at);
CREATE INDEX inspection_reviews_org_inspection_idx ON inspection_reviews(organization_id, inspection_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON inspections, form_submissions, inspection_reviews TO fieldpilot_runtime;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['inspections', 'form_submissions', 'inspection_reviews'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;

CREATE FUNCTION reject_submission_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'submitted form evidence is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_form_submission BEFORE UPDATE OR DELETE ON form_submissions
FOR EACH ROW EXECUTE FUNCTION reject_submission_changes();
