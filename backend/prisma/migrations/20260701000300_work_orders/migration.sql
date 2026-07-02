CREATE TABLE work_orders (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES locations(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  work_type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'assigned', 'accepted', 'in_progress', 'blocked', 'submitted', 'under_review', 'completed', 'cancelled')),
  planned_start TIMESTAMPTZ,
  planned_end TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  evidence_requirements JSONB NOT NULL DEFAULT '[]',
  completion_rules JSONB NOT NULL DEFAULT '{}',
  checklist_id UUID,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (id, organization_id),
  CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start)
);

CREATE TABLE work_order_assignments (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  work_order_id UUID NOT NULL,
  assignee_type TEXT NOT NULL CHECK (assignee_type IN ('user', 'team', 'crew', 'equipment')),
  assignee_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (work_order_id, organization_id) REFERENCES work_orders(id, organization_id) ON DELETE CASCADE,
  UNIQUE (work_order_id, assignee_type, assignee_id)
);

CREATE TABLE work_order_dependencies (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  work_order_id UUID NOT NULL,
  prerequisite_work_order_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (work_order_id, organization_id) REFERENCES work_orders(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (prerequisite_work_order_id, organization_id) REFERENCES work_orders(id, organization_id) ON DELETE CASCADE,
  UNIQUE (work_order_id, prerequisite_work_order_id),
  CHECK (work_order_id <> prerequisite_work_order_id)
);

CREATE INDEX work_orders_org_project_status_idx ON work_orders(organization_id, project_id, status);
CREATE INDEX work_orders_org_due_idx ON work_orders(organization_id, due_at);
CREATE INDEX work_order_assignments_assignee_idx ON work_order_assignments(organization_id, assignee_type, assignee_id);
CREATE INDEX work_order_dependencies_org_idx ON work_order_dependencies(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON work_orders, work_order_assignments, work_order_dependencies TO fieldpilot_runtime;

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['work_orders', 'work_order_assignments', 'work_order_dependencies'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)', table_name);
  END LOOP;
END $$;
