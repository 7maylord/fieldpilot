CREATE TABLE defects (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL, location_id UUID, inspection_id UUID, work_order_id UUID,
  category TEXT NOT NULL, severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL, description TEXT, due_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'reported',
  version INTEGER NOT NULL DEFAULT 1, created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, organization_id) REFERENCES projects(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (inspection_id) REFERENCES inspections(id) ON DELETE RESTRICT,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE RESTRICT
);
CREATE TABLE defect_assignments (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, defect_id UUID NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('user','team','external')), assignee_id UUID NOT NULL,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (defect_id, assignee_type, assignee_id)
);
CREATE TABLE defect_corrections (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, defect_id UUID NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
  root_cause TEXT NOT NULL, corrective_action TEXT NOT NULL, evidence_ids UUID[] NOT NULL CHECK (cardinality(evidence_ids) > 0),
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE defect_verifications (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, correction_id UUID NOT NULL REFERENCES defect_corrections(id) ON DELETE RESTRICT,
  verifier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT, decision TEXT NOT NULL CHECK (decision IN ('verified','rejected')),
  comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE defect_status_events (
  id UUID PRIMARY KEY, organization_id UUID NOT NULL, defect_id UUID NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX defects_project_status_idx ON defects(organization_id, project_id, status);
CREATE INDEX defects_due_idx ON defects(organization_id, due_at);
CREATE INDEX defect_assignments_assignee_idx ON defect_assignments(organization_id, assignee_id);
CREATE INDEX defect_corrections_defect_idx ON defect_corrections(organization_id, defect_id);
CREATE INDEX defect_verifications_correction_idx ON defect_verifications(organization_id, correction_id);
CREATE INDEX defect_status_events_defect_idx ON defect_status_events(organization_id, defect_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON defects, defect_assignments, defect_corrections, defect_verifications, defect_status_events TO fieldpilot_runtime;
DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['defects','defect_assignments','defect_corrections','defect_verifications','defect_status_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
CREATE FUNCTION reject_defect_correction_changes() RETURNS trigger AS $$ BEGIN
  RAISE EXCEPTION 'defect correction evidence is immutable';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_defect_correction BEFORE UPDATE OR DELETE ON defect_corrections
FOR EACH ROW EXECUTE FUNCTION reject_defect_correction_changes();
